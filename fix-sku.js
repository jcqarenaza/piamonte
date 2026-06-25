const fs = require('fs');

const cambios = [
  {
    archivo: 'components/compras/ComprasClient.tsx',
    buscar: ".ilike('descripcion', `%${texto}%`).limit(6)",
    reemplazar: ".or(`descripcion.ilike.%${texto}%,sku_interno.ilike.%${texto}%`).limit(6)"
  },
  {
    archivo: 'components/comprobantes/ComprobantesClient.tsx',
    buscar: ".ilike('descripcion',`%${stockQ}%`).limit(6)",
    reemplazar: ".or(`descripcion.ilike.%${stockQ}%,sku_interno.ilike.%${stockQ}%`).limit(6)"
  },
  {
    archivo: 'components/stock/StockClient.tsx',
    buscar: ".ilike('descripcion', `%${texto}%`).limit(6)",
    reemplazar: ".or(`descripcion.ilike.%${texto}%,sku_interno.ilike.%${texto}%`).limit(6)"
  }
];

for (const c of cambios) {
  const contenido = fs.readFileSync(c.archivo, 'utf8');
  if (!contenido.includes(c.buscar)) {
    console.log(`⚠ NO ENCONTRADO en ${c.archivo} — revisar a mano`);
    continue;
  }
  const nuevo = contenido.replace(c.buscar, c.reemplazar);
  fs.writeFileSync(c.archivo, nuevo, 'utf8');
  console.log(`✓ Reemplazado en ${c.archivo}`);
}