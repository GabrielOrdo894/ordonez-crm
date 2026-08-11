-- Datos de ejemplo para desarrollo
-- Ejecutar en Supabase SQL Editor DESPUÉS de crear las tablas

insert into visitas (
  nombre, apellidos, telefono, email, idioma, contacto,
  direccion, pais, zona, tipo, descripcion,
  fecha_visita, hora_visita, empleado, estado, estado_pipeline, notas
) values
(
  'Susana', 'Martínez López', '+34 612 345 678', 'susana@email.com',
  'Español', 'Llamada',
  'C/ Beraun 14, 3B, 20304 Irún', 'España', 'Irún',
  'Baño', 'Reforma completa baño principal: cambio bañera por ducha, alicatado completo.',
  CURRENT_DATE + 5, '09:30', 'Mario Ordoñez', 'Confirmada', 'Visita programada',
  'Cliente muy decidida. Tiene referencias nuestras de un vecino.'
),
(
  'Jean-Pierre', 'Dupont', '+33 6 12 34 56 78', 'jpdupont@mail.fr',
  'Francés', 'Web',
  '12 Rue de la Plage, 64700 Hendaye', 'Francia', 'Hendaye',
  'Cocina', 'Rénovation complète cuisine: nouveaux meubles, plan de travail quartz.',
  CURRENT_DATE + 10, '11:00', 'Mario Ordoñez', 'Pendiente', 'Contacto',
  ''
);
