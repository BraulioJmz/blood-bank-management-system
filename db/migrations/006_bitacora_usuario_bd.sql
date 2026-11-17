-- =============================================================================
-- 006 · bitacora_auditoria.usuario_bd informativo
-- =============================================================================
-- Antes (004): usuario_bd = current_user. Como tg_bitacora es SECURITY DEFINER,
-- current_user SIEMPRE valía 'banco_owner' y la columna no aportaba nada.
--
-- Ahora: coalesce(nullif(current_setting('role'), 'none'), session_user)
--
-- Por qué funciona:
--   * SECURITY DEFINER cambia el "user id" efectivo (lo que devuelve current_user)
--     durante la llamada, pero NO toca el parámetro de configuración `role`.
--     Ese GUC conserva lo que fijó el último SET [LOCAL] ROLE, es decir, el rol de
--     grupo que withContext puso para la petición (rol_inventario, rol_hospital…).
--   * Si nadie hizo SET ROLE (migraciones, seeds, psql directo), `role` vale el
--     texto 'none'; entonces caemos a session_user: el rol con el que se abrió la
--     conexión (banco_owner o app_login). session_user tampoco cambia con
--     SECURITY DEFINER.
-- Así usuario_bd es el rol de BD bajo el que realmente corrió la sentencia, y en
-- peticiones de la app debe coincidir con rol_app (que viene de app.rol).
--
-- Se hace en una migración nueva (no editando 004) porque el runner guarda un
-- checksum por archivo aplicado: modificar 004 rompería las BDs ya migradas.
-- CREATE OR REPLACE conserva los triggers existentes, el dueño y los privilegios
-- (incluido el REVOKE EXECUTE FROM PUBLIC), así que no hay que recrearlos.
CREATE OR REPLACE FUNCTION tg_bitacora() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD) - 'password_hash'; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW) - 'password_hash'; END IF;
    -- Un UPDATE que no cambió nada no se registra (ruido).
    IF TG_OP = 'UPDATE' AND v_old = v_new THEN
        RETURN NULL;
    END IF;
    INSERT INTO bitacora_auditoria (tabla, operacion, id_registro, usuario_bd, usuario_app, rol_app,
                                    valores_anteriores, valores_nuevos)
    VALUES (TG_TABLE_NAME, TG_OP, (coalesce(v_new, v_old) ->> TG_ARGV[0])::integer,
            coalesce(nullif(current_setting('role'), 'none'), session_user),
            nullif(current_setting('app.id_usuario', true), ''),
            nullif(current_setting('app.rol', true), ''),
            v_old, v_new);
    RETURN NULL;
END $$;

COMMENT ON COLUMN bitacora_auditoria.usuario_bd IS
    'Rol de BD de la sentencia: el del SET ROLE de la petición o, si no hubo, session_user. No es current_user (sería el dueño dentro de SECURITY DEFINER).';
