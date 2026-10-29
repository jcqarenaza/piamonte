-- =====================================================================
--  PRECIOS POR FAMILIA — equivalencias automáticas sobre el catálogo
--  Regla: código GAMMA/Malatesta = 6 dígitos + 4 letras.
--    familia  = 6 dígitos + 3 primeras letras  → misma pieza, otro origen (4ª letra)
--    base6    = 6 dígitos                      → mismo modelo, otra variante (color/sensor/proceso)
--  Los vínculos a mano (grupo_id de Comparar) se respetan: unen familias.
--  Correr completo en Supabase > SQL Editor.
-- =====================================================================
begin;

alter table public.catalogo add column if not exists familia text
  generated always as (
    case when codigo ~ '^[0-9]{6}[A-Za-z]{4}$' then upper(left(codigo, 9)) else upper(codigo) end
  ) stored;
create index if not exists catalogo_familia_idx on public.catalogo (familia);
create index if not exists catalogo_base6_idx on public.catalogo (left(familia, 6));
create index if not exists catalogo_codigo_upper_idx on public.catalogo (upper(codigo));
create index if not exists stock_codigo_upper_idx on public.stock (upper(codigo));

-- Búsqueda: devuelve todas las filas del catálogo de las familias que matchean
-- + las variantes del mismo modelo (es_variante = true) + stock en mano por código.
drop function if exists public.buscar_familias(text, int);
create or replace function public.buscar_familias(p_q text, p_limit int default 40)
returns table (
  familia text, base6 text, es_variante boolean, grupo_id int,
  id uuid, proveedor text, codigo text, descripcion text, marca text, pos text,
  costo_neto numeric, costo_anterior numeric, precio_lista numeric, lista_nombre text, es_promo boolean,
  disponible boolean, updated_at timestamptz,
  stock_cant numeric, stock_precio numeric, stock_costo numeric
)
language sql stable security invoker as $$
  with q as (
    select array_remove(regexp_split_to_array(upper(trim(p_q)), '\s+'), '') w
  ),
  hit as (                                                   -- familias que matchean la búsqueda
    select c.familia, min(case when upper(c.codigo) = (select w[1] from q) then 0
                                when upper(c.codigo) like (select w[1] from q) || '%' then 1 else 2 end) rank
    from public.catalogo c, q
    where (array_length(q.w,1) = 1 and (c.codigo ilike '%' || q.w[1] || '%' or c.descripcion ilike '%' || q.w[1] || '%'))
       or (array_length(q.w,1) > 1 and (select bool_and(c.descripcion ilike '%' || x || '%') from unnest(q.w) x))
    group by c.familia
    order by 2, 1
    limit p_limit
  ),
  hit2 as (                                                  -- + familias unidas a mano (grupo_id)
    select familia from hit
    union
    select c.familia from public.catalogo c
    where c.grupo_id in (select c2.grupo_id from public.catalogo c2 where c2.familia in (select familia from hit) and c2.grupo_id is not null)
  ),
  bases as (select distinct left(familia, 6) b from hit2 where familia ~ '^[0-9]{6}'),
  filas as (
    select c.*, (c.familia in (select familia from hit2)) directo
    from public.catalogo c
    where c.familia in (select familia from hit2)
       or (c.familia ~ '^[0-9]{6}[A-Z]{3}$' and left(c.familia, 6) in (select b from bases))
  )
  select f.familia, left(f.familia, 6), not f.directo, f.grupo_id,
         f.id, f.proveedor, f.codigo, f.descripcion, f.marca, f.pos,
         f.costo_neto, f.costo_anterior, f.precio_lista, f.lista_nombre, coalesce(f.es_promo, false),
         case when upper(f.disponible) in ('SI','S','1','TRUE') then true when upper(f.disponible) in ('NO','N','0','FALSE') then false else null end, f.updated_at,
         s.cant, s.pv, s.costo
  from filas f
  left join lateral (
    select sum(st.cantidad) cant, max(st.precio_venta) pv, max(st.costo) costo
    from public.stock st where st.activo and upper(st.codigo) = upper(f.codigo)
  ) s on true;
$$;

-- Fichas de stock que no están en el catálogo (para la pestaña Revisar y para que Precios también las muestre)
create or replace view public.vista_stock_sin_catalogo with (security_invoker = true) as
  select s.id, s.codigo, s.descripcion, s.cantidad, s.costo, s.precio_venta, s.pos
  from public.stock s
  where s.activo and coalesce(s.es_servicio, false) = false
    and not exists (select 1 from public.catalogo c where upper(c.codigo) = upper(s.codigo));

commit;

-- ===== Verificación =====
select count(*) filas, count(distinct familia) familias, count(distinct left(familia,6)) filter (where familia ~ '^[0-9]{6}') modelos from catalogo;
select familia, es_variante, proveedor, codigo, descripcion, costo_neto, stock_cant from buscar_familias('424230') order by es_variante, familia, proveedor;
select familia, es_variante, proveedor, codigo, descripcion, costo_neto, stock_cant from buscar_familias('hilux parabrisas') order by es_variante, familia, proveedor limit 30;
