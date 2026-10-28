-- =====================================================================
--  RENTABILIDAD — ventas netas, kardex unificado y valor de stock por fecha
--  Correr completo en Supabase > SQL Editor (antes del push).
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) ventas.neto: importe sin IVA. Se completa solo al insertar/actualizar.
--    - Con comprobante: neto del comprobante (con el signo de la venta: NC negativa).
--    - Sin comprobante (mostrador): precio / 1.21.
-- ---------------------------------------------------------------------
alter table public.ventas add column if not exists neto numeric;

create or replace function public.ventas_completar_neto() returns trigger language plpgsql as $$
declare v_neto numeric;
begin
  if new.neto is null or (tg_op = 'UPDATE' and (new.precio is distinct from old.precio or new.comprobante_id is distinct from old.comprobante_id)) then
    if new.comprobante_id is not null then
      select c.neto into v_neto from public.comprobantes c where c.id = new.comprobante_id;
    end if;
    if v_neto is not null then
      new.neto := round(sign(coalesce(new.precio, 0)) * abs(v_neto), 2);
      if new.precio = 0 then new.neto := 0; end if;
    else
      new.neto := round(coalesce(new.precio, 0) / 1.21, 2);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_ventas_neto on public.ventas;
create trigger trg_ventas_neto before insert or update of precio, comprobante_id, neto on public.ventas
  for each row execute function public.ventas_completar_neto();

-- Backfill de todo lo histórico con la misma regla
update public.ventas v set neto = round(sign(coalesce(v.precio,0)) * abs(c.neto), 2)
from public.comprobantes c where c.id = v.comprobante_id and v.neto is null and c.neto is not null;
update public.ventas set neto = round(coalesce(precio,0) / 1.21, 2) where neto is null;

-- ---------------------------------------------------------------------
-- 2) Kardex unificado: stock_movimientos + ajustes_stock sin duplicar
--    (misma regla de deduplicación que vista_inconsistencias_stock)
-- ---------------------------------------------------------------------
create or replace view public.vista_kardex with (security_invoker = true) as
  select sm.stock_id, sm.fecha,
         case when sm.tipo = 'entrada' then sm.cantidad else -sm.cantidad end as delta
  from public.stock_movimientos sm
  union all
  select aj.stock_id, aj.fecha,
         case when aj.tipo = 'entrada' then aj.cantidad else -aj.cantidad end
  from public.ajustes_stock aj
  where not exists (
    select 1 from public.stock_movimientos sm
    where sm.stock_id = aj.stock_id and sm.fecha = aj.fecha and sm.cantidad = aj.cantidad and sm.tipo = aj.tipo
      and (sm.pendiente_nc = true or sm.descripcion = aj.nota
           or (sm.comprobante_compra_id is not null and sm.comprobante_compra_id = aj.comprobante_compra_id))
  );

-- ---------------------------------------------------------------------
-- 3) Valor del stock (a costo neto) al cierre de una fecha dada.
--    Parte de la cantidad actual y "deshace" los movimientos posteriores a la fecha.
-- ---------------------------------------------------------------------
create or replace function public.valor_stock_a_fecha(p_fecha date)
returns table (valor numeric, unidades bigint, fichas bigint)
language sql stable security invoker as $$
  with post as (
    select stock_id, sum(delta) as delta from public.vista_kardex where fecha > p_fecha group by stock_id
  )
  select round(sum(greatest(s.cantidad - coalesce(p.delta, 0), 0) * coalesce(s.costo, 0)), 2) as valor,
         sum(greatest(s.cantidad - coalesce(p.delta, 0), 0))::bigint as unidades,
         count(*) filter (where greatest(s.cantidad - coalesce(p.delta, 0), 0) > 0) as fichas
  from public.stock s left join post p on p.stock_id = s.id
  where s.activo and coalesce(s.es_servicio, false) = false;
$$;

-- ---------------------------------------------------------------------
-- 4) Resumen de un período, todo NETO (lo que usan Informes y Rentabilidades)
-- ---------------------------------------------------------------------
create or replace function public.resumen_rentabilidad(p_desde date, p_hasta date)
returns table (
  ventas_netas numeric, costo_vendido numeric, ventas_sin_costo bigint, operaciones bigint,
  gastos numeric, compras_netas numeric, nc_proveedor_netas numeric,
  stock_inicio numeric, stock_cierre numeric
)
language sql stable security invoker as $$
  select
    (select coalesce(sum(neto),0) from public.ventas where fecha between p_desde and p_hasta),
    (select coalesce(sum(costo),0) from public.ventas where fecha between p_desde and p_hasta and not pendiente and precio >= 0),
    (select count(*) from public.ventas where fecha between p_desde and p_hasta and pendiente),
    (select count(*) from public.ventas where fecha between p_desde and p_hasta and precio > 0),
    (select coalesce(sum(monto),0) from public.gastos where fecha between p_desde and p_hasta),
    (select coalesce(sum(neto),0) from public.comprobantes_compra where fecha between p_desde and p_hasta and coalesce(tipo,'factura') <> 'nc'),
    (select coalesce(sum(neto),0) from public.comprobantes_compra where fecha between p_desde and p_hasta and tipo = 'nc'),
    (select valor from public.valor_stock_a_fecha(p_desde - 1)),
    (select valor from public.valor_stock_a_fecha(p_hasta));
$$;

-- ---------------------------------------------------------------------
-- 5) vista_rentabilidad_mensual: ya era neta (viene de comprobantes). Se deja.
-- ---------------------------------------------------------------------
commit;

-- ===== Verificación =====
-- a) neto cargado en todas las ventas
select count(*) sin_neto from ventas where neto is null;                       -- 0
-- b) octubre, en neto
select * from resumen_rentabilidad('2026-10-01', '2026-10-31');
-- c) el valor de stock "hoy" por la función tiene que coincidir con la pantalla de Stock (Costo del stock)
select * from valor_stock_a_fecha(current_date);
