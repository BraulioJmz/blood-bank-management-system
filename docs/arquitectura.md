# Arquitectura — Banco de Sangre

> Documento vivo: se completa en `feature/docs-arquitectura` (capas, módulos, diagramas y versiones).

## Desviaciones respecto al modelo ER (TC16)

| Tabla.columna | Motivo |
|---|---|
| `usuario.password_hash varchar(255)` | Guardar el hash argon2id de la contraseña. El ER no contemplaba autenticación propia. |
| `bitacora_auditoria.usuario_app varchar(20)` | `id_usuario` de la persona que operó (`app.id_usuario`). `usuario_bd` solo dice el rol de BD. |
| `bitacora_auditoria.rol_app varchar(63)` | Rol de la app (`app.rol`). Dentro de una función `SECURITY DEFINER`, `current_user` es el dueño (`banco_owner`), así que `usuario_bd` no basta para saber quién operó. |

Precisiones de tipo (no cambian el modelo):
- `tipo_sanguineo.grupo_abo` es `varchar(2)`, porque `AB` tiene dos letras y `char(2)` rellenaría `A ` con un espacio.
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
