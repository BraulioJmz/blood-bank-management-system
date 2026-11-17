-- =============================================================================
-- 007 · Umbral de "próxima a caducar" relativo a cada componente
-- =============================================================================
-- Un umbral fijo de 7 días no sirve para todos: las plaquetas viven 5 días (con 7
-- siempre estarían "por caducar") y el plasma 365 (con 7 la alerta llega tarde para
-- redistribuirlo). El umbral pasa a ser un dato del catálogo, no una constante en las
-- vistas: se ajusta con un UPDATE, sin tocar código ni SQL de vistas.
--
-- Desviación del ER (documentada en docs/arquitectura.md): componente.dias_alerta_caducidad.

ALTER TABLE componente
    ADD COLUMN dias_alerta_caducidad integer NOT NULL DEFAULT 7;

UPDATE componente SET dias_alerta_caducidad = CASE nombre
    WHEN 'Concentrado plaquetario'    THEN 2
    WHEN 'Concentrado eritrocitario'  THEN 7
    WHEN 'Plasma fresco congelado'    THEN 30
    WHEN 'Crioprecipitado'            THEN 30
    ELSE dias_alerta_caducidad END;

-- El DEFAULT solo servía para poblar filas existentes en el ALTER; un componente nuevo
-- debe declarar su umbral explícitamente.
ALTER TABLE componente ALTER COLUMN dias_alerta_caducidad DROP DEFAULT;

-- CHECK que compara dos columnas de la misma fila: el aviso no puede ser mayor que la
-- vida útil (sería una unidad "por caducar" desde que nace).
ALTER TABLE componente
    ADD CONSTRAINT ck_componente_alerta
    CHECK (dias_alerta_caducidad BETWEEN 1 AND vida_util_dias);

-- -----------------------------------------------------------------------------
-- Vistas
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW solo permite AGREGAR columnas al final, no cambiar nombre,
-- tipo ni orden de las existentes. Por eso la columna nueva va al final y el
-- renombrado de por_caducar_7d se hace con ALTER VIEW … RENAME COLUMN.
-- Reemplazar (en vez de DROP + CREATE) conserva los GRANT y las dependencias.

-- Semáforo relativo: amarillo dentro del umbral del componente; rojo en su último
-- tercio (mínimo 1 día). Plaquetas: rojo ≤1, amarillo ≤2. Eritrocitos: rojo ≤2,
-- amarillo ≤7. Plasma/crio: rojo ≤10, amarillo ≤30.
CREATE OR REPLACE VIEW v_inventario_unidades WITH (security_invoker = true) AS
SELECT u.id_unidad, u.id_donacion, u.estado,
       u.id_tipo_sanguineo, fn_tipo_etiqueta(t.grupo_abo, t.factor_rh) AS tipo,
       u.id_componente, c.nombre AS componente,
       u.fecha_obtencion, u.fecha_caducidad,
       u.fecha_caducidad - current_date AS dias_restantes,
       CASE WHEN u.estado NOT IN ('cuarentena', 'disponible') THEN NULL
            WHEN u.fecha_caducidad - current_date <= greatest(1, c.dias_alerta_caducidad / 3) THEN 'rojo'
            WHEN u.fecha_caducidad - current_date <= c.dias_alerta_caducidad THEN 'amarillo'
            ELSE 'verde' END AS semaforo,
       c.dias_alerta_caducidad
  FROM unidad_sangre u
  JOIN tipo_sanguineo t USING (id_tipo_sanguineo)
  JOIN componente c USING (id_componente);

-- El `SELECT *` de 005 se expandió a una lista fija de columnas al crear la vista
-- (PostgreSQL guarda la consulta ya resuelta), así que hay que reemplazarla para que
-- incluya dias_alerta_caducidad. La condición usa la columna de cada fila, por lo que
-- el BETWEEN ya no tiene un extremo constante; sigue apoyándose en ix_unidad_vigente_caducidad
-- para el extremo current_date.
CREATE OR REPLACE VIEW v_unidades_por_caducar WITH (security_invoker = true) AS
SELECT *
  FROM v_inventario_unidades
 WHERE estado IN ('cuarentena', 'disponible')
   AND fecha_caducidad >= current_date
   AND fecha_caducidad <= current_date + dias_alerta_caducidad;

ALTER VIEW v_disponibilidad RENAME COLUMN por_caducar_7d TO por_caducar;

CREATE OR REPLACE VIEW v_disponibilidad AS
SELECT t.id_tipo_sanguineo,
       fn_tipo_etiqueta(t.grupo_abo, t.factor_rh)                         AS tipo,
       c.id_componente,
       c.nombre                                                           AS componente,
       count(u.id_unidad)                                                 AS disponibles,
       count(u.id_unidad) FILTER (
           WHERE u.fecha_caducidad <= current_date + c.dias_alerta_caducidad) AS por_caducar,
       min(u.fecha_caducidad)                                             AS proxima_caducidad,
       c.dias_alerta_caducidad
  FROM tipo_sanguineo t
 CROSS JOIN componente c
  LEFT JOIN unidad_sangre u
         ON u.id_tipo_sanguineo = t.id_tipo_sanguineo
        AND u.id_componente = c.id_componente
        AND u.estado = 'disponible'
        AND u.fecha_caducidad >= current_date
 GROUP BY t.id_tipo_sanguineo, t.grupo_abo, t.factor_rh, c.id_componente, c.nombre,
          c.dias_alerta_caducidad;
