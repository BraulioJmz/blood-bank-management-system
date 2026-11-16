-- =============================================================================
-- 002_catalogos.sql — Catálogos fijos del dominio
-- =============================================================================
-- Los ids son IDENTITY: no se fijan a mano; el código siempre busca por nombre
-- o por (grupo_abo, factor_rh) gracias a las UK.

-- 8 tipos sanguíneos: producto cartesiano ABO × Rh.
INSERT INTO tipo_sanguineo (grupo_abo, factor_rh)
SELECT g, r
FROM unnest(ARRAY['O', 'A', 'B', 'AB']) WITH ORDINALITY AS abo(g, i)
CROSS JOIN unnest(ARRAY['+', '-']) WITH ORDINALITY AS rh(r, j)
ORDER BY i, j;

INSERT INTO componente (nombre, vida_util_dias) VALUES
    ('Concentrado eritrocitario', 42),
    ('Plasma fresco congelado', 365),
    ('Concentrado plaquetario', 5),
    ('Crioprecipitado', 365);

INSERT INTO rol (nombre) VALUES
    ('recepcion'), ('laboratorio'), ('inventario'), ('hospital'), ('admin');
