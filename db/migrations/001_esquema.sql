-- =============================================================================
-- 001_esquema.sql — Esquema base (fuente: docs/contexto/modelo-er.md, TC16)
-- =============================================================================
-- Decisiones de diseño (para el reporte):
--
-- * Esquema propio `banco`: separa los objetos del sistema de `public` y permite
--   otorgar USAGE solo a los roles de la app (004_seguridad).
--
-- * PK con `integer GENERATED ALWAYS AS IDENTITY` (estándar SQL) en vez de `serial`:
--   la secuencia queda ligada a la columna (se borra con ella, el dueño es el mismo)
--   y ALWAYS impide insertar ids "a mano" por accidente (requiere OVERRIDING SYSTEM VALUE).
--
-- * Estados como `varchar + CHECK` en vez de ENUM: el ER los define como varchar y
--   un CHECK se modifica con DROP/ADD CONSTRAINT dentro de una transacción, mientras
--   que quitar o renombrar valores de un ENUM es incómodo (ALTER TYPE … ADD VALUE no
--   se puede revertir y no existe DROP VALUE). Costo: unos bytes más por fila.
--
-- * Fechas-hora como `timestamptz`: guarda un instante absoluto (UTC internamente) y
--   lo muestra en la zona de la sesión (America/Mexico_City). `timestamp` sin zona
--   es ambiguo con cambios de horario.
--
-- * Las FK no llevan ON DELETE CASCADE: en un banco de sangre la trazabilidad exige
--   que nada se borre en cascada (NOM-253). El default (NO ACTION) rechaza el borrado.
-- =============================================================================

CREATE SCHEMA banco;
SET LOCAL search_path = banco, public;

-- ---------------------------------------------------------------- Catálogos --
CREATE TABLE tipo_sanguineo (
    id_tipo_sanguineo integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grupo_abo         varchar(2) NOT NULL CHECK (grupo_abo IN ('A', 'B', 'AB', 'O')),
    factor_rh         char(1)    NOT NULL CHECK (factor_rh IN ('+', '-')),
    CONSTRAINT uk_tipo_sanguineo UNIQUE (grupo_abo, factor_rh)
);

CREATE TABLE componente (
    id_componente  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre         varchar(60) NOT NULL CONSTRAINT uk_componente_nombre UNIQUE,
    vida_util_dias integer     NOT NULL CHECK (vida_util_dias > 0)
);

CREATE TABLE rol (
    id_rol integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre varchar(30) NOT NULL CONSTRAINT uk_rol_nombre UNIQUE
        CHECK (nombre IN ('recepcion', 'laboratorio', 'inventario', 'hospital', 'admin'))
);

-- --------------------------------------------------- Hospitales y usuarios --
CREATE TABLE hospital (
    id_hospital integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      varchar(150) NOT NULL CONSTRAINT uk_hospital_nombre UNIQUE,
    direccion   varchar(250) NOT NULL,
    telefono    varchar(20)  NOT NULL CHECK (telefono ~ '^[0-9 +()-]{7,20}$')
);

CREATE TABLE usuario (
    id_usuario    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      varchar(50)  NOT NULL CONSTRAINT uk_usuario_username UNIQUE
                  CHECK (username ~ '^[a-z0-9._]{3,50}$'),
    nombre        varchar(150) NOT NULL,
    password_hash varchar(255) NOT NULL,           -- desviación aceptada del ER (argon2id)
    id_rol        integer      NOT NULL REFERENCES rol,
    id_hospital   integer      REFERENCES hospital, -- solo usuarios del rol hospital
    activo        boolean      NOT NULL DEFAULT true
);
-- "hospital ⇔ id_hospital no nulo" depende del nombre del rol (otra tabla): un CHECK
-- no puede consultar otras tablas, así que se valida con trigger en 003_logica.

-- --------------------------------------------------- Donación y unidades --
CREATE TABLE donante (
    id_donante        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre            varchar(150) NOT NULL,
    fecha_nacimiento  date         NOT NULL CHECK (fecha_nacimiento > DATE '1900-01-01'),
    sexo              char(1)      NOT NULL CHECK (sexo IN ('M', 'F')),
    id_tipo_sanguineo integer      NOT NULL REFERENCES tipo_sanguineo
);
-- La edad (18–65) cambia con el tiempo: un CHECK con current_date no es inmutable
-- (PostgreSQL no lo re-evalúa), por eso se valida al registrar la donación (003).

CREATE TABLE donacion (
    id_donacion    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_donante     integer      NOT NULL REFERENCES donante,
    id_usuario     integer      NOT NULL REFERENCES usuario,  -- quien captura
    fecha_donacion timestamptz  NOT NULL DEFAULT now(),
    tipo_donacion  varchar(20)  NOT NULL CHECK (tipo_donacion IN ('altruista', 'familiar', 'autologa')),
    volumen_ml     integer      NOT NULL CHECK (volumen_ml BETWEEN 200 AND 550)
);

CREATE TABLE prueba_tamizaje (
    id_prueba       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_donacion     integer     NOT NULL REFERENCES donacion,
    tipo_prueba     varchar(10) NOT NULL CHECK (tipo_prueba IN ('VIH', 'VHB', 'VHC', 'Sifilis', 'Chagas')),
    resultado       varchar(12) NOT NULL DEFAULT 'pendiente'
                    CHECK (resultado IN ('pendiente', 'no_reactivo', 'reactivo')),
    fecha_resultado timestamptz,
    -- Una sola prueba de cada tipo por donación.
    CONSTRAINT uk_prueba_donacion_tipo UNIQUE (id_donacion, tipo_prueba),
    -- Coherencia: hay fecha de resultado si y solo si ya no está pendiente.
    CONSTRAINT ck_prueba_fecha CHECK ((resultado = 'pendiente') = (fecha_resultado IS NULL))
);

CREATE TABLE unidad_sangre (
    id_unidad         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_donacion       integer     NOT NULL REFERENCES donacion,
    id_componente     integer     NOT NULL REFERENCES componente,
    id_tipo_sanguineo integer     NOT NULL REFERENCES tipo_sanguineo,
    fecha_obtencion   date        NOT NULL,
    fecha_caducidad   date        NOT NULL,
    -- Falla segura: toda unidad nace en cuarentena.
    estado            varchar(12) NOT NULL DEFAULT 'cuarentena'
                      CHECK (estado IN ('cuarentena', 'disponible', 'asignada', 'entregada', 'caducada', 'descartada')),
    CONSTRAINT ck_unidad_fechas CHECK (fecha_caducidad > fecha_obtencion),
    -- Una donación se fracciona una sola vez por componente.
    CONSTRAINT uk_unidad_donacion_componente UNIQUE (id_donacion, id_componente)
);

CREATE TABLE movimiento_inventario (
    id_movimiento    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_unidad        integer      NOT NULL REFERENCES unidad_sangre,
    id_usuario       integer      REFERENCES usuario,  -- NULL = proceso del sistema (p. ej. caducidad automática)
    tipo_movimiento  varchar(15)  NOT NULL CHECK (tipo_movimiento IN ('entrada', 'salida', 'baja', 'cambio_estado')),
    fecha_movimiento timestamptz  NOT NULL DEFAULT now(),
    motivo           varchar(250) NOT NULL
);

-- ------------------------------------------------- Solicitudes y asignación --
CREATE TABLE solicitud (
    id_solicitud      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_hospital       integer     NOT NULL REFERENCES hospital,
    id_tipo_sanguineo integer     NOT NULL REFERENCES tipo_sanguineo,
    id_componente     integer     NOT NULL REFERENCES componente,
    cantidad          integer     NOT NULL CHECK (cantidad BETWEEN 1 AND 50),
    prioridad         varchar(12) NOT NULL DEFAULT 'normal' CHECK (prioridad IN ('normal', 'urgente', 'emergencia')),
    estado            varchar(12) NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'parcial', 'surtida', 'cancelada')),
    fecha_solicitud   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asignacion (
    id_asignacion    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_solicitud     integer     NOT NULL REFERENCES solicitud,
    -- UK: segunda barrera contra la doble asignación (la primera es FOR UPDATE en
    -- sp_asignar_unidad). Aunque una transacción esquivara el bloqueo, el índice
    -- único rechazaría la segunda fila con unique_violation (23505).
    id_unidad        integer     NOT NULL REFERENCES unidad_sangre CONSTRAINT uk_asignacion_unidad UNIQUE,
    id_usuario       integer     NOT NULL REFERENCES usuario,  -- quien autoriza
    fecha_asignacion timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------- Auditoría --
CREATE TABLE bitacora_auditoria (
    id_bitacora        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- bigint: crece rápido
    tabla              varchar(63)  NOT NULL,
    operacion          varchar(6)   NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
    id_registro        integer,
    usuario_bd         varchar(63)  NOT NULL,   -- current_user (rol de BD efectivo)
    usuario_app        varchar(20),             -- desviación: app.id_usuario
    rol_app            varchar(63),             -- desviación: app.rol (rol de la app en withContext)
    fecha              timestamptz  NOT NULL DEFAULT now(),
    valores_anteriores jsonb,
    valores_nuevos     jsonb
);

COMMENT ON SCHEMA banco IS 'Sistema de administración de banco de sangre (ABD UDG/CUCEI)';
COMMENT ON COLUMN unidad_sangre.estado IS 'cuarentena → disponible → asignada → entregada; también caducada y descartada';
COMMENT ON TABLE bitacora_auditoria IS 'Solo inserción: ningún rol de la app tiene UPDATE/DELETE (004_seguridad)';
