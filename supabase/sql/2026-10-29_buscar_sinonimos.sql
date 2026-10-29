-- Búsqueda de Precios: entiende las abreviaturas de los proveedores y busca también dentro del código.
--   "parabrisas" encuentra PSAS / P.BRISAS · "luneta" → LTA / LT · "puerta" → PTA / P.D.I. · "vw" → V.W. · "vidrio" → cualquier pieza
--   "422131 taos" busca el código y la palabra a la vez.
-- No cambia las columnas que devuelve buscar_familias ni toca datos.

create or replace function sin_busqueda(p_w text)
returns text
language sql
immutable
as $$
  select case lower(translate(p_w, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
    when 'parabrisas' then '(parabrisas|parabrisa|\mpsas?\M|p\.?brisas?)'
    when 'parabrisa'  then '(parabrisas|parabrisa|\mpsas?\M|p\.?brisas?)'
    when 'psas'       then '(parabrisas|parabrisa|\mpsas?\M|p\.?brisas?)'
    when 'luneta'     then '(luneta|\mlta\M|\mlt\M)'
    when 'lta'        then '(luneta|\mlta\M|\mlt\M)'
    when 'puerta'     then '(puerta|\mptas?\M|p\.d\.[id]\.?)'
    when 'puertas'    then '(puerta|\mptas?\M|p\.d\.[id]\.?)'
    when 'pta'        then '(puerta|\mptas?\M|p\.d\.[id]\.?)'
    when 'custodia'   then '(custodia|\mcust)'
    when 'ventila'    then '(ventila|\mvent)'
    when 'vw'         then '(v\.?w\.?|volkswagen)'
    when 'volkswagen' then '(v\.?w\.?|volkswagen)'
    when 'chevrolet'  then '(chev\.?|chevrolet)'
    when 'chev'       then '(chev\.?|chevrolet)'
    when 'mercedes'   then '(\mmb\M|mercedes)'
    when 'camara'     then '(c/\s*cam|camara)'
    when 'sensor'     then '(c/\s*sen|sensor)'
    when 'vidrio'     then '.'
    when 'vidrios'    then '.'
    when 'cristal'    then '.'
    when 'cristales'  then '.'
    else regexp_replace(translate(p_w, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'), '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
  end
$$;

create or replace function public.buscar_familias(p_q text, p_limit integer default 40)
returns table(familia text, base6 text, es_variante boolean, grupo_id integer, id uuid, proveedor text, codigo text, descripcion text, marca text, pos text, costo_neto numeric, costo_anterior numeric, precio_lista numeric, lista_nombre text, es_promo boolean, disponible boolean, updated_at timestamp with time zone, stock_cant numeric, stock_precio numeric, stock_costo numeric, desc_familia text)
language sql
stable
as $function$
  with q as (
    select array_remove(regexp_split_to_array(upper(trim(p_q)), '\s+'), '') w
  ),
  hit as (
    select c.familia, min(case when upper(c.codigo) = (select w[1] from q) then 0
                                when upper(c.codigo) like (select w[1] from q) || '%' then 1 else 2 end) rank
    from public.catalogo c, q
    where (array_length(q.w,1) = 1 and (c.codigo ilike '%' || q.w[1] || '%' or c.descripcion ~* sin_busqueda(q.w[1])
                                        or exists (select 1 from public.familias f where f.familia = c.familia and f.descripcion ~* sin_busqueda(q.w[1]))))
       or (array_length(q.w,1) > 1 and ((select bool_and((c.codigo || ' ' || c.descripcion) ~* sin_busqueda(x)) from unnest(q.w) x)
                                        or exists (select 1 from public.familias f where f.familia = c.familia and (select bool_and(f.descripcion ~* sin_busqueda(x)) from unnest(q.w) x))))
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
$function$;

grant execute on function sin_busqueda(text) to authenticated, anon;
grant execute on function public.buscar_familias(text, integer) to authenticated, anon;
notify pgrst, 'reload schema';
