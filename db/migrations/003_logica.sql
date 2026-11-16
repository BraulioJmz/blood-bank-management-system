-- =============================================================================
-- 003_logica.sql — Reglas de negocio en la base de datos
-- =============================================================================
-- Catálogo de SQLSTATE propios (clase "BS", no usada por PostgreSQL).
-- La API los traduce a HTTP 409/422/404 con el mensaje del RAISE (en español).
--
--   BS001 unidad no disponible (asignada/entregada/caducada)   409
--   BS002 unidad caducada                                        422
--   BS003 tipo sanguíneo no coincide con la solicitud            422
--   BS004 componente no coincide con la solicitud                422
--   BS005 solicitud cerrada (surtida o cancelada)                409
--   BS006 unidad en cuarentena (tamizaje pendiente)              422
--   BS007 registro no encontrado                                 404
--   BS008 donante fuera del rango de edad (18–65)                422
--   BS009 fraccionamiento inválido                               422
--   BS010 transición de estado inválida                          409
--   BS011 sin unidades compatibles disponibles                   409
--   BS012 unidad descartada (tamizaje reactivo)                  422
--   BS013 bitácora inmodificable                                 409
--   BS014 resultado de tamizaje ya capturado                     409
--   BS015 contexto de usuario ausente                            401
--   BS016 usuario y hospital inconsistentes                      422
-- =============================================================================
SET LOCAL search_path = banco, public;

-- ------------------------------------------------- Contexto de la petición --
-- Gotcha: current_setting('x', true) devuelve NULL si la variable nunca se definió
-- en la sesión, pero '' (cadena vacía) si se definió con set_config(..., true) en
-- una transacción anterior de la MISMA conexión del pool. Por eso nullif(…, '').
CREATE FUNCTION fn_usuario_actual_opcional() RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.id_usuario', true), '')::integer
$$;

CREATE FUNCTION fn_usuario_actual() RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v integer := fn_usuario_actual_opcional();
BEGIN
    IF v IS NULL THEN
        RAISE EXCEPTION 'No hay un usuario de aplicación en el contexto de la transacción'
            USING ERRCODE = 'BS015';
    END IF;
    RETURN v;
END $$;

CREATE FUNCTION fn_hospital_actual() RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.id_hospital', true), '')::integer
$$;

-- --------------------------------------------- Usuario ⇔ hospital coherente --
CREATE FUNCTION tg_usuario_hospital() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_rol text;
BEGIN
    SELECT nombre INTO v_rol FROM rol WHERE id_rol = NEW.id_rol;
    IF (v_rol = 'hospital') <> (NEW.id_hospital IS NOT NULL) THEN
        RAISE EXCEPTION 'Solo los usuarios del rol hospital deben tener hospital asignado, y siempre deben tenerlo'
            USING ERRCODE = 'BS016';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER tg_usuario_hospital
BEFORE INSERT OR UPDATE OF id_rol, id_hospital ON usuario
FOR EACH ROW EXECUTE FUNCTION tg_usuario_hospital();
