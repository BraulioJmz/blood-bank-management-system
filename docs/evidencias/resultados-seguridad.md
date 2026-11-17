# Resultados de seguridad (generado por seguridad.spec.ts)

Fecha: 2026-11-17T05:04:20.765Z

| Verificación | Esperado | Obtenido |
|---|---|---|
| app_login sin SET ROLE lee unidad_sangre | 42501 | 42501 |
| Hash de contraseña de app_login | SCRAM-SHA-256 | SCRAM-SHA-256 |
| Rol inyectado en withContext | ContextoInvalidoError | ContextoInvalidoError |
| hospital SELECT donante | 42501 | 42501 |
| hospital SELECT unidad_sangre.id_donacion | 42501 | 42501 |
| hospital SELECT columnas permitidas de unidad_sangre | OK | OK |
| admin SELECT usuario.password_hash | 42501 | 42501 |
| inventario SELECT usuario.password_hash | 42501 | 42501 |
| inventario UPDATE unidad_sangre | 42501 | 42501 |
| inventario INSERT asignacion | 42501 | 42501 |
| recepcion CALL sp_asignar_unidad | 42501 | 42501 |
| recepcion UPDATE prueba_tamizaje | 42501 | 42501 |
| laboratorio UPDATE prueba_tamizaje.tipo_prueba | 42501 | 42501 |
| Norte ve solicitudes de otros hospitales | 0 | 0 |
| Sur ve pendientes ajenas en la vista | 0 | 0 |
| Norte INSERT solicitud con id_hospital del Sur | 42501 | 42501 |
| Norte cancela solicitud del Sur | BS007 | BS007 |
| admin UPDATE bitacora_auditoria | 42501 | 42501 |
| admin DELETE bitacora_auditoria | 42501 | 42501 |
| inventario UPDATE bitacora_auditoria | 42501 | 42501 |
| inventario DELETE bitacora_auditoria | 42501 | 42501 |
| admin INSERT bitacora_auditoria (falsificar) | 42501 | 42501 |
| banco_owner: UPDATE | BS013 | BS013 |
| banco_owner: DELETE | BS013 | BS013 |
| banco_owner: TRUNCATE | BS013 | BS013 |
| Bitácora de asignación: rol_app / usuario_app / usuario_bd | rol_inventario / 3 / rol_inventario | rol_inventario / 3 / rol_inventario |
