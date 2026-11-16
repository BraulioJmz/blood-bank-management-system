# Prueba de respaldo y restauración (generado por scripts/prueba-restauracion.sh)

- Fecha: 2026-11-16 17:16:09 CST
- Servidor: postgres (PostgreSQL) 16.16 en Docker (Darwin arm64)
- BD: `banco_bench` con ≈100000 unidades sintéticas; tamaño en disco **89 MB**

## Resultados

| Métrica | Valor |
|---|---|
| Tipo de respaldo | Lógico, `pg_dump -Fc -Z 6` (+ `pg_dumpall --roles-only`) |
| Tamaño del respaldo | 6.95 MB |
| Tiempo de respaldo | **1.77 s** |
| Falla simulada | `DROP DATABASE banco_bench WITH (FORCE)` a las 17:16:08 (respaldo a las 17:16:06) |
| Tiempo de restauración (RTO medido) | **0.88 s** (`pg_restore -j 4` + permisos + ANALYZE) |
| Datos perdidos (RPO) | **25 donaciones** registradas después del respaldo (todo lo posterior al último `pg_dump`) |
| Trazabilidad íntegra tras restaurar | sí (v_trazabilidad_unidad = unidad_sangre) |
| La app puede operar (app_login → rol_inventario) | sí |

## Conteo por tabla

| Tabla | Al respaldar | Al fallar | Restaurado | ¿Igual al respaldo? | Perdido |
|---|---|---|---|---|---|
| asignacion | 48,810 | 48,810 | 48,810 | ✅ | 0 |
| bitacora_auditoria | 10 | 185 | 10 | ✅ | 175 |
| donacion | 37,038 | 37,063 | 37,038 | ✅ | 25 |
| donante | 18,519 | 18,544 | 18,519 | ✅ | 25 |
| movimiento_inventario | 199,622 | 199,622 | 199,622 | ✅ | 0 |
| prueba_tamizaje | 185,190 | 185,315 | 185,190 | ✅ | 125 |
| solicitud | 48,826 | 48,826 | 48,826 | ✅ | 0 |
| unidad_sangre | 100,043 | 100,043 | 100,043 | ✅ | 0 |

## Interpretación

- El respaldo lógico recupera **exactamente** el estado del instante del respaldo (snapshot consistente de `pg_dump`); las FK, CHECK, triggers, RLS, GRANT y vistas se restauran con los datos.
- Lo perdido es todo lo escrito entre el último respaldo y la falla: el RPO de esta política es igual al intervalo entre respaldos. Con un respaldo diario se podría perder hasta un día de donaciones.
- Para reducir el RPO a segundos se usa archivado continuo de WAL + respaldo base + PITR (`docs/evidencias/pitr.md`).
- Las propiedades de la BD (`search_path`, zona horaria, `CONNECT`) y los roles no viajan en `pg_dump`; `restore.sh` las reaplica y `pg_dumpall --roles-only` respalda los roles.
