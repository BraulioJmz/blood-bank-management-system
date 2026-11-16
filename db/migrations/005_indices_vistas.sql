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
