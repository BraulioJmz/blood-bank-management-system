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

-- ------------------------------------------------------ Movimientos (interno) --
CREATE FUNCTION fn_registrar_movimiento(p_id_unidad integer, p_tipo text, p_motivo text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
    INSERT INTO movimiento_inventario (id_unidad, id_usuario, tipo_movimiento, motivo)
    VALUES (p_id_unidad, fn_usuario_actual_opcional(), p_tipo, p_motivo)
$$;
REVOKE EXECUTE ON FUNCTION fn_registrar_movimiento(integer, text, text) FROM PUBLIC;

-- ---------------------------------------- Falla segura: liberación / descarte --
-- Evalúa las pruebas de una donación y mueve sus unidades:
--   * alguna 'reactivo'          → todas las unidades (cuarentena/disponible) a 'descartada' + baja
--   * las 5 'no_reactivo'         → unidades en cuarentena a 'disponible' (o 'caducada' si ya venció)
--   * en otro caso (pendientes)   → no cambia nada: la unidad sigue en cuarentena (falla segura)
--
-- CONCURRENCIA: dos laboratoristas pueden capturar a la vez las 2 últimas pruebas de
-- la misma donación. En READ COMMITTED, cada transacción no ve el cambio no confirmado
-- de la otra: cada una contaría 4/5 y NINGUNA liberaría las unidades (anomalía de
-- "write skew"). Por eso se bloquea primero la fila de la donación con FOR UPDATE:
-- la segunda transacción espera a que la primera haga COMMIT y, como en READ COMMITTED
-- cada sentencia toma un snapshot nuevo, su conteo posterior sí ve las 5 pruebas.
CREATE FUNCTION fn_evaluar_tamizaje(p_id_donacion integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    v_reactivas   text;
    v_no_reactivo integer;
    r             record;
BEGIN
    PERFORM 1 FROM donacion WHERE id_donacion = p_id_donacion FOR UPDATE;

    SELECT string_agg(tipo_prueba, ', ' ORDER BY tipo_prueba) FILTER (WHERE resultado = 'reactivo'),
           count(*) FILTER (WHERE resultado = 'no_reactivo')
      INTO v_reactivas, v_no_reactivo
      FROM prueba_tamizaje
     WHERE id_donacion = p_id_donacion;

    IF v_reactivas IS NOT NULL THEN
        FOR r IN
            UPDATE unidad_sangre SET estado = 'descartada'
             WHERE id_donacion = p_id_donacion AND estado IN ('cuarentena', 'disponible')
            RETURNING id_unidad
        LOOP
            PERFORM fn_registrar_movimiento(r.id_unidad, 'baja', 'Tamizaje reactivo: ' || v_reactivas);
        END LOOP;
    ELSIF v_no_reactivo = 5 THEN
        FOR r IN
            UPDATE unidad_sangre
               SET estado = CASE WHEN fecha_caducidad < current_date THEN 'caducada' ELSE 'disponible' END
             WHERE id_donacion = p_id_donacion AND estado = 'cuarentena'
            RETURNING id_unidad, estado
        LOOP
            PERFORM fn_registrar_movimiento(r.id_unidad, 'cambio_estado',
                CASE r.estado WHEN 'disponible' THEN 'Liberada: 5 pruebas no reactivas'
                              ELSE 'Caducada al liberarse' END);
        END LOOP;
    END IF;
END $$;
REVOKE EXECUTE ON FUNCTION fn_evaluar_tamizaje(integer) FROM PUBLIC;

-- BEFORE UPDATE: un resultado definitivo no se puede cambiar (integridad del tamizaje)
-- y la fecha de resultado la pone la BD, no el cliente.
CREATE FUNCTION tg_prueba_validar() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.resultado <> 'pendiente' THEN
        RAISE EXCEPTION 'La prueba % de la donación % ya tiene resultado (%); no se puede modificar',
            OLD.tipo_prueba, OLD.id_donacion, OLD.resultado USING ERRCODE = 'BS014';
    END IF;
    NEW.fecha_resultado := CASE WHEN NEW.resultado = 'pendiente' THEN NULL ELSE now() END;
    RETURN NEW;
END $$;

CREATE TRIGGER tg_prueba_validar
BEFORE UPDATE ON prueba_tamizaje
FOR EACH ROW EXECUTE FUNCTION tg_prueba_validar();

-- AFTER UPDATE: dispara la evaluación. SECURITY DEFINER porque laboratorio no tiene
-- UPDATE sobre unidad_sangre ni INSERT sobre movimiento_inventario.
CREATE FUNCTION tg_prueba_evaluar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
BEGIN
    PERFORM fn_evaluar_tamizaje(NEW.id_donacion);
    RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION tg_prueba_evaluar() FROM PUBLIC;

CREATE TRIGGER tg_prueba_evaluar
AFTER UPDATE OF resultado ON prueba_tamizaje
FOR EACH ROW WHEN (NEW.resultado <> 'pendiente')
EXECUTE FUNCTION tg_prueba_evaluar();

-- ------------------------------------------------------------ Fraccionamiento --
-- Crea una unidad por componente con fecha_caducidad = fecha_obtencion + vida_util_dias,
-- en 'cuarentena' (DEFAULT de la tabla), y registra su movimiento de 'entrada'.
-- Si el tamizaje ya estaba completo, fn_evaluar_tamizaje las libera o descarta.
CREATE FUNCTION fn_fraccionar_donacion(p_id_donacion integer, p_componentes integer[])
RETURNS SETOF unidad_sangre
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    v_donacion donacion%ROWTYPE;
    v_tipo     integer;
    v_invalido integer;
    v_repetido text;
    r          unidad_sangre%ROWTYPE;
BEGIN
    -- FOR UPDATE: serializa fraccionamientos simultáneos de la misma donación.
    SELECT * INTO v_donacion FROM donacion WHERE id_donacion = p_id_donacion FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La donación % no existe', p_id_donacion USING ERRCODE = 'BS007';
    END IF;
    IF p_componentes IS NULL OR cardinality(p_componentes) = 0 THEN
        RAISE EXCEPTION 'Indica al menos un componente' USING ERRCODE = 'BS009';
    END IF;
    IF cardinality(p_componentes) <> (SELECT count(DISTINCT c) FROM unnest(p_componentes) c) THEN
        RAISE EXCEPTION 'La lista de componentes tiene repetidos' USING ERRCODE = 'BS009';
    END IF;
    SELECT c INTO v_invalido FROM unnest(p_componentes) c
     WHERE NOT EXISTS (SELECT 1 FROM componente WHERE id_componente = c) LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'El componente % no existe', v_invalido USING ERRCODE = 'BS009';
    END IF;
    SELECT string_agg(co.nombre, ', ') INTO v_repetido
      FROM unidad_sangre u JOIN componente co USING (id_componente)
     WHERE u.id_donacion = p_id_donacion AND u.id_componente = ANY (p_componentes);
    IF v_repetido IS NOT NULL THEN
        RAISE EXCEPTION 'La donación % ya tiene unidades de: %', p_id_donacion, v_repetido USING ERRCODE = 'BS009';
    END IF;
    IF EXISTS (SELECT 1 FROM prueba_tamizaje WHERE id_donacion = p_id_donacion AND resultado = 'reactivo') THEN
        RAISE EXCEPTION 'La donación % tiene tamizaje reactivo; no se fracciona', p_id_donacion
            USING ERRCODE = 'BS009';
    END IF;

    SELECT id_tipo_sanguineo INTO v_tipo FROM donante WHERE id_donante = v_donacion.id_donante;

    FOR r IN
        INSERT INTO unidad_sangre (id_donacion, id_componente, id_tipo_sanguineo, fecha_obtencion, fecha_caducidad)
        SELECT p_id_donacion, co.id_componente, v_tipo,
               v_donacion.fecha_donacion::date,
               v_donacion.fecha_donacion::date + co.vida_util_dias   -- date + integer = date
          FROM componente co
         WHERE co.id_componente = ANY (p_componentes)
        RETURNING *
    LOOP
        PERFORM fn_registrar_movimiento(r.id_unidad, 'entrada', 'Fraccionamiento de la donación ' || p_id_donacion);
    END LOOP;

    PERFORM fn_evaluar_tamizaje(p_id_donacion);

    RETURN QUERY SELECT * FROM unidad_sangre WHERE id_donacion = p_id_donacion ORDER BY id_unidad;
END $$;
REVOKE EXECUTE ON FUNCTION fn_fraccionar_donacion(integer, integer[]) FROM PUBLIC;

-- ------------------------------------------------ Estado de solicitud (interno) --
CREATE FUNCTION fn_recalcular_solicitud(p_id_solicitud integer) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
    UPDATE solicitud s
       SET estado = CASE
                      WHEN a.n >= s.cantidad THEN 'surtida'
                      WHEN a.n > 0           THEN 'parcial'
                      ELSE 'pendiente'
                    END
      FROM (SELECT count(*) AS n FROM asignacion WHERE id_solicitud = p_id_solicitud) a
     WHERE s.id_solicitud = p_id_solicitud AND s.estado <> 'cancelada'
    RETURNING s.estado
$$;
REVOKE EXECUTE ON FUNCTION fn_recalcular_solicitud(integer) FROM PUBLIC;

-- ---------------------------------------- Asignación con control de concurrencia --
-- PROCEDURE (se invoca con CALL) en lugar de FUNCTION: es una operación, no un cálculo;
-- devuelve el id creado por el parámetro INOUT. No hace COMMIT propio: corre dentro de
-- la transacción de withContext, así que cualquier RAISE revierte TODO (asignación,
-- cambio de estado y movimiento) — atomicidad.
--
-- Bloqueos, siempre en el mismo orden (solicitud → unidad) para evitar deadlocks:
--   1. solicitud FOR UPDATE: serializa asignaciones a la misma solicitud, así dos
--      operadores no pueden rebasar `cantidad` ni pisarse el recálculo de estado.
--   2. unidad FOR UPDATE: si dos transacciones quieren la MISMA unidad, la segunda se
--      bloquea en esta línea hasta que la primera termina. Al despertar, READ COMMITTED
--      vuelve a leer la fila ya actualizada (estado = 'asignada') y la validación la
--      rechaza con BS001. Sin FOR UPDATE, ambas leerían 'disponible' y ambas asignarían.
--   3. UK uk_asignacion_unidad: segunda barrera; si algo esquivara el bloqueo, el
--      INSERT duplicado fallaría con 23505.
CREATE PROCEDURE sp_asignar_unidad(p_id_solicitud integer, p_id_unidad integer,
                                   INOUT p_id_asignacion integer DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    v_usuario   integer := fn_usuario_actual();
    s           solicitud%ROWTYPE;
    u           unidad_sangre%ROWTYPE;
    v_asignadas integer;
BEGIN
    SELECT * INTO s FROM solicitud WHERE id_solicitud = p_id_solicitud FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La solicitud % no existe', p_id_solicitud USING ERRCODE = 'BS007';
    END IF;
    IF s.estado NOT IN ('pendiente', 'parcial') THEN
        RAISE EXCEPTION 'La solicitud % está %; no admite más asignaciones', p_id_solicitud, s.estado
            USING ERRCODE = 'BS005';
    END IF;
    SELECT count(*) INTO v_asignadas FROM asignacion WHERE id_solicitud = p_id_solicitud;
    IF v_asignadas >= s.cantidad THEN
        RAISE EXCEPTION 'La solicitud % ya tiene sus % unidades', p_id_solicitud, s.cantidad
            USING ERRCODE = 'BS005';
    END IF;

    SELECT * INTO u FROM unidad_sangre WHERE id_unidad = p_id_unidad FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La unidad % no existe', p_id_unidad USING ERRCODE = 'BS007';
    END IF;
    CASE u.estado
        WHEN 'disponible' THEN NULL;
        WHEN 'cuarentena' THEN
            RAISE EXCEPTION 'La unidad % está en cuarentena: su tamizaje no está completo', p_id_unidad
                USING ERRCODE = 'BS006';
        WHEN 'descartada' THEN
            RAISE EXCEPTION 'La unidad % fue descartada (tamizaje reactivo o baja)', p_id_unidad
                USING ERRCODE = 'BS012';
        WHEN 'caducada' THEN
            RAISE EXCEPTION 'La unidad % está caducada', p_id_unidad USING ERRCODE = 'BS002';
        ELSE
            RAISE EXCEPTION 'La unidad % no está disponible (estado: %)', p_id_unidad, u.estado
                USING ERRCODE = 'BS001';
    END CASE;
    -- Puede estar 'disponible' pero vencida si fn_marcar_caducadas aún no corrió hoy.
    IF u.fecha_caducidad < current_date THEN
        RAISE EXCEPTION 'La unidad % caducó el %', p_id_unidad, u.fecha_caducidad USING ERRCODE = 'BS002';
    END IF;
    IF u.id_tipo_sanguineo <> s.id_tipo_sanguineo THEN
        RAISE EXCEPTION 'La unidad % es de otro tipo sanguíneo que la solicitud', p_id_unidad
            USING ERRCODE = 'BS003';
    END IF;
    IF u.id_componente <> s.id_componente THEN
        RAISE EXCEPTION 'La unidad % es de otro componente que la solicitud', p_id_unidad
            USING ERRCODE = 'BS004';
    END IF;

    INSERT INTO asignacion (id_solicitud, id_unidad, id_usuario)
    VALUES (p_id_solicitud, p_id_unidad, v_usuario)
    RETURNING id_asignacion INTO p_id_asignacion;

    UPDATE unidad_sangre SET estado = 'asignada' WHERE id_unidad = p_id_unidad;
    PERFORM fn_registrar_movimiento(p_id_unidad, 'salida', 'Asignada a la solicitud ' || p_id_solicitud);
    PERFORM fn_recalcular_solicitud(p_id_solicitud);
END $$;
REVOKE EXECUTE ON PROCEDURE sp_asignar_unidad(integer, integer, integer) FROM PUBLIC;

-- ----------------------------------------------- Asignación automática FEFO --
-- FEFO (First Expired, First Out): toma primero las unidades que caducan antes,
-- para reducir el desecho por caducidad.
--
-- FOR UPDATE SKIP LOCKED: si otra transacción ya tiene bloqueada una unidad (porque
-- la está asignando a otra solicitud), esta consulta la SALTA en vez de esperar.
-- Así dos asignaciones automáticas simultáneas se reparten unidades distintas sin
-- bloquearse entre sí (patrón de "cola de trabajo"). En la manual NO se usa SKIP
-- LOCKED: ahí el usuario eligió una unidad concreta y lo correcto es esperar y
-- validar.
CREATE PROCEDURE sp_asignar_automatica(p_id_solicitud integer, INOUT p_asignadas integer DEFAULT 0)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = banco, pg_temp AS $$
DECLARE
    s          solicitud%ROWTYPE;
    v_faltan   integer;
    v_unidad   integer;
    v_id       integer;
BEGIN
    p_asignadas := 0;
    SELECT * INTO s FROM solicitud WHERE id_solicitud = p_id_solicitud FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La solicitud % no existe', p_id_solicitud USING ERRCODE = 'BS007';
    END IF;
    IF s.estado NOT IN ('pendiente', 'parcial') THEN
        RAISE EXCEPTION 'La solicitud % está %; no admite más asignaciones', p_id_solicitud, s.estado
            USING ERRCODE = 'BS005';
    END IF;
    v_faltan := s.cantidad - (SELECT count(*) FROM asignacion WHERE id_solicitud = p_id_solicitud);

    FOR v_unidad IN
        SELECT id_unidad
          FROM unidad_sangre
         WHERE estado = 'disponible'
           AND id_tipo_sanguineo = s.id_tipo_sanguineo
           AND id_componente = s.id_componente
           AND fecha_caducidad >= current_date
         ORDER BY fecha_caducidad, id_unidad
         LIMIT v_faltan
           FOR UPDATE SKIP LOCKED
    LOOP
        -- Reutiliza todas las validaciones y efectos de la asignación manual.
        v_id := NULL;
        CALL sp_asignar_unidad(p_id_solicitud, v_unidad, v_id);
        p_asignadas := p_asignadas + 1;
    END LOOP;

    IF p_asignadas = 0 THEN
        RAISE EXCEPTION 'No hay unidades disponibles compatibles para la solicitud %', p_id_solicitud
            USING ERRCODE = 'BS011';
    END IF;
END $$;
REVOKE EXECUTE ON PROCEDURE sp_asignar_automatica(integer, integer) FROM PUBLIC;
