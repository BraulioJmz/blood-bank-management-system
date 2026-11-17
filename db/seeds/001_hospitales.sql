-- Hospitales demo (datos ficticios con nombres genéricos).
SET LOCAL search_path = banco, public;
INSERT INTO hospital (nombre, direccion, telefono) VALUES
    ('Hospital General Norte',      'Av. Federalismo Norte 1200, Guadalajara, Jal.', '33 3614 0000'),
    ('Hospital Regional Sur',       'Calz. Independencia Sur 850, Guadalajara, Jal.', '33 3618 1100'),
    ('Clínica del Valle',           'Av. López Mateos 2300, Zapopan, Jal.',          '33 3121 2200'),
    ('Hospital Comunitario Tonalá', 'Av. Tonaltecas 410, Tonalá, Jal.',              '33 3683 3300');
