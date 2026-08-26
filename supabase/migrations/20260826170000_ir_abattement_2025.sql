insert into fiscal_config (clave, valor, descripcion, fuente, vigente_desde) values
  ('ir_abattement_min', 509, 'Abattement 10% frais professionnels — importe mínimo, revenus 2025 (campaña de renta 2026). Pendiente actualizar cuando se publique la cifra oficial para revenus 2026 (campaña 2027).', 'https://www.impots.gouv.fr', current_date),
  ('ir_abattement_max', 14555, 'Abattement 10% frais professionnels — importe máximo/tope, revenus 2025 (campaña de renta 2026). Pendiente actualizar cuando se publique la cifra oficial para revenus 2026 (campaña 2027).', 'https://www.impots.gouv.fr', current_date)
on conflict (clave) do update set
  valor = excluded.valor,
  descripcion = excluded.descripcion,
  fuente = excluded.fuente,
  vigente_desde = excluded.vigente_desde;
