insert into fiscal_config (clave, valor, descripcion, fuente, vigente_desde) values
  ('csg_no_deducible_pct', 0.029,
   'CSG/CRDS no deducible sobre la assiette TNS (2,9% de los 9,7% totales de CSG-CRDS; el resto, 6,8%, sí es deducible) — hay que sumarlo de vuelta a la rémunération neta para obtener el importe real de la casilla 1GB del formulario 2042, la Administración no lo hace sola (a diferencia del abattement 10%). Confirmado para el régimen "assiette única" TNS 2026 (LFSS 2024): se aplica sobre la misma assiette que calcularTNS (rémunération × 0,74), no sobre el bruto — distinto del tratamiento de un salarié (CSG sobre 98,25% del bruto).',
   'https://www.urssaf.fr', current_date)
on conflict (clave) do update set
  valor = excluded.valor,
  descripcion = excluded.descripcion,
  fuente = excluded.fuente,
  vigente_desde = excluded.vigente_desde;
