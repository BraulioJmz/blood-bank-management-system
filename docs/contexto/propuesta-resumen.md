# Resumen de la propuesta (TC15, 4-nov-2026)

El documento completo es `JimenezChavezBraulio04112026TC15.pdf` (ponerlo en esta carpeta).

## Problemática
1. Falta de visibilidad del inventario por tipo sanguíneo/componente y caducidad → desecho y desabasto.
2. Pérdida de trazabilidad donante → unidad → receptor (hemovigilancia, NOM-253-SSA1-2012).
3. Solicitudes hospitalarias sin control transaccional → una unidad asignada a dos solicitudes.
4. Datos de salud sensibles sin autorización diferenciada ni auditoría (LFPDPPP).

## Objetivo general
Diseñar e implementar un sistema web para la administración de un banco de sangre, respaldado por PostgreSQL, que centralice donantes, donaciones, pruebas de tamizaje, unidades por componente, inventario, hospitales y solicitudes, garantizando integridad, trazabilidad, seguridad y disponibilidad.

## Objetivos particulares
1. Modelo relacional con PK/FK/restricciones que permita rastrear cada unidad desde la donación hasta el hospital.
2. App web para registrar/consultar/actualizar donantes, donaciones, unidades, inventario, hospitales y solicitudes, con control de entradas, salidas y caducidades.
3. Reglas de negocio y procedimientos transaccionales con control de concurrencia (no doble asignación; excluir caducadas o reactivas).
4. Roles y privilegios mínimos (recepción, laboratorio, inventario, hospital, administrador).
5. Bitácora de auditoría con triggers (usuario, fecha, valores modificados).
6. Índices y vistas; política de respaldos con prueba documentada de restauración.

## Alcances
Modelo en PostgreSQL; app web con disponibilidad, alertas de caducidad y seguimiento de solicitudes; asignación por procedimientos con bloqueo de fila; roles + bitácora; índices/vistas; respaldos y restauración; datos sintéticos con Python.

## Límites
Un solo banco de sangre; sin datos reales; no sustituye pruebas de compatibilidad ni juicio médico; sin integración con sistemas externos ni app móvil; académico (referencia NOM-253); respaldo probado en desarrollo, sin alta disponibilidad/replicación.

## Arquitectura
Tres capas: presentación (web), lógica de negocio (validación, asignación, inventario, solicitudes), datos (PostgreSQL con llaves, restricciones, transacciones, roles, bitácora, respaldos). Local primero; desplegable a servidor después.

## Atributos de calidad (ISO/IEC 25010:2023)
- **Escalabilidad:** índices en tipo/componente/estado/caducidad; particionamiento por fecha previsto (bitácora); transacciones cortas; capas separables.
- **Disponibilidad:** operaciones transaccionales (prevenir), registro de errores y avisos claros (detectar), respaldos + WAL/PITR (recuperar). Métricas: tiempo de restauración y datos perdidos.
- **Usabilidad:** pantallas por rol, listas de selección para valores fijos, confirmaciones antes de asignar/dar de baja, mensajes de error accionables, estado visible con alertas, consistencia entre módulos.
- **Seguridad:** roles con privilegios mínimos, integridad por FK/CHECK/procedimientos, cuentas individuales con SCRAM-SHA-256, bitácora inmodificable.
- **Protección (safety):** restricción operativa en BD (rechazar caducadas, reactivas, pendientes, tipo/componente distinto), falla segura (cuarentena), advertencias (caducidad, existencias bajas, urgentes sin atender), trazabilidad para localizar componentes hermanos.

## Preguntas de investigación (TC15 — se responden con las pruebas)
1. Concurrencia: ¿el bloqueo de fila evita la doble asignación?
2. Rendimiento: % de reducción del tiempo de la consulta de disponibilidad con índices, ≥100 000 unidades.
3. Recuperación: tiempo de restauración (respaldo base + WAL) y datos perdidos ante falla simulada.
4. Reglas: ¿se rechazan en todos los casos las asignaciones inválidas?
5. Usabilidad: % de tareas completadas sin error y tiempo por tarea.

> Nota: para el reporte final, las preguntas 1 y 4 deben reformularse como abiertas (“¿De qué manera…?”, “¿En qué medida…?”) porque la rúbrica pide preguntas no dicotómicas.

## Hipótesis general
El sistema, con control de concurrencia, reglas en la BD, roles mínimos, bitácora y respaldos con PITR, permite mantener un inventario consistente y la trazabilidad completa de cada unidad desde la donación hasta el hospital. VI: implementación del sistema; VD: consistencia del inventario y trazabilidad.
