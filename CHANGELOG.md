# Changelog

Formato: [Conventional Commits](https://www.conventionalcommits.org/es/). Versionado semántico.

## [1.0.1] — 2026-11-22

Versión de archivo tras la entrega: solo documentación, sin cambios en la BD, la API ni la web.

### Documentación

- **docs**: reorganiza el recorrido del guion carpeta por carpeta (`1687b79`)
- **docs**: orienta de arriba abajo los diagramas de componentes y despliegue (`2fe8f48`)
- **docs**: agrega CHANGELOG.md al mapa de archivos (`3447cdb`)

### Mantenimiento

- **infra**: incorpora la licencia MIT del repositorio remoto (`f5a0b50`)
- **infra**: ignora la carpeta reporte/ (`e63cde9`)

## [1.0.0] — 2026-11-16

Primera versión entregable del Sistema de administración de banco de sangre (126 commits, del 16 de noviembre de 2026).

Resumen: esquema PostgreSQL con reglas de negocio en la BD (falla segura por tamizaje, asignación con `FOR UPDATE` y FEFO con `SKIP LOCKED`, caducidad, máquina de estados), roles con privilegios mínimos, RLS por hospital, bitácora inmodificable, índices y vistas, respaldo lógico y PITR; API NestJS sin ORM con contexto de BD por petición; web React por rol; 65 pruebas contra PostgreSQL real; despliegue con Docker en un comando.

### Funcionalidades

- **db**: agrega runner de migraciones con tabla schema_migrations (`66d99d1`)
- **db**: crea esquema base con PK, FK, UK y CHECK (`f18199a`)
- **db**: carga catálogos de tipos sanguíneos, componentes y roles (`c5cd10f`)
- **db**: define SQLSTATE propios y helper de errores (`9bb4298`)
- **db**: crea pruebas pendientes al registrar donación (`f1ecaaf`)
- **db**: libera o descarta unidades según tamizaje (`4ca63be`)
- **db**: agrega fn_fraccionar_donacion con movimiento de entrada (`d9c4f65`)
- **db**: agrega sp_asignar_unidad con bloqueo FOR UPDATE (`de4b17a`)
- **db**: agrega sp_asignar_automatica FEFO con SKIP LOCKED (`ff2d91e`)
- **db**: agrega fn_marcar_caducadas, fn_dar_baja y fn_entregar_unidad (`474fa11`)
- **seguridad**: crea roles de grupo NOLOGIN y app_login (`b368b38`)
- **seguridad**: otorga privilegios mínimos por rol (`638595d`)
- **seguridad**: activa RLS por hospital en solicitud y asignacion (`102644b`)
- **seguridad**: agrega trigger genérico de bitácora de auditoría (`9c2378a`)
- **seguridad**: impide UPDATE/DELETE sobre la bitácora (`3c93fff`)
- **db**: crea vistas de disponibilidad, caducidad y solicitudes pendientes (`9a881b9`)
- **db**: crea vista de trazabilidad de unidad (`5c449d1`)
- **db**: agrega vista materializada para dashboard (`d055443`)
- **datos**: agrega seeds de hospitales y usuarios demo por rol (`dd9d480`)
- **datos**: genera volumen con generate_series parametrizable (`5932189`)
- **datos**: agrega generador faker es_MX y comando db:sintetico (`a3ea97a`)
- **api**: agrega ejecutarConContexto para transacciones por petición (`b0dc57b`)
- **infra**: agrega backup.sh y restore.sh cronometrados (`5cdb653`)
- **api**: agrega DbModule con Pool y withContext (`ba0ab38`)
- **auth**: implementa login JWT con argon2 (`9c72044`)
- **auth**: agrega guard y decorador @Roles (`7eb1af3`)
- **api**: traduce errores de PostgreSQL a respuestas HTTP (`055fc6d`)
- **api**: agrega módulos de donantes y donaciones (`4f8a2f1`)
- **api**: agrega módulo de laboratorio (`f11e463`)
- **api**: agrega módulo de inventario (`defde49`)
- **api**: agrega módulos de hospitales y solicitudes con asignación (`8fdcac5`)
- **api**: agrega trazabilidad (`4bbc9bb`)
- **api**: agrega admin de bitácora y usuarios (`f7b0c61`)
- **api**: agrega dashboard (`be93d69`)
- **web**: agrega cliente API con TanStack Query y sesión JWT (`a312510`)
- **web**: agrega login y rutas protegidas por rol (`ff7e09b`)
- **web**: agrega layout responsivo con menú por rol (`b5d1f2a`)
- **web**: agrega dashboard con alertas de existencias, caducidad y solicitudes (`89ce493`)
- **db**: agrega umbral de alerta de caducidad por componente (`e238771`)
- **datos**: carga datos sintéticos en db:reset y limpia nombres demo (`615fab3`)
- **api**: usa el umbral por componente y expone próximas a caducar en el dashboard (`37800f8`)
- **web**: agrega componentes de formulario, diálogo, tabla y paginación (`50bbbd4`)
- **web**: agrega pantalla de donantes y donaciones (`96af41f`)
- **web**: agrega laboratorio con captura de tamizaje y fraccionamiento (`51af910`)
- **web**: agrega inventario con semáforo, filtros, bajas, entregas e historial (`c2a0ed4`)
- **web**: agrega fixtures de peor caso e interruptor de datos solo en desarrollo (`057e7dc`)
- **web**: agrega solicitudes con alta, detalle, asignación manual y FEFO con confirmación (`a3a4cc1`)
- **web**: agrega fixtures de peor caso para solicitudes (solo desarrollo) (`3ddcacf`)
- **web**: agrega trazabilidad de unidad con donación, donante, tamizaje, hermanas y destino (`cb434ba`)
- **web**: agrega administración de hospitales y usuarios (`1f949df`)
- **web**: agrega bitácora de auditoría con filtros y diferencias por campo (`703ffc5`)
- **infra**: activa el archivado continuo de WAL en el contenedor (`ad01430`)
- **infra**: agrega prueba de PITR con pg_basebackup y recovery_target_time (`60ab16a`)
- **db**: agrega db:setup idempotente para despliegues (`17a75ab`)

### Correcciones

- **pruebas**: escribe evidencias solo con test:evidencia (`efdb672`)
- **db**: registra en usuario_bd el rol del SET ROLE en lugar de current_user (`bf994eb`)
- **web**: alinea al inicio las columnas del dashboard (`db391c5`)
- **web**: ajusta dashboard: próximas a caducar, colores de la matriz, alineación y ancho (`5fe5b82`)
- **api**: evita que una conexión inactiva perdida tumbe la API (`2b9a08a`)
- **web**: muestra en zona de México las fechas con hora y ajusta el ancho de los filtros (`9f32d9f`)
- **web**: evita saltos de layout al capturar tamizaje y usa etiquetas legibles (`35ba463`)
- **web**: recarga los datos tras un rechazo de la BD y acorta el filtro de estado (`8bb09fa`)
- **web**: corrige hallazgos de break-ui en inventario (`f0c1b73`)
- **api**: ordena las solicitudes abiertas de la más antigua a la más reciente (`98aee68`)
- **web**: corrige hallazgos de break-ui en solicitudes (`e9769f4`)
- **api**: ejecuta en secuencia las consultas de catálogos sobre el mismo cliente (`1f1cdbd`)
- **pruebas**: corrige el lint de las pruebas e2e (`5edb10c`)
- **db**: usa moduleResolution nodenext en lugar del obsoleto node10 (`897d5b8`)
- **api**: quita baseUrl obsoleto del tsconfig (no se usaba) (`fe58e3d`)
- **datos**: genera nombres de donante coherentes con el sexo y sin apellidos duplicados (`34a525f`)
- **web**: muestra el número de donante aparte del nombre en la trazabilidad (`2b3d0de`)
- **web**: ofrece cancelar solo solicitudes pendientes, como exige la BD (`bd3c4ae`)

### Rendimiento

- **db**: agrega índice parcial de disponibilidad e índices en FK (`0d2e228`)
- **db**: agrega benchmark de índices con EXPLAIN ANALYZE (`412f453`)

### Refactorizaciones

- **web**: separa contexto de sesión y tonos para Fast Refresh (`c183163`)

### Pruebas

- **pruebas**: configura Jest contra banco_test con reset por corrida (`8f558ed`)
- **pruebas**: verifica doble asignación concurrente (`8dc32b5`)
- **pruebas**: verifica rechazo de asignaciones inválidas (`e4f56c0`)
- **pruebas**: verifica privilegios, RLS y bitácora inmodificable (`963872d`)
- **pruebas**: verifica que la bitácora registra rol y usuario de la app en asignaciones (`c4500f7`)
- **pruebas**: verifica que usuario_bd coincide con rol_app en la bitácora (`771884e`)
- **pruebas**: agrega e2e de los flujos principales por rol con supertest (`d444db7`)

### Documentación

- **docs**: actualiza CLAUDE.md con esquema banco, SECURITY DEFINER, app.rol, infra-docker y pausa de diseño (`b699087`)
- **docs**: agrega README inicial con requisitos y arranque (`c4ad4d7`)
- **docs**: documenta desviaciones del ER (`71341dc`)
- **docs**: guarda evidencia de pruebas de BD (`bf081f3`)
- **docs**: actualiza evidencia de pruebas de BD (`533e5c2`)
- **docs**: registra evidencia de restauración (`ceb0cf3`)
- **docs**: actualiza requisitos a Node 22 y node:22-alpine (`0f31178`)
- **docs**: documenta usuario_bd y grupo_abo como desviaciones del ER (`cc53250`)
- **docs**: actualiza evidencia de pruebas con Node 22 y usuario_bd (`3b7cace`)
- **docs**: agrega capturas del dashboard y del menú móvil (`9e6e03b`)
- **docs**: documenta dias_alerta_caducidad y la carga sintética de db:reset (`85dbb03`)
- **docs**: actualiza capturas del dashboard con datos (inventario y hospital) (`ed9205f`)
- **docs**: agrega limitaciones conocidas: JWT en localStorage y autorización en la BD (`ff13a3d`)
- **docs**: agrega capturas de donantes, laboratorio e inventario (`6df9693`)
- **docs**: registra resultados de break-ui en inventario (`a72c80d`)
- **docs**: agrega capturas de solicitudes y resultados de break-ui (`0c0bf68`)
- **docs**: agrega capturas de trazabilidad, usuarios, hospitales y bitácora (`7bdecd8`)
- **docs**: menciona las pruebas e2e en el README y en la evidencia (`cdbaa73`)
- **docs**: actualiza evidencia de pruebas con e2e (65/65) (`eae07b2`)
- **docs**: documenta que la carga sintética no pasa por la bitácora y la RLS de solicitud y asignacion (`467ebc0`)
- **docs**: retoma capturas de donantes y trazabilidad con nombres corregidos (`d911ea3`)
- **docs**: registra procedimiento y resultados de PITR con WAL, LSN y timeline (`422334b`)
- **docs**: completa arquitectura con capas, módulos, modelo, lógica, flujo, concurrencia y calidad (`abfd6d7`)
- **docs**: agrega mapa de archivos y versiones reales en el README (`9563b6f`)
- **docs**: agrega guion del video de demostración (`ef66282`)
- **docs**: documenta el despliegue con Docker y su diagrama (`79c7c3d`)
- **docs**: ajusta el guion a 14 minutos con navegación por roles y recorrido del proyecto (`0bec03d`)
- **docs**: describe uno por uno los archivos que entran al entregable (`425467c`)

### Estilo

- **web**: define tokens de diseño y componentes base (`a4ec14d`)
- **web**: compacta la tabla de diferencias de la bitácora y acota los datos de trazabilidad (`412a2e3`)

### Mantenimiento e infraestructura

- **infra**: inicializa monorepo con npm workspaces y scripts raíz (`758d8ea`)
- **infra**: agrega docker-compose con PostgreSQL 16 y .env.example (`7023979`)
- **api**: genera scaffold de NestJS en apps/api (`2c2de49`)
- **web**: genera scaffold de Vite React TS con Tailwind en apps/web (`95c456c`)
- **infra**: ejecuta api y web en paralelo y fija lockfile (`0ad1b15`)
- **web**: agrega skills de diseño (`87d3c35`)
- **infra**: excluye archivos de desarrollo del entregable y lo genera en /release (`c7cf5e0`)
- **infra**: fija Node 22 con .nvmrc y engines (`1d23b8f`)
- **web**: agrega router, TanStack Query, Base UI, Sonner y utilidades de estilo (`296ccab`)
- **infra**: encadena con && las validaciones de /cerrar-feature y /release (`ac9d62e`)
- **infra**: agrega Dockerfile multi-stage de la api (`b84ce67`)
- **infra**: agrega Dockerfile de web con nginx y proxy de /api (`9aedcaf`)
- **infra**: agrega docker-compose.prod.yml con db, migración, api y web (`4626e2e`)
- **infra**: excluye CLAUDE.md del entregable (`88549cb`)
