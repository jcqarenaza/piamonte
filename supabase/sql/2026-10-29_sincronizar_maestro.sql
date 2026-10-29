-- Sincroniza el MAESTRO (articulos_maestro + articulo_equivalencias) con el catálogo de proveedores.
-- Cada código completo del catálogo que no esté en el maestro se agrega como artículo propio (como hace Compras),
-- y cada proveedor que lo vende queda como equivalencia (un mismo código puede comprarse a más de un proveedor:
-- si el más barato no lo tiene, el otro sigue disponible). No toca ni borra nada existente.

-- Un código ahora puede tener una equivalencia por proveedor (antes era una sola por código).
drop index if exists uq_equivalencias_codigo_prov;
create unique index if not exists uq_equivalencias_codigo_prov on articulo_equivalencias (codigo_proveedor, proveedor) where lista_nombre is null;
create or replace function sincronizar_maestro(p_codigos text[] default null)
returns jsonb
language plpgsql
as $$
declare
  v_art int := 0;
  v_eq int := 0;
begin
  -- 1) artículos nuevos en el maestro (un artículo por código completo)
  with cand as (
    select distinct on (upper(c.codigo))
           upper(c.codigo) as codigo, c.descripcion, c.marca, c.pos
    from catalogo c
    where c.lista_nombre is null and c.codigo is not null and trim(c.codigo) <> ''
      and (p_codigos is null or upper(c.codigo) = any (select upper(x) from unnest(p_codigos) x))
      and not exists (select 1 from articulos_maestro m where upper(m.codigo_referencia) = upper(c.codigo))
    order by upper(c.codigo), c.costo_neto asc nulls last
  ), ins as (
    insert into articulos_maestro (codigo_referencia, descripcion, marca, pos, activo)
    select codigo, coalesce(nullif(trim(descripcion), ''), codigo), marca, pos, true from cand
    on conflict do nothing
    returning 1
  )
  select count(*) into v_art from ins;

  -- 2) equivalencias: una por (proveedor, código) que todavía no la tenga
  with cand as (
    select c.id as catalogo_id, c.proveedor, upper(c.codigo) as codigo, c.descripcion, c.costo_neto
    from catalogo c
    where c.lista_nombre is null and c.codigo is not null and trim(c.codigo) <> ''
      and (p_codigos is null or upper(c.codigo) = any (select upper(x) from unnest(p_codigos) x))
      and not exists (select 1 from articulo_equivalencias e
                      where upper(e.codigo_proveedor) = upper(c.codigo) and e.proveedor = c.proveedor and e.lista_nombre is null)
  ), ins as (
    insert into articulo_equivalencias (articulo_id, proveedor, codigo_proveedor, descripcion_proveedor, costo_neto, lista_nombre, catalogo_id)
    select m.id, cand.proveedor, cand.codigo, cand.descripcion, cand.costo_neto, null, cand.catalogo_id
    from cand
    join lateral (select id from articulos_maestro m where upper(m.codigo_referencia) = cand.codigo and m.activo limit 1) m on true
    on conflict do nothing
    returning 1
  )
  select count(*) into v_eq from ins;

  return jsonb_build_object('articulos_nuevos', v_art, 'equivalencias_nuevas', v_eq);
end $$;

grant execute on function sincronizar_maestro(text[]) to authenticated;

-- A partir de ahora, "Actualizar costos" sincroniza el maestro con los códigos nuevos que crea.
create or replace function actualizar_costos_catalogo(
  p_proveedor text,
  p_items jsonb,
  p_crear_nuevos boolean default false
) returns jsonb
language plpgsql
as $$
declare
  v_upd int := 0;
  v_new int := 0;
  v_m jsonb := '{}'::jsonb;
begin
  with src as (
    select upper(trim(x.codigo)) as codigo, x.descripcion, x.lista, x.costo
    from jsonb_to_recordset(p_items) as x(codigo text, descripcion text, lista numeric, costo numeric)
    where x.costo > 0
  ), u as (
    update catalogo c set
      costo_anterior = case when c.costo_neto is distinct from round(s.costo) then c.costo_neto else c.costo_anterior end,
      precio_lista_anterior = case when c.precio_lista is distinct from round(s.lista) then c.precio_lista else c.precio_lista_anterior end,
      costo_neto = round(s.costo),
      precio_lista = round(s.lista),
      updated_at = now(),
      updated_source = 'actualizar costos'
    from src s
    where c.proveedor = p_proveedor and c.codigo = s.codigo
      and (c.costo_neto is distinct from round(s.costo) or c.precio_lista is distinct from round(s.lista))
    returning 1
  )
  select count(*) into v_upd from u;

  if p_crear_nuevos then
    with src as (
      select upper(trim(x.codigo)) as codigo, x.descripcion, x.lista, x.costo
      from jsonb_to_recordset(p_items) as x(codigo text, descripcion text, lista numeric, costo numeric)
      where x.costo > 0
    ), i as (
      insert into catalogo (proveedor, codigo, descripcion, precio_lista, costo_neto, updated_at, updated_source)
      select p_proveedor, s.codigo, s.descripcion, round(s.lista), round(s.costo), now(), 'actualizar costos'
      from src s
      where not exists (select 1 from catalogo c where c.proveedor = p_proveedor and c.codigo = s.codigo)
      returning codigo
    )
    select count(*) into v_new from i;

    if v_new > 0 then
      v_m := sincronizar_maestro((select array_agg(x.codigo) from jsonb_to_recordset(p_items) as x(codigo text)));
    end if;
  end if;

  return jsonb_build_object('actualizados', v_upd, 'nuevos', v_new, 'maestro', v_m);
end $$;

grant execute on function actualizar_costos_catalogo(text, jsonb, boolean) to authenticated;

-- Cargar de una vez los códigos que hoy faltan (Malatesta + Gamma + Sekurit):
select sincronizar_maestro();
