# Benchmark de índices (generado por scripts/benchmark-indices.ts)

- Fecha: 16/11/2026, 5:14:36 p.m.
- Servidor: PostgreSQL 16.16 (Docker, darwin arm64)
- Datos: **100,138 unidades** (9,092 disponibles), ventana de 1500 días. Tabla: 6680 kB; índice parcial: 184 kB
- Método: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, 15 repeticiones por configuración tras una corrida de calentamiento; se reporta la **mediana** de *Execution Time*. "Sin índices" = `DROP INDEX` de `ix_unidad_disponible` e `ix_unidad_vigente_caducidad` dentro de una transacción revertida.

## Resumen

| Consulta | Sin índices (ms) | Con índices (ms) | Reducción | Aceleración |
|---|---|---|---|---|
| Disponibilidad de un tipo × componente | 2.894 | 0.039 | **98.7 %** | 74.2× |
| Selección FEFO (5 unidades) | 2.903 | 0.011 | **99.6 %** | 263.9× |
| Tablero de disponibilidad (v_disponibilidad) | 4.956 | 2.731 | **44.9 %** | 1.8× |
| Unidades por caducar (7 días) | 4.460 | 0.111 | **97.5 %** | 40.2× |

## Detalle por consulta

### Disponibilidad de un tipo × componente

Pantalla de inventario / validación de solicitud: existencias y próxima caducidad de O+ eritrocitario.

```sql
SELECT count(*), min(fecha_caducidad) FROM banco.unidad_sangre
  WHERE estado = 'disponible' AND id_tipo_sanguineo = $1 AND id_componente = $2
    AND fecha_caducidad >= current_date
```

| | Sin índices | Con índices |
|---|---|---|
| Nodo de acceso a unidad_sangre | Seq Scan | Index Only Scan (`ix_unidad_disponible`) |
| Mediana / mín / máx (ms) | 2.894 / 2.875 / 3.468 | 0.039 / 0.036 / 0.048 |
| Buffers compartidos (hit + read) | 835 | 3 |
| Filas devueltas | 1 | 1 |

### Selección FEFO (5 unidades)

Núcleo de sp_asignar_automatica: las 5 unidades disponibles que caducan primero.

```sql
SELECT id_unidad, fecha_caducidad FROM banco.unidad_sangre
  WHERE estado = 'disponible' AND id_tipo_sanguineo = $1 AND id_componente = $2
    AND fecha_caducidad >= current_date
  ORDER BY fecha_caducidad LIMIT 5
```

| | Sin índices | Con índices |
|---|---|---|
| Nodo de acceso a unidad_sangre | Seq Scan | Index Scan (`ix_unidad_disponible`) |
| Mediana / mín / máx (ms) | 2.903 / 2.864 / 2.948 | 0.011 / 0.010 / 0.020 |
| Buffers compartidos (hit + read) | 835 | 7 |
| Filas devueltas | 5 | 5 |

### Tablero de disponibilidad (v_disponibilidad)

Las 32 combinaciones tipo × componente con sus existencias.

```sql
SELECT * FROM banco.v_disponibilidad
```

| | Sin índices | Con índices |
|---|---|---|
| Nodo de acceso a unidad_sangre | Seq Scan | Bitmap Heap Scan |
| Mediana / mín / máx (ms) | 4.956 / 4.630 / 7.859 | 2.731 / 2.620 / 3.144 |
| Buffers compartidos (hit + read) | 837 | 848 |
| Filas devueltas | 32 | 32 |

### Unidades por caducar (7 días)

Alerta del dashboard: vigentes que vencen en la próxima semana.

```sql
SELECT id_unidad FROM banco.unidad_sangre
  WHERE estado IN ('cuarentena', 'disponible')
    AND fecha_caducidad BETWEEN current_date AND current_date + 7
```

| | Sin índices | Con índices |
|---|---|---|
| Nodo de acceso a unidad_sangre | Seq Scan | Bitmap Heap Scan |
| Mediana / mín / máx (ms) | 4.460 / 4.370 / 4.689 | 0.111 / 0.097 / 0.142 |
| Buffers compartidos (hit + read) | 835 | 315 |
| Filas devueltas | 404 | 404 |

## Interpretación

- El índice parcial `(id_tipo_sanguineo, id_componente, fecha_caducidad) WHERE estado = 'disponible'` contiene solo las unidades disponibles: el planificador salta directo al rango tipo × componente y, como ya viene ordenado por caducidad, FEFO se detiene en cuanto tiene 5 filas.
- Sin él, PostgreSQL debe recorrer toda la tabla (Seq Scan) y filtrar fila por fila, así que el costo crece con el histórico completo y no con el inventario vigente.
- El tablero completo (`v_disponibilidad`) agrega todas las disponibles; ahí la ganancia es menor porque hay que leer una fracción grande del índice. Por eso el dashboard usa además la vista materializada `mv_dashboard`.
