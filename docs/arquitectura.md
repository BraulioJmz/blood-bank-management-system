# Arquitectura — Banco de Sangre

> Documento vivo: se completa en `feature/docs-arquitectura` (capas, módulos, diagramas y versiones).

## Desviaciones respecto al modelo ER (TC16)

| Tabla.columna | Motivo |
|---|---|
| `usuario.password_hash varchar(255)` | Guardar el hash argon2id de la contraseña. El ER no contemplaba autenticación propia. |
| `bitacora_auditoria.usuario_app varchar(20)` | `id_usuario` de la persona que operó (`app.id_usuario`). `usuario_bd` solo dice el rol de BD. |
| `bitacora_auditoria.rol_app varchar(63)` | Rol de la app (`app.rol`), fijado por `withContext`. Es la fuente explícita de la identidad; `usuario_bd` la corrobora desde el lado de PostgreSQL. |
| `tipo_sanguineo.grupo_abo varchar(2)` + `CHECK (grupo_abo IN ('A','B','AB','O'))` | El ER lo define como `char`. `AB` tiene dos letras y `char(2)` rellenaría `A` como `'A '` con espacio, lo que complica comparaciones y etiquetas. El CHECK conserva el dominio cerrado de 4 grupos. |

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
