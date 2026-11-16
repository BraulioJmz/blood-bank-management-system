-- =============================================================================
-- 004_seguridad.sql — Privilegios mínimos, RLS y bitácora de auditoría
-- =============================================================================
-- Los roles (rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital,
-- rol_admin, app_login) se crean a nivel clúster en db/lib/bootstrap.ts.
--
-- Modelo:
--   app_login (LOGIN, NOINHERIT, sin privilegios propios)
--      └─ SET LOCAL ROLE rol_<x>  ← lo hace DbService.withContext() en cada petición
--            └─ privilegios mínimos de ese rol + RLS + bitácora
-- Nada se otorga a PUBLIC: por defecto un rol nuevo no puede ver nada del esquema.
-- =============================================================================
SET LOCAL search_path = banco, public;

-- Conectarse a la BD (CONNECT se revocó a PUBLIC al crearla). El nombre de la base
-- no se puede escribir fijo (banco / banco_test): format('%I') lo cita como identificador.
-- Sin TEMPORARY: los roles de la app no pueden crear objetos en pg_temp.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_login', current_database());
END $$;

GRANT USAGE ON SCHEMA banco TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;

-- =============================================================================
-- Privilegios por tabla (mínimos por rol)
-- =============================================================================
-- Catálogos: lectura para todos.
GRANT SELECT ON tipo_sanguineo, componente, rol, hospital
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;

-- usuario: privilegio POR COLUMNA. Todos pueden ver quién es quién (nombres en
-- movimientos, asignaciones), pero nadie lee password_hash: un SELECT * fallaría con
-- "permission denied for table usuario". El login usa fn_credenciales_login().
GRANT SELECT (id_usuario, username, nombre, id_rol, id_hospital, activo) ON usuario
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;

-- Recepción: registra donantes y donaciones; consulta el avance del tamizaje.
GRANT SELECT, INSERT ON donante, donacion TO rol_recepcion;
GRANT UPDATE (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo) ON donante TO rol_recepcion;
GRANT SELECT ON prueba_tamizaje TO rol_recepcion;

-- Laboratorio: captura resultados (solo la columna resultado) y fracciona.
GRANT SELECT ON donante, donacion, prueba_tamizaje, unidad_sangre TO rol_laboratorio;
GRANT UPDATE (resultado) ON prueba_tamizaje TO rol_laboratorio;

-- Inventario: consulta todo lo operativo; modifica SOLO mediante funciones.
-- Nótese: ningún rol tiene INSERT/UPDATE/DELETE sobre unidad_sangre, asignacion
-- ni movimiento_inventario (regla 6 de CLAUDE.md).
GRANT SELECT ON donante, donacion, prueba_tamizaje, unidad_sangre, movimiento_inventario,
                solicitud, asignacion
    TO rol_inventario;

-- Hospital: crea y consulta SUS solicitudes (RLS más abajo). No ve donantes ni
-- donaciones (datos personales, LFPDPPP), y de unidad_sangre solo columnas sin
-- id_donacion: no puede ligar una unidad con la persona que donó.
GRANT SELECT ON solicitud, asignacion TO rol_hospital;
GRANT INSERT (id_hospital, id_tipo_sanguineo, id_componente, cantidad, prioridad) ON solicitud TO rol_hospital;
GRANT SELECT (id_unidad, id_componente, id_tipo_sanguineo, fecha_caducidad, estado) ON unidad_sangre TO rol_hospital;

-- Admin: lectura global, administra usuarios y hospitales, lee la bitácora.
GRANT SELECT ON donante, donacion, prueba_tamizaje, unidad_sangre, movimiento_inventario,
                solicitud, asignacion, bitacora_auditoria
    TO rol_admin;
GRANT INSERT, UPDATE ON hospital TO rol_admin;
GRANT INSERT (username, nombre, password_hash, id_rol, id_hospital, activo),
      UPDATE (nombre, password_hash, id_rol, id_hospital, activo) ON usuario TO rol_admin;

-- =============================================================================
-- EXECUTE sobre funciones/procedimientos (todas con REVOKE … FROM PUBLIC en 003)
-- =============================================================================
GRANT EXECUTE ON FUNCTION fn_usuario_actual(), fn_usuario_actual_opcional(), fn_hospital_actual()
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;
GRANT EXECUTE ON FUNCTION fn_fraccionar_donacion(integer, integer[]) TO rol_laboratorio;
GRANT EXECUTE ON PROCEDURE sp_asignar_unidad(integer, integer, integer),
                           sp_asignar_automatica(integer, integer) TO rol_inventario;
GRANT EXECUTE ON FUNCTION fn_dar_baja(integer, text), fn_entregar_unidad(integer) TO rol_inventario;
-- Idempotente y sin parámetros: cualquier pantalla de consulta puede invocarla.
GRANT EXECUTE ON FUNCTION fn_marcar_caducadas()
    TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;

-- fn_cancelar_solicitud (003) era SECURITY INVOKER: eso obligaría a dar UPDATE(estado)
-- sobre solicitud al hospital, y entonces podría marcar sus solicitudes como 'surtida'
-- a mano. Se redefine como SECURITY DEFINER y valida la pertenencia explícitamente:
-- el hospital solo cancela si la solicitud es suya.
CREATE OR REPLACE FUNCTION fn_cancelar_solicitud(p_id_solicitud integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    s solicitud%ROWTYPE;
BEGIN
    SELECT * INTO s FROM solicitud WHERE id_solicitud = p_id_solicitud FOR UPDATE;
    -- Para un hospital, una solicitud ajena "no existe" (mismo mensaje que la RLS).
    IF NOT FOUND OR (fn_hospital_actual() IS NOT NULL AND s.id_hospital <> fn_hospital_actual()) THEN
        RAISE EXCEPTION 'La solicitud % no existe', p_id_solicitud USING ERRCODE = 'BS007';
    END IF;
    IF s.estado <> 'pendiente' THEN
        RAISE EXCEPTION 'Solo se cancelan solicitudes pendientes (la % está %)', p_id_solicitud, s.estado
            USING ERRCODE = 'BS010';
    END IF;
    UPDATE solicitud SET estado = 'cancelada' WHERE id_solicitud = p_id_solicitud;
END $$;
REVOKE EXECUTE ON FUNCTION fn_cancelar_solicitud(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancelar_solicitud(integer) TO rol_hospital, rol_inventario;

-- Login: antes de autenticarse no hay rol de aplicación, y app_login no tiene
-- privilegios propios. Esta función devuelve SOLO lo necesario para verificar la
-- contraseña de UN usuario activo; app_login nunca puede listar la tabla.
CREATE FUNCTION fn_credenciales_login(p_username text)
RETURNS TABLE (id_usuario integer, nombre varchar, password_hash varchar, rol varchar, id_hospital integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = banco, pg_temp AS $$
    SELECT u.id_usuario, u.nombre, u.password_hash, r.nombre, u.id_hospital
      FROM usuario u JOIN rol r USING (id_rol)
     WHERE u.username = lower(p_username) AND u.activo
$$;
REVOKE EXECUTE ON FUNCTION fn_credenciales_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_credenciales_login(text) TO app_login;
-- app_login necesita USAGE en el esquema solo para resolver el nombre de la función.
GRANT USAGE ON SCHEMA banco TO app_login;
