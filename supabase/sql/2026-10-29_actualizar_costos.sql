-- Actualizar COSTOS del catálogo desde listas de proveedor (Malatesta / Gamma).
-- NO toca precios_aseguradora ni precios de venta. Solo catalogo.costo_neto / precio_lista
-- (guarda el valor anterior en costo_anterior / precio_lista_anterior).
create or replace function actualizar_costos_catalogo(
  p_proveedor text,
  p_items jsonb,            -- [{codigo, descripcion, lista, costo}]
  p_crear_nuevos boolean default false
) returns jsonb
language plpgsql
as $$
declare
  v_upd int := 0;
  v_new int := 0;
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
      returning 1
    )
    select count(*) into v_new from i;
  end if;

  return jsonb_build_object('actualizados', v_upd, 'nuevos', v_new);
end $$;

grant execute on function actualizar_costos_catalogo(text, jsonb, boolean) to authenticated;
