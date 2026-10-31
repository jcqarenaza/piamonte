-- Ventas sin tipo de cliente: las facturas a aseguradoras (y otras con tipo en el comprobante) quedaban con tipo NULL
-- y el informe de Rentabilidad las mostraba como "Sin tipo". Completa el tipo desde el comprobante.
-- Solo toca ventas con tipo NULL. No cambia importes, costos ni stock.
update ventas v
   set tipo_cliente_nombre = coalesce(c.tipo_cliente_nombre, 'Aseguradora'),
       tipo_cliente_id     = coalesce(v.tipo_cliente_id, c.tipo_cliente_id)
  from comprobantes c
 where c.id = v.comprobante_id
   and v.tipo_cliente_nombre is null
   and (c.tipo_cliente_nombre is not null or c.aseguradora_nombre is not null);

-- Control: ventas por mes y tipo
select to_char(fecha,'YYYY-MM') mes, coalesce(tipo_cliente_nombre,'Sin tipo') tipo, count(*) n
from ventas where fecha >= '2026-09-01' group by 1,2 order by 1,2;
