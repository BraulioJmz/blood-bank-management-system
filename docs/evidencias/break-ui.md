# break-ui: pruebas de la UI con datos de peor caso

Técnica `break-ui`. Los datos de peor caso entran por la misma frontera
que los reales: la respuesta de la API. Se activan con `?datos=peor | vacio | uno`, con un interruptor
que solo existe en desarrollo (`apps/web/src/dev/`), y Vite lo elimina del build de producción.
Además se probó con **volumen real**: `npm run db:reset -- --db banco --unidades 100000`.

## Inventario (`/inventario`)

### Superficie y límites

| Valor | Fuente | Límite | Peor caso usado |
|---|---|---|---|
| Unidad # | `unidad_sangre.id_unidad` (integer identity) | 2,147,483,647 | 2147483647 y 1000001… |
| Componente | `componente.nombre` varchar(60) | 60 | "Concentrado eritrocitario leucorreducido, irradiado y lavado" (59) |
| Estado | CHECK de 6 estados | — | los 6 en la primera página |
| Caducidad / días | `fecha_caducidad`, `dias_restantes` | — | hoy (0), 1 día, 364 días, caducada hace 654 días |
| Semáforo | `v_inventario_unidades` | `null` fuera de vigentes | rojo, amarillo, verde, null |
| Total / páginas | `count(*) OVER ()` | sin límite | 100,000 → 4,000 páginas |
| Movimiento: motivo | `movimiento_inventario.motivo` varchar(250) | 250 | motivo real de ≈245 caracteres |
| Movimiento: usuario | `usuario.nombre` varchar(150) | 150 | "María de los Ángeles Wiśniewska-Kowalczyk…" y "Jo" |
| Movimientos | lista sin paginar | sin límite | 15 |

### Resultados

| # | Qué se rompió | Dónde | Arreglo | Estado |
|---|---|---|---|---|
| 1 | Los IDs de 7 a 10 dígitos sin separador ("2147483647") son difíciles de leer y comparar | tabla y título del historial | `numero()` (es-MX): "2,147,483,647" | ✅ corregido |
| 2 | En 375px, los 5 filtros en una columna ocupan toda la primera pantalla | barra de filtros | rejilla de 2 columnas en móvil; estado y semáforo a todo el ancho | ✅ corregido |
| 3 | Un componente de 60 caracteres se trunca en la tabla | columna Componente | se deja truncado con `title`; el texto completo aparece en el historial | decisión de diseño |
| 4 | Historial con 15 movimientos y un motivo de 250 caracteres | diálogo | ya hacía scroll interno y salto de línea; sin cambios | ✅ sin falla |
| 5 | 100,000 unidades | paginación y API | "1–25 de 100,000", "1 / 4,000"; la API responde en ≤ 90 ms (índice parcial + `LIMIT/OFFSET`) | ✅ sin falla |
| 6 | Vacío y uno | tabla | "Ninguna unidad coincide…", "1–1 de 1" | ✅ sin falla |

Capturas: `capturas/break-ui-inventario-peor-caso.jpg`, `capturas/break-ui-inventario-movil.jpg`,
`capturas/break-ui-inventario-historial.jpg`.

## Solicitudes (`/solicitudes`)

Volumen real con 100k unidades: 48,472 solicitudes. La API responde en ≤ 60 ms (abiertas: 6 ms;
página 100 de surtidas: 61 ms) y las unidades compatibles en 6 ms (índice parcial de disponibles).

### Superficie y límites

| Valor | Fuente | Límite | Peor caso usado |
|---|---|---|---|
| Solicitud # | `solicitud.id_solicitud` integer | 2,147,483,647 | 2147483647 |
| Hospital | `hospital.nombre` varchar(150) | 150 | nombre real de ≈118 caracteres y "IMSS" |
| Componente | `componente.nombre` varchar(60) | 60 | 59 caracteres |
| Cantidad / asignadas | `CrearSolicitudDto` 1..50 | 50 | 0/1, 1/2, 49/50, 50/50 |
| Fecha | `fecha_solicitud` timestamptz | — | hoy y 29 feb 2024 |
| Asignaciones | lista sin paginar | = cantidad (≤ 50) | 49 |
| Autorizó | `usuario.nombre` varchar(150) | 150 | 76 caracteres |
| Compatibles | `LIMIT 50` en la API | 50 | 50, con números de unidad de 10 dígitos |

### Resultados

| # | Qué se rompió | Dónde | Arreglo | Estado |
|---|---|---|---|---|
| 1 | El número de unidad de 10 dígitos se **encimaba** con "caduca…" (ancho fijo `w-20`) | detalle: compatibles y asignadas | `min-w-20 shrink-0 whitespace-nowrap` | ✅ corregido |
| 2 | El título "Solicitud #2147483647" no tenía separador de miles | detalle | `numero()` | ✅ corregido |
| 3 | A 1440px la columna Fecha se salía de la tarjeta | tabla | fecha corta ("16 nov, 09:00 a.m.") con la completa en `title` | ✅ corregido |
| 4 | Una fecha de otro año salía sin año ("29 feb") | tabla | se agrega el año cuando no es el actual | ✅ corregido |
| 5 | El componente se truncaba en el detalle aunque había espacio | detalle | rejilla `auto / minmax(0,1fr) / auto / auto` | ✅ corregido |
| 6 | En móvil, prioridad, avance y estado quedaban fuera de la vista (scroll horizontal) | tabla | lista para móvil (`md:hidden`) con lo urgente arriba | ✅ corregido |
| 7 | Hospital de 150 caracteres | tabla | truncado con `title`; completo en el detalle | decisión de diseño |
| 8 | 49 asignaciones y 50 compatibles | detalle | scroll interno, nada se desborda | ✅ sin falla |
| 9 | Vacío / uno | lista | "No hay solicitudes en este estado.", "1–1 de 1" | ✅ sin falla |

Capturas antes/después: `capturas/break-ui-solicitud-detalle-{antes,despues}.jpg`,
`capturas/break-ui-solicitudes-{antes,despues}.jpg`, `capturas/break-ui-solicitudes-movil-{antes,despues}.jpg`.
