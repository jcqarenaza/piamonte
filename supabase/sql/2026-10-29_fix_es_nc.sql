-- Las notas de crédito se guardaban con es_nc = false (solo categoria = 'nc').
-- Informes las contaba como facturado y como pendiente de cobro.
update comprobantes set es_nc = true where categoria = 'nc' and es_nc is distinct from true;

-- Verificación: debe devolver 20 filas (las NC) con es_nc = true
select categoria, es_nc, count(*) from comprobantes group by 1, 2 order by 1, 2;
