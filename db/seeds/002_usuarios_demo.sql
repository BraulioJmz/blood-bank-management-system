-- Usuarios demo, uno por rol (dos de hospital para probar la RLS).
-- Contraseña de todos: Demo2026!  (hash argon2id precalculado; SOLO para demo).
SET LOCAL search_path = banco, public;
INSERT INTO usuario (username, nombre, password_hash, id_rol, id_hospital)
SELECT v.username, v.nombre, '$argon2id$v=19$m=65536,t=3,p=4$GM70e+9Jjyew9/A1z2FdWQ$WbNdmKqtkm6nlFIeIpIQOr/zRaQMzCPtxrCIYRhToEU', r.id_rol, h.id_hospital
  FROM (VALUES
        ('recepcion', 'Lucía Hernández (Recepción)',     'recepcion',   NULL),
        ('laboratorio', 'Jorge Ramírez (Laboratorio)',   'laboratorio', NULL),
        ('inventario', 'Mariana López (Inventario)',     'inventario',  NULL),
        ('hospital.norte', 'Dr. Andrés Torres (H. Norte)', 'hospital',  'Hospital General Norte'),
        ('hospital.sur', 'Dra. Paula Méndez (H. Sur)',   'hospital',    'Hospital Regional Sur'),
        ('admin', 'Sofía García (Administración)',       'admin',       NULL)
       ) AS v(username, nombre, rol, hospital)
  JOIN rol r ON r.nombre = v.rol
  LEFT JOIN hospital h ON h.nombre = v.hospital;
