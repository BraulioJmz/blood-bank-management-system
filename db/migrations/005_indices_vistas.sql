-- =============================================================================
-- 005_indices_vistas.sql — Índices y vistas
-- =============================================================================
SET LOCAL search_path = banco, public;

-- --------------------------------------------------------------- Índices --
-- Índice PARCIAL para la consulta más frecuente (disponibilidad / FEFO):
--   WHERE estado = 'disponible' AND id_tipo_sanguineo = ? AND id_componente = ?
--   ORDER BY fecha_caducidad
-- Solo indexa las filas disponibles (una fracción del histórico: el resto está
-- entregada/caducada/descartada), así que es más pequeño y barato de mantener.
-- El orden de columnas importa: igualdad primero (tipo, componente) y el rango/orden
-- al final (fecha_caducidad), así el planificador lee las unidades YA ordenadas por
-- caducidad y el LIMIT de FEFO se detiene en cuanto tiene las necesarias.
CREATE INDEX ix_unidad_disponible
    ON unidad_sangre (id_tipo_sanguineo, id_componente, fecha_caducidad)
    WHERE estado = 'disponible';

-- fn_marcar_caducadas y v_unidades_por_caducar buscan por fecha entre las vigentes.
CREATE INDEX ix_unidad_vigente_caducidad
    ON unidad_sangre (fecha_caducidad)
    WHERE estado IN ('cuarentena', 'disponible');

-- PostgreSQL NO crea índices automáticamente en las FK (solo en PK/UK). Sin ellos,
-- cada join hijo→padre y cada borrado en el padre recorre la tabla hija completa.
-- (unidad_sangre.id_donacion y prueba_tamizaje.id_donacion ya están cubiertos por
-- sus UK, cuya primera columna es id_donacion.)
CREATE INDEX ix_donacion_donante        ON donacion (id_donante);
CREATE INDEX ix_movimiento_unidad       ON movimiento_inventario (id_unidad, fecha_movimiento);
CREATE INDEX ix_asignacion_solicitud    ON asignacion (id_solicitud);
CREATE INDEX ix_solicitud_hospital      ON solicitud (id_hospital, estado);
CREATE INDEX ix_solicitud_abierta       ON solicitud (prioridad, fecha_solicitud)
    WHERE estado IN ('pendiente', 'parcial');
CREATE INDEX ix_usuario_hospital        ON usuario (id_hospital);

-- Bitácora: crece sin parar y en orden cronológico. Un índice BRIN guarda solo el
-- mín/máx de fecha por bloque de páginas: ocupa KB en vez de MB y basta para filtrar
-- por rango de fechas porque los datos físicos ya están ordenados por inserción.
CREATE INDEX ix_bitacora_fecha_brin ON bitacora_auditoria USING brin (fecha);
CREATE INDEX ix_bitacora_registro   ON bitacora_auditoria (tabla, id_registro);

-- ---------------------------------------------------------------- Vistas --
-- Por defecto una vista se ejecuta con los privilegios de su DUEÑO: quien la consulta
-- no necesita permisos sobre las tablas base y, como el dueño no está sujeto a RLS,
-- vería TODAS las filas. Con `security_invoker = true` (PG15+) la vista usa los
-- privilegios y la RLS de quien la consulta.
--   * v_disponibilidad: dueño (default). Solo agrega conteos, sin datos personales,
--     y así cualquier rol (incluso recepción) puede verla sin acceso a unidad_sangre.
--   * Las demás: security_invoker, para que la RLS y los privilegios por columna sigan
--     aplicando (un hospital solo ve SUS solicitudes pendientes).

-- Etiqueta legible del tipo sanguíneo (A+, O-…).
CREATE FUNCTION fn_tipo_etiqueta(p_grupo varchar, p_rh char) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT p_grupo || p_rh $$;
GRANT EXECUTE ON FUNCTION fn_tipo_etiqueta(varchar, char)
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;

-- Existencias por tipo × componente, incluidas las combinaciones en cero (CROSS JOIN).
CREATE VIEW v_disponibilidad AS
SELECT t.id_tipo_sanguineo,
       fn_tipo_etiqueta(t.grupo_abo, t.factor_rh)                         AS tipo,
       c.id_componente,
       c.nombre                                                           AS componente,
       count(u.id_unidad)                                                 AS disponibles,
       count(u.id_unidad) FILTER (WHERE u.fecha_caducidad <= current_date + 7) AS por_caducar_7d,
       min(u.fecha_caducidad)                                             AS proxima_caducidad
  FROM tipo_sanguineo t
 CROSS JOIN componente c
  LEFT JOIN unidad_sangre u
         ON u.id_tipo_sanguineo = t.id_tipo_sanguineo
        AND u.id_componente = c.id_componente
        AND u.estado = 'disponible'
        AND u.fecha_caducidad >= current_date
 GROUP BY t.id_tipo_sanguineo, t.grupo_abo, t.factor_rh, c.id_componente, c.nombre;

-- Unidades vigentes con días restantes y semáforo (rojo ≤ 2 días, amarillo ≤ 7).
CREATE VIEW v_inventario_unidades WITH (security_invoker = true) AS
SELECT u.id_unidad, u.id_donacion, u.estado,
       u.id_tipo_sanguineo, fn_tipo_etiqueta(t.grupo_abo, t.factor_rh) AS tipo,
       u.id_componente, c.nombre AS componente,
       u.fecha_obtencion, u.fecha_caducidad,
       u.fecha_caducidad - current_date AS dias_restantes,
       CASE WHEN u.estado NOT IN ('cuarentena', 'disponible') THEN NULL
            WHEN u.fecha_caducidad - current_date <= 2 THEN 'rojo'
            WHEN u.fecha_caducidad - current_date <= 7 THEN 'amarillo'
            ELSE 'verde' END AS semaforo
  FROM unidad_sangre u
  JOIN tipo_sanguineo t USING (id_tipo_sanguineo)
  JOIN componente c USING (id_componente);

CREATE VIEW v_unidades_por_caducar WITH (security_invoker = true) AS
SELECT *
  FROM v_inventario_unidades
 WHERE estado IN ('cuarentena', 'disponible')
   AND fecha_caducidad BETWEEN current_date AND current_date + 7;

-- Solicitudes abiertas, ordenadas por prioridad clínica y antigüedad.
CREATE VIEW v_solicitudes_pendientes WITH (security_invoker = true) AS
SELECT s.id_solicitud, s.id_hospital, h.nombre AS hospital,
       s.id_tipo_sanguineo, fn_tipo_etiqueta(t.grupo_abo, t.factor_rh) AS tipo,
       s.id_componente, c.nombre AS componente,
       s.cantidad,
       (SELECT count(*) FROM asignacion a WHERE a.id_solicitud = s.id_solicitud)::integer AS asignadas,
       s.prioridad, s.estado, s.fecha_solicitud,
       round(extract(epoch FROM now() - s.fecha_solicitud) / 3600, 1) AS horas_espera,
       CASE s.prioridad WHEN 'emergencia' THEN 1 WHEN 'urgente' THEN 2 ELSE 3 END AS orden_prioridad
  FROM solicitud s
  JOIN hospital h USING (id_hospital)
  JOIN tipo_sanguineo t USING (id_tipo_sanguineo)
  JOIN componente c USING (id_componente)
 WHERE s.estado IN ('pendiente', 'parcial');

GRANT SELECT ON v_disponibilidad
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;
GRANT SELECT ON v_inventario_unidades, v_unidades_por_caducar TO rol_laboratorio, rol_inventario, rol_admin;
GRANT SELECT ON v_solicitudes_pendientes TO rol_inventario, rol_hospital, rol_admin;
