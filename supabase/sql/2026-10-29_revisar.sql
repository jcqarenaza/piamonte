-- =====================================================================
--  REVISAR — pestaña dentro de Precios que reemplaza a Comparar / Equivalencias
--  Correr DESPUÉS de 2026-10-29_familias.sql, completo, en Supabase > SQL Editor.
-- =====================================================================
begin;

-- 1) Descripción "oficial" por familia (la que elige Vero/Mario cuando los proveedores no coinciden)
create table if not exists public.familias (
  familia text primary key,
  descripcion text not null,
  pos text,
  notas text,
  updated_at timestamptz default now()
);
alter table public.familias enable row level security;
drop policy if exists familias_lectura on public.familias;
create policy familias_lectura on public.familias for select to authenticated using (true);
drop policy if exists familias_escritura on public.familias;
create policy familias_escritura on public.familias for all to authenticated using (true) with check (true);

-- 2) buscar_familias ahora devuelve también la descripción oficial (desc_familia)
drop function if exists public.buscar_familias(text, int);
create or replace function public.buscar_familias(p_q text, p_limit int default 40)
returns table (
  familia text, base6 text, es_variante boolean, grupo_id int,
  id uuid, proveedor text, codigo text, descripcion text, marca text, pos text,
  costo_neto numeric, costo_anterior numeric, precio_lista numeric, lista_nombre text, es_promo boolean,
  disponible boolean, updated_at timestamptz,
  stock_cant numeric, stock_precio numeric, stock_costo numeric,
  desc_familia text
)
language sql stable security invoker as $$
  with q as (
    select array_remove(regexp_split_to_array(upper(trim(p_q)), '\s+'), '') w
  ),
  hit as (
    select c.familia, min(case when upper(c.codigo) = (select w[1] from q) then 0
                                when upper(c.codigo) like (select w[1] from q) || '%' then 1 else 2 end) rank
    from public.catalogo c, q
    where (array_length(q.w,1) = 1 and (c.codigo ilike '%' || q.w[1] || '%' or c.descripcion ilike '%' || q.w[1] || '%'
                                        or exists (select 1 from public.familias f where f.familia = c.familia and f.descripcion ilike '%' || q.w[1] || '%')))
       or (array_length(q.w,1) > 1 and ((select bool_and(c.descripcion ilike '%' || x || '%') from unnest(q.w) x)
                                        or exists (select 1 from public.familias f where f.familia = c.familia and (select bool_and(f.descripcion ilike '%' || x || '%') from unnest(q.w) x))))
    group by c.familia
    order by 2, 1
    limit p_limit
  ),
  hit2 as (
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
         case when upper(f.disponible) in ('SI','S','1','TRUE') then true when upper(f.disponible) in ('NO','N','0','FALSE') then false else null end,
         f.updated_at,
         s.cant, s.pv, s.costo,
         fa.descripcion
  from filas f
  left join lateral (
    select sum(st.cantidad) cant, max(st.precio_venta) pv, max(st.costo) costo
    from public.stock st where st.activo and upper(st.codigo) = upper(f.codigo)
  ) s on true
  left join public.familias fa on fa.familia = f.familia;
$$;

-- 3) Familias con descripciones distintas entre proveedores y sin descripción oficial (las que tienen stock primero)
create or replace view public.vista_familias_a_revisar with (security_invoker = true) as
  select c.familia,
         count(distinct upper(trim(c.descripcion))) descripciones,
         json_agg(json_build_object('proveedor', c.proveedor, 'codigo', c.codigo, 'descripcion', c.descripcion) order by c.proveedor, c.codigo) opciones,
         coalesce((select sum(st.cantidad) from public.stock st
                   where st.activo and upper(st.codigo) in (select upper(c2.codigo) from public.catalogo c2 where c2.familia = c.familia)), 0) stock
  from public.catalogo c
  where c.familia ~ '^[0-9]{6}[A-Z]{3}$'
    and not exists (select 1 from public.familias f where f.familia = c.familia)
  group by c.familia
  having count(distinct upper(trim(c.descripcion))) > 1;

-- 4) Grupos manuales (grupo_id) para listarlos y poder deshacerlos
create or replace view public.vista_grupos_manuales with (security_invoker = true) as
  select grupo_id, array_agg(distinct familia order by familia) familias,
         min(descripcion) descripcion, count(*) codigos
  from public.catalogo where grupo_id is not null group by grupo_id;

-- 5) Vincular / desvincular familias enteras (reemplaza al "Confirmar equivalencia" de Comparar)
create or replace function public.vincular_familias(p_a text, p_b text)
returns int language plpgsql security invoker as $$
declare g int;
begin
  select coalesce(
    (select grupo_id from public.catalogo where familia = p_a and grupo_id is not null limit 1),
    (select grupo_id from public.catalogo where familia = p_b and grupo_id is not null limit 1)
  ) into g;
  if g is null then select coalesce(max(grupo_id), 0) + 1 into g from public.catalogo; end if;
  -- fusionar grupos previos de ambas
  update public.catalogo set grupo_id = g
  where grupo_id in (select grupo_id from public.catalogo where familia in (p_a, p_b) and grupo_id is not null);
  update public.catalogo set grupo_id = g where familia in (p_a, p_b);
  return g;
end $$;

create or replace function public.desvincular_familia(p_familia text)
returns void language sql security invoker as $$
  update public.catalogo set grupo_id = null where familia = p_familia;
$$;

-- 6) Sugerencias para fichas de stock que no están en el catálogo: familias con la misma base de 6 dígitos
create or replace view public.vista_stock_sin_catalogo_sug with (security_invoker = true) as
  select s.id, s.codigo, s.descripcion, s.cantidad, s.costo, s.precio_venta, s.pos,
         (select json_agg(json_build_object('familia', x.familia, 'codigo', x.codigo, 'proveedor', x.proveedor, 'descripcion', x.descripcion) order by x.familia)
          from (select distinct on (c.familia) c.familia, c.codigo, c.proveedor, c.descripcion
                from public.catalogo c
                where s.codigo ~ '^[0-9]{6}' and c.familia like left(s.codigo, 6) || '%'
                order by c.familia, c.proveedor) x) sugerencias
  from public.vista_stock_sin_catalogo s;

commit;

-- ===== Verificación =====
select count(*) familias_a_revisar, count(*) filter (where stock > 0) con_stock from vista_familias_a_revisar;
select count(*) grupos_manuales from vista_grupos_manuales;
select count(*) stock_sin_catalogo, count(*) filter (where sugerencias is not null) con_sugerencia from vista_stock_sin_catalogo_sug;
