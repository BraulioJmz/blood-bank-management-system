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
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO app_login', current_database());
END $$;

GRANT USAGE ON SCHEMA banco TO rol_recepcion, rol_laboratorio, rol_inventario, rol_hospital, rol_admin;
