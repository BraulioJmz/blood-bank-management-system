# Arquitectura — Banco de Sangre

> Documento vivo: se completa en `feature/docs-arquitectura` (capas, módulos, diagramas y versiones).

## Desviaciones respecto al modelo ER (TC16)

| Tabla.columna | Motivo |
|---|---|
| `usuario.password_hash varchar(255)` | Guardar el hash argon2id de la contraseña. El ER no contemplaba autenticación propia. |
| `bitacora_auditoria.usuario_app varchar(20)` | `id_usuario` de la persona que operó (`app.id_usuario`). `usuario_bd` solo dice el rol de BD. |
| `bitacora_auditoria.rol_app varchar(63)` | Rol de la app (`app.rol`), fijado por `withContext`. Es la fuente explícita de la identidad; `usuario_bd` la corrobora desde el lado de PostgreSQL. |
| `tipo_sanguineo.grupo_abo varchar(2)` + `CHECK (grupo_abo IN ('A','B','AB','O'))` | El ER lo define como `char`. `AB` tiene dos letras y `char(2)` rellenaría `A` como `'A '` con espacio, lo que complica comparaciones y etiquetas. El CHECK conserva el dominio cerrado de 4 grupos. |
| `componente.dias_alerta_caducidad integer` + `CHECK (dias_alerta_caducidad BETWEEN 1 AND vida_util_dias)` | No está en el ER. Umbral de "próxima a caducar" propio de cada componente (plaquetas 2, eritrocitos 7, plasma y crioprecipitado 30), porque un umbral fijo no sirve para vidas útiles de 5 a 365 días. Lo usan `v_inventario_unidades` (semáforo), `v_unidades_por_caducar`, `v_disponibilidad` y el dashboard. Migración `007`. |

`bitacora_auditoria.usuario_bd` se llena con `coalesce(nullif(current_setting('role'), 'none'), session_user)` (migración `006`), no con `current_user`: dentro de la función `SECURITY DEFINER` del trigger, `current_user` siempre es el dueño (`banco_owner`), mientras que el GUC `role` conserva el `SET LOCAL ROLE` de la petición. En peticiones de la app `usuario_bd = rol_app`; en migraciones/seeds (sin `SET ROLE`) queda `session_user`.

Precisiones de tipo (no cambian el modelo):
- Las columnas *timestamp* del ER son `timestamptz` (instante absoluto; se muestran en America/Mexico_City).
- Estados y prioridades son `varchar + CHECK` (no ENUM); el porqué está en `001_esquema.sql`.

## Roles de base de datos

| Rol | Tipo | Para qué |
|---|---|---|
| `postgres` | superusuario | Solo bootstrap: crear roles y bases (`db/lib/bootstrap.ts`). |
| `banco_owner` | LOGIN, no superusuario | Dueño del esquema `banco`; corre migraciones; las funciones `SECURITY DEFINER` corren con sus privilegios. |
| `app_login` | LOGIN, NOINHERIT | Cuenta de conexión de la API. No tiene privilegios propios; es miembro de los roles de grupo con `INHERIT FALSE, SET TRUE`, así que solo puede usarlos mediante `SET ROLE`. |
| `rol_recepcion` · `rol_laboratorio` · `rol_inventario` · `rol_hospital` · `rol_admin` | NOLOGIN | Privilegios mínimos por función (ver `004_seguridad.sql`). |

Capas de seguridad (defensa en profundidad):
GRANT por tabla y columna → RLS por hospital (`solicitud`, `asignacion`) → reglas en funciones `SECURITY DEFINER` → triggers (máquina de estados, bitácora inmutable) → `@Roles()` en Nest → menú por rol en React.

## Limitaciones conocidas

### El JWT vive en `localStorage`
La web guarda el token en `localStorage` (`apps/web/src/api/cliente.ts`) y lo manda en
`Authorization: Bearer`. Es simple y suficiente para el proyecto, pero **cualquier script que
corra en la página puede leerlo**: una vulnerabilidad XSS permitiría robar la sesión hasta que
el token expire (`JWT_EXPIRES_IN`, 8 h por defecto). React escapa el contenido por defecto y la
app no usa `dangerouslySetInnerHTML`, lo que reduce el riesgo, pero no lo elimina (dependencias
de terceros, extensiones).

**Mitigación (no implementada):** emitir el token en una cookie `HttpOnly; Secure; SameSite=Strict`
(o `Lax`) desde `/api/auth/login`. JavaScript no podría leerla y `SameSite` bloquea su envío en
peticiones de otros sitios (CSRF); para operaciones que cambian estado conviene además un
token anti-CSRF. Como web y API comparten origen tras nginx (`/api`), el cambio sería local a
`AuthModule` y al cliente HTTP.

### La autorización real la aplica la base de datos
Ocultar menús en React y los `@Roles()` de Nest son **comodidad y defensa en profundidad**, no la
barrera principal. En cada petición `withContext` hace `SET LOCAL ROLE <rol>` y fija `app.id_usuario`,
`app.id_hospital` y `app.rol`; a partir de ahí PostgreSQL decide con:
- `GRANT` mínimos por rol (p. ej. ningún rol tiene `UPDATE` sobre `unidad_sangre`; solo se cambia vía funciones),
- RLS en `solicitud` por `app.id_hospital`,
- funciones `SECURITY DEFINER` con validaciones y SQLSTATE propios,
- bitácora inmodificable por trigger.

Consecuencia: un token robado da exactamente los permisos de BD de ese rol y ese hospital, nada más;
y un error en la UI o en un guard de Nest no abre datos que la BD no permita (las pruebas de
`seguridad.spec.ts` lo verifican ejecutando SQL directo con cada rol).
