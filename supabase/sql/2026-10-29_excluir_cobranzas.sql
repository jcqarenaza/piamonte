-- Comprobantes que no deben aparecer en Informes > Cobranzas (pruebas / ya resueltos fuera del sistema).
-- No se borra nada: solo se marcan.
alter table comprobantes add column if not exists excluir_cobranzas boolean not null default false;

update comprobantes set excluir_cobranzas = true where id in (
  '5c64e53b-7c4a-4041-a259-ebf6f7785b3b',  -- Cores Mauro      A-30  $172.400
  'a367a801-8f84-4149-b5d3-03c9f273f080',  -- Fernandez Flor.  B     $506.140
  '524e04f4-fce0-42da-bd87-deb482f82c51',  -- Valderrama       A     $227.000,01
  'a4cb925a-9aa9-4bf3-a706-0977e8d3a33e',  -- Prueba sistema   B     $100
  'd16aa174-86d2-42c2-855b-a9cebd78eb20'   -- Juan Cruz (prueba) B-2 $4.598
);

select count(*) as marcados from comprobantes where excluir_cobranzas;  -- debe dar 5
