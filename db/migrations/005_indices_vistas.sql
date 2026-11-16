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

-- ---------------------------------------------------------- Trazabilidad --
-- Una fila por unidad con toda su cadena (hemovigilancia, NOM-253):
--   unidad → donación → donante → pruebas → unidades hermanas → asignación → hospital
-- Las listas (pruebas, hermanas) se agregan como jsonb con subconsultas correlacionadas;
-- consultada por id_unidad (WHERE id_unidad = $1) cada subconsulta usa un índice.
-- security_invoker: contiene datos personales del donante; solo la ven roles con
-- SELECT sobre donante (inventario, admin).
CREATE VIEW v_trazabilidad_unidad WITH (security_invoker = true) AS
SELECT u.id_unidad, u.estado, fn_tipo_etiqueta(t.grupo_abo, t.factor_rh) AS tipo,
       c.nombre AS componente, u.fecha_obtencion, u.fecha_caducidad,
       d.id_donacion, d.fecha_donacion, d.tipo_donacion, d.volumen_ml,
       cap.nombre AS capturo,
       dn.id_donante, dn.nombre AS donante, dn.sexo, dn.fecha_nacimiento,
       (SELECT jsonb_agg(jsonb_build_object('tipo', p.tipo_prueba, 'resultado', p.resultado,
                                            'fecha', p.fecha_resultado) ORDER BY p.tipo_prueba)
          FROM prueba_tamizaje p WHERE p.id_donacion = d.id_donacion) AS pruebas,
       (SELECT jsonb_agg(jsonb_build_object('id_unidad', h.id_unidad, 'componente', hc.nombre,
                                            'estado', h.estado) ORDER BY h.id_unidad)
          FROM unidad_sangre h JOIN componente hc USING (id_componente)
         WHERE h.id_donacion = d.id_donacion AND h.id_unidad <> u.id_unidad) AS hermanas,
       a.id_asignacion, a.fecha_asignacion, aut.nombre AS autorizo,
       s.id_solicitud, s.prioridad, s.estado AS estado_solicitud,
       ho.id_hospital, ho.nombre AS hospital
  FROM unidad_sangre u
  JOIN tipo_sanguineo t USING (id_tipo_sanguineo)
  JOIN componente c USING (id_componente)
  JOIN donacion d USING (id_donacion)
  JOIN usuario cap ON cap.id_usuario = d.id_usuario
  JOIN donante dn ON dn.id_donante = d.id_donante
  LEFT JOIN asignacion a ON a.id_unidad = u.id_unidad
  LEFT JOIN usuario aut ON aut.id_usuario = a.id_usuario
  LEFT JOIN solicitud s ON s.id_solicitud = a.id_solicitud
  LEFT JOIN hospital ho ON ho.id_hospital = s.id_hospital;

GRANT SELECT ON v_trazabilidad_unidad TO rol_inventario, rol_admin;

-- ----------------------------------------------- Vista materializada: dashboard --
-- Una vista materializada GUARDA el resultado (como una tabla). Leerla es instantáneo
-- aunque haya cientos de miles de unidades; el costo es que hay que refrescarla.
-- Aquí: conteo de unidades por componente × estado.
CREATE MATERIALIZED VIEW mv_dashboard AS
SELECT c.id_componente, c.nombre AS componente, e.estado,
       count(u.id_unidad)::integer AS total,
       now() AS refrescado_en
  FROM componente c
 CROSS JOIN unnest(ARRAY['cuarentena', 'disponible', 'asignada', 'entregada', 'caducada', 'descartada']) AS e(estado)
  LEFT JOIN unidad_sangre u ON u.id_componente = c.id_componente AND u.estado = e.estado
 GROUP BY c.id_componente, c.nombre, e.estado;

-- REFRESH … CONCURRENTLY exige un índice ÚNICO: compara el resultado nuevo contra el
-- anterior fila por fila y aplica solo las diferencias, sin bloquear a los lectores.
-- (Un REFRESH normal toma ACCESS EXCLUSIVE y bloquea las lecturas mientras corre.)
CREATE UNIQUE INDEX ux_mv_dashboard ON mv_dashboard (id_componente, estado);

-- Refresca solo si la foto tiene más de p_max_edad. Solo el dueño puede hacer REFRESH,
-- por eso es SECURITY DEFINER.
-- pg_try_advisory_xact_lock: candado "de aviso" a nivel aplicación (no bloquea filas
-- ni tablas). Si 20 peticiones del dashboard llegan juntas, solo la primera refresca;
-- las demás no esperan y leen la foto vigente. Se libera solo al terminar la transacción.
CREATE FUNCTION fn_refrescar_dashboard(p_max_edad interval DEFAULT interval '1 minute')
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    v_ultima timestamptz;
BEGIN
    SELECT max(refrescado_en) INTO v_ultima FROM mv_dashboard;
    IF v_ultima < now() - p_max_edad
       AND pg_try_advisory_xact_lock(hashtext('banco.mv_dashboard')) THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard;
        SELECT max(refrescado_en) INTO v_ultima FROM mv_dashboard;
    END IF;
    RETURN v_ultima;
END $$;
REVOKE EXECUTE ON FUNCTION fn_refrescar_dashboard(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_refrescar_dashboard(interval)
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;
GRANT SELECT ON mv_dashboard TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;
