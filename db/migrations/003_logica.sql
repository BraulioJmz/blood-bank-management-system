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

-- =============================================================================
-- Patrón SECURITY DEFINER (se repite en todo el archivo)
-- =============================================================================
-- Una función SECURITY DEFINER corre con los privilegios de su DUEÑO (banco_owner),
-- no de quien la llama. Así los roles de la app pueden cambiar unidades sin tener
-- UPDATE sobre unidad_sangre: solo pueden hacerlo a través de estas funciones,
-- que validan las reglas. Para que sea seguro:
--   1. SET search_path = banco, pg_temp: el search_path queda fijo dentro de la
--      función. Si no, quien la llama podría crear un objeto homónimo (p. ej. una
--      tabla o un operador "=") en un esquema propio o en pg_temp que se resolviera
--      antes y ejecutara código con privilegios del dueño. pg_temp va al final
--      porque, si no se menciona, PostgreSQL lo busca PRIMERO.
--   2. REVOKE EXECUTE … FROM PUBLIC: por defecto toda función es ejecutable por
--      PUBLIC (todos los roles). Se revoca y se otorga solo al rol que la usa
--      (los GRANT están en 004_seguridad, donde se crean los roles).
-- Las funciones de trigger no necesitan GRANT EXECUTE: PostgreSQL no comprueba
-- EXECUTE al disparar un trigger, solo el privilegio sobre la tabla (INSERT/UPDATE).
-- =============================================================================

-- ------------------------------------------------------ Registro de donación --
-- BEFORE INSERT: valida la edad del donante y toma el capturista del contexto.
CREATE FUNCTION tg_donacion_validar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_nac  date;
    v_edad integer;
BEGIN
    SELECT fecha_nacimiento INTO v_nac FROM donante WHERE id_donante = NEW.id_donante;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El donante % no existe', NEW.id_donante USING ERRCODE = 'BS007';
    END IF;
    v_edad := date_part('year', age(NEW.fecha_donacion::date, v_nac));
    IF v_edad NOT BETWEEN 18 AND 65 THEN
        RAISE EXCEPTION 'El donante tiene % años; solo pueden donar personas de 18 a 65', v_edad
            USING ERRCODE = 'BS008';
    END IF;
    NEW.id_usuario := coalesce(NEW.id_usuario, fn_usuario_actual());
    RETURN NEW;
END $$;

CREATE TRIGGER tg_donacion_validar
BEFORE INSERT ON donacion
FOR EACH ROW EXECUTE FUNCTION tg_donacion_validar();

-- AFTER INSERT: crea las 5 pruebas obligatorias en 'pendiente'.
-- SECURITY DEFINER: recepción registra la donación, pero no tiene (ni debe tener)
-- INSERT sobre prueba_tamizaje.
CREATE FUNCTION tg_donacion_crear_pruebas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
BEGIN
    INSERT INTO prueba_tamizaje (id_donacion, tipo_prueba)
    SELECT NEW.id_donacion, t
    FROM unnest(ARRAY['VIH', 'VHB', 'VHC', 'Sifilis', 'Chagas']) AS t;
    RETURN NULL;  -- el valor de retorno de un trigger AFTER se ignora
END $$;
REVOKE EXECUTE ON FUNCTION tg_donacion_crear_pruebas() FROM PUBLIC;

CREATE TRIGGER tg_donacion_crear_pruebas
AFTER INSERT ON donacion
FOR EACH ROW EXECUTE FUNCTION tg_donacion_crear_pruebas();
