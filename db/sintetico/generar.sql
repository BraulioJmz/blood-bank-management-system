-- =============================================================================
-- generar.sql — Datos sintéticos de volumen con generate_series
-- =============================================================================
-- Lo ejecuta generar.ts como banco_owner dentro de UNA transacción. Parámetros
-- (fijados antes con set_config(..., true), es decir, locales a la transacción):
--   sintetico.unidades  número aproximado de unidades a generar
--   sintetico.dias      ventana hacia atrás de las fechas de donación
-- y la tabla temporal tmp_nombres(n, nombre, sexo) con nombres faker es_MX coherentes con el sexo.
--
-- Carga masiva: se desactivan los triggers de USUARIO (bitácora, tamizaje,
-- validaciones) y los estados se calculan en bloque con SQL. Las FK siguen activas
-- (son triggers internos del sistema, que DISABLE TRIGGER USER no toca), así que la
-- integridad referencial se sigue verificando. Por eso estos datos no aparecen en la
-- bitácora: no los generó ningún usuario de la aplicación.
-- ALTER TABLE … DISABLE TRIGGER toma un candado ACCESS EXCLUSIVE: nadie más puede
-- usar la tabla durante la carga, y al hacer COMMIT todo vuelve a la normalidad.
-- =============================================================================
SET LOCAL search_path = banco, public;

ALTER TABLE donante               DISABLE TRIGGER USER;
ALTER TABLE donacion              DISABLE TRIGGER USER;
ALTER TABLE prueba_tamizaje       DISABLE TRIGGER USER;
ALTER TABLE unidad_sangre         DISABLE TRIGGER USER;
ALTER TABLE movimiento_inventario DISABLE TRIGGER USER;
ALTER TABLE solicitud             DISABLE TRIGGER USER;
ALTER TABLE asignacion            DISABLE TRIGGER USER;

-- Parámetros derivados -----------------------------------------------------------
CREATE TEMP TABLE tmp_param ON COMMIT DROP AS
SELECT current_setting('sintetico.unidades')::integer                AS unidades,
       current_setting('sintetico.dias')::integer                    AS dias,
       ceil(current_setting('sintetico.unidades')::numeric / 2.7)::integer AS donaciones,
       (SELECT id_usuario FROM usuario WHERE username = 'recepcion')   AS u_recepcion,
       (SELECT id_usuario FROM usuario WHERE username = 'laboratorio') AS u_laboratorio,
       (SELECT id_usuario FROM usuario WHERE username = 'inventario')  AS u_inventario;

-- Donantes (≈ 1 por cada 2 donaciones) --------------------------------------------
CREATE TEMP TABLE tmp_donante ON COMMIT DROP AS
WITH nuevos AS (
    INSERT INTO donante (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo)
    SELECT n.nombre,
           current_date - ((20 + random() * 40) * 365)::integer,
           n.sexo,
           -- Distribución aproximada en México: O+ es la más frecuente.
           (SELECT id_tipo_sanguineo FROM tipo_sanguineo
             WHERE grupo_abo || factor_rh = CASE
                   WHEN x < 0.56 THEN 'O+' WHEN x < 0.83 THEN 'A+' WHEN x < 0.91 THEN 'B+'
                   WHEN x < 0.93 THEN 'AB+' WHEN x < 0.97 THEN 'O-' WHEN x < 0.985 THEN 'A-'
                   WHEN x < 0.995 THEN 'B-' ELSE 'AB-' END)
      FROM tmp_nombres n
     CROSS JOIN LATERAL (SELECT random() + n.n * 0 AS x) r   -- n.n*0 fuerza un random por fila
    RETURNING id_donante
)
SELECT row_number() OVER () AS rn, id_donante FROM nuevos;

-- Donaciones repartidas en la ventana de días ---------------------------------------
CREATE TEMP TABLE tmp_donacion ON COMMIT DROP AS
WITH nuevas AS (
    INSERT INTO donacion (id_donante, id_usuario, fecha_donacion, tipo_donacion, volumen_ml)
    SELECT d.id_donante, p.u_recepcion,
           now() - (random() * p.dias) * interval '1 day',
           CASE WHEN random() < 0.8 THEN 'altruista' WHEN random() < 0.97 THEN 'familiar' ELSE 'autologa' END,
           420 + (random() * 60)::integer
      FROM tmp_param p
     CROSS JOIN generate_series(1, p.donaciones) g
      JOIN tmp_donante d ON d.rn = 1 + (g % (SELECT count(*) FROM tmp_donante))
    RETURNING id_donacion, fecha_donacion
)
SELECT id_donacion, fecha_donacion,
       -- ~3 % de donaciones reactivas; las de los últimos 2 días siguen en tamizaje.
       (fecha_donacion > now() - interval '2 days') AS en_tamizaje,
       (random() < 0.03)                            AS reactiva,
       -- Sorteo por donación (no en el JOIN): una expresión volátil como random() en
       -- una condición de join no garantiza evaluarse una vez por par de filas.
       (random() < 0.5)                             AS con_plaquetas,
       (random() < 0.2)                             AS con_crio
  FROM nuevas;

-- Pruebas de tamizaje: 5 por donación ------------------------------------------------
INSERT INTO prueba_tamizaje (id_donacion, tipo_prueba, resultado, fecha_resultado)
SELECT d.id_donacion, t.tipo,
       CASE WHEN d.en_tamizaje THEN 'pendiente'
            WHEN d.reactiva AND t.tipo = 'VHB' THEN 'reactivo'
            ELSE 'no_reactivo' END,
       CASE WHEN d.en_tamizaje THEN NULL ELSE d.fecha_donacion + interval '1 day' END
  FROM tmp_donacion d
 CROSS JOIN unnest(ARRAY['VIH', 'VHB', 'VHC', 'Sifilis', 'Chagas']) AS t(tipo);

-- Unidades: eritrocitario y plasma siempre; plaquetas 50 %; crioprecipitado 20 % ---
CREATE TEMP TABLE tmp_unidad ON COMMIT DROP AS
WITH nuevas AS (
    INSERT INTO unidad_sangre (id_donacion, id_componente, id_tipo_sanguineo,
                               fecha_obtencion, fecha_caducidad, estado)
    SELECT d.id_donacion, c.id_componente, dn.id_tipo_sanguineo,
           d.fecha_donacion::date, d.fecha_donacion::date + c.vida_util_dias,
           CASE
             WHEN d.reactiva AND NOT d.en_tamizaje             THEN 'descartada'
             WHEN d.en_tamizaje                                THEN 'cuarentena'
             WHEN d.fecha_donacion::date + c.vida_util_dias < current_date
                  THEN CASE WHEN random() < 0.75 THEN 'entregada' ELSE 'caducada' END
             ELSE CASE WHEN random() < 0.80 THEN 'disponible'
                       WHEN random() < 0.65 THEN 'entregada' ELSE 'asignada' END
           END
      FROM tmp_donacion d
      JOIN donacion dd USING (id_donacion)
      JOIN donante dn ON dn.id_donante = dd.id_donante
      JOIN componente c
        ON c.nombre IN ('Concentrado eritrocitario', 'Plasma fresco congelado')
        OR (c.nombre = 'Concentrado plaquetario' AND d.con_plaquetas)
        OR (c.nombre = 'Crioprecipitado' AND d.con_crio)
    RETURNING id_unidad, id_tipo_sanguineo, id_componente, fecha_obtencion, fecha_caducidad, estado
)
SELECT * FROM nuevas;

-- Solicitudes surtidas (1 por unidad asignada/entregada) + su asignación ------------
-- Así toda unidad entregada tiene trazabilidad completa hasta un hospital.
CREATE TEMP TABLE tmp_sol ON COMMIT DROP AS
WITH base AS (
    SELECT u.*, row_number() OVER () AS rn
      FROM tmp_unidad u WHERE u.estado IN ('asignada', 'entregada')
), nuevas AS (
    INSERT INTO solicitud (id_hospital, id_tipo_sanguineo, id_componente, cantidad,
                           prioridad, estado, fecha_solicitud)
    SELECT (SELECT array_agg(id_hospital ORDER BY id_hospital) FROM hospital)[1 + b.rn % (SELECT count(*) FROM hospital)],
           b.id_tipo_sanguineo, b.id_componente, 1,
           CASE WHEN random() < 0.8 THEN 'normal' WHEN random() < 0.8 THEN 'urgente' ELSE 'emergencia' END,
           'surtida',
           b.fecha_obtencion + interval '3 days'
      FROM base b
     ORDER BY b.rn
    RETURNING id_solicitud
)
-- Empareja solicitud ↔ unidad por posición (mismo orden de inserción).
SELECT s.id_solicitud, b.id_unidad, b.fecha_obtencion
  FROM (SELECT id_solicitud, row_number() OVER (ORDER BY id_solicitud) AS rn FROM nuevas) s
  JOIN base b USING (rn);

INSERT INTO asignacion (id_solicitud, id_unidad, id_usuario, fecha_asignacion)
SELECT s.id_solicitud, s.id_unidad, p.u_inventario, s.fecha_obtencion + interval '3 days 2 hours'
  FROM tmp_sol s CROSS JOIN tmp_param p;

-- Movimientos: entrada de todas + el movimiento que explica su estado final ---------
INSERT INTO movimiento_inventario (id_unidad, id_usuario, tipo_movimiento, fecha_movimiento, motivo)
SELECT u.id_unidad, p.u_laboratorio, 'entrada', u.fecha_obtencion + interval '6 hours',
       'Fraccionamiento (carga sintética)'
  FROM tmp_unidad u CROSS JOIN tmp_param p
UNION ALL
SELECT u.id_unidad,
       CASE u.estado WHEN 'caducada' THEN NULL ELSE p.u_inventario END,
       CASE u.estado WHEN 'descartada' THEN 'baja'
                     WHEN 'asignada'   THEN 'salida'
                     WHEN 'entregada'  THEN 'salida'
                     ELSE 'cambio_estado' END,
       CASE u.estado WHEN 'caducada' THEN u.fecha_caducidad + interval '1 day'
                     ELSE u.fecha_obtencion + interval '3 days' END,
       CASE u.estado WHEN 'descartada' THEN 'Tamizaje reactivo: VHB'
                     WHEN 'caducada'   THEN 'Caducó el ' || u.fecha_caducidad
                     WHEN 'disponible' THEN 'Liberada: 5 pruebas no reactivas'
                     ELSE 'Asignada (carga sintética)' END
  FROM tmp_unidad u CROSS JOIN tmp_param p
 WHERE u.estado <> 'cuarentena';

-- Algunas solicitudes abiertas para la operación diaria ----------------------------
INSERT INTO solicitud (id_hospital, id_tipo_sanguineo, id_componente, cantidad, prioridad, fecha_solicitud)
SELECT h.id_hospital,
       (SELECT id_tipo_sanguineo FROM tipo_sanguineo ORDER BY random() + g * 0 LIMIT 1),
       (SELECT id_componente FROM componente WHERE nombre <> 'Crioprecipitado' ORDER BY random() + g * 0 LIMIT 1),
       1 + (random() * 3)::integer,
       (ARRAY['normal', 'normal', 'urgente', 'emergencia'])[1 + (random() * 3)::integer],
       now() - (random() * 48) * interval '1 hour'
  FROM hospital h CROSS JOIN generate_series(1, 4) g;

ALTER TABLE donante               ENABLE TRIGGER USER;
ALTER TABLE donacion              ENABLE TRIGGER USER;
ALTER TABLE prueba_tamizaje       ENABLE TRIGGER USER;
ALTER TABLE unidad_sangre         ENABLE TRIGGER USER;
ALTER TABLE movimiento_inventario ENABLE TRIGGER USER;
ALTER TABLE solicitud             ENABLE TRIGGER USER;
ALTER TABLE asignacion            ENABLE TRIGGER USER;

REFRESH MATERIALIZED VIEW mv_dashboard;
