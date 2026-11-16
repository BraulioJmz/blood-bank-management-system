# Modelo entidad-relación (TC16) — fuente de verdad del esquema

Notación pata de gallo. PK = llave primaria · FK = llave foránea · UK = única.
Agrupación: Catálogos · Donación y unidades · Hospitales y solicitudes · Seguridad y auditoría.

## Catálogos
**TIPO_SANGUINEO**: id_tipo_sanguineo PK int · grupo_abo char · factor_rh char
**COMPONENTE**: id_componente PK int · nombre varchar · vida_util_dias int
**ROL**: id_rol PK int · nombre varchar

## Donación y unidades
**DONANTE**: id_donante PK · nombre varchar · fecha_nacimiento date · sexo char · id_tipo_sanguineo FK
**DONACION**: id_donacion PK · id_donante FK · id_usuario FK (quien captura) · fecha_donacion timestamp · tipo_donacion varchar · volumen_ml int
**PRUEBA_TAMIZAJE**: id_prueba PK · id_donacion FK · tipo_prueba varchar · resultado varchar · fecha_resultado timestamp
**UNIDAD_SANGRE**: id_unidad PK · id_donacion FK · id_componente FK · id_tipo_sanguineo FK · fecha_obtencion date · fecha_caducidad date · estado varchar
**MOVIMIENTO_INVENTARIO**: id_movimiento PK · id_unidad FK · id_usuario FK · tipo_movimiento varchar · fecha_movimiento timestamp · motivo varchar

## Hospitales y solicitudes
**HOSPITAL**: id_hospital PK · nombre varchar · direccion varchar · telefono varchar
**SOLICITUD**: id_solicitud PK · id_hospital FK · id_tipo_sanguineo FK · id_componente FK · cantidad int · prioridad varchar · estado varchar · fecha_solicitud timestamp
**ASIGNACION**: id_asignacion PK · id_solicitud FK · id_unidad FK+UK · id_usuario FK (quien autoriza) · fecha_asignacion timestamp

## Seguridad y auditoría
**USUARIO**: id_usuario PK · username varchar · nombre varchar · id_rol FK · id_hospital FK (nullable; solo usuarios de hospital) · activo boolean
**BITACORA_AUDITORIA**: id_bitacora PK bigint · tabla varchar · operacion varchar · id_registro int · usuario_bd varchar · fecha timestamp · valores_anteriores jsonb · valores_nuevos jsonb

## Relaciones
- TIPO_SANGUINEO clasifica DONANTE, UNIDAD_SANGRE; SOLICITUD requiere TIPO_SANGUINEO.
- COMPONENTE define UNIDAD_SANGRE; SOLICITUD requiere COMPONENTE.
- DONANTE realiza DONACION (1:N).
- DONACION tiene PRUEBA_TAMIZAJE (1:N) y origina UNIDAD_SANGRE (1:N).
- UNIDAD_SANGRE registra MOVIMIENTO_INVENTARIO (1:N).
- HOSPITAL realiza SOLICITUD (1:N); HOSPITAL emplea USUARIO (1:N).
- SOLICITUD se cubre con ASIGNACION (1:N); UNIDAD_SANGRE se entrega en ASIGNACION (1:0..1, por la UK).
- USUARIO captura DONACION, ejecuta MOVIMIENTO_INVENTARIO, autoriza ASIGNACION.
- ROL agrupa USUARIO (1:N).

## Desviaciones aceptadas (documentar)
- `usuario.password_hash`
- `bitacora_auditoria.usuario_app`
