# Pruebas e2e (supertest → Nest → PostgreSQL)

Cada paso usa el JWT del usuario demo de su rol contra la BD real `banco_test`.

| Flujo | Paso | Esperado | Obtenido |
|---|---|---|---|
| Auth | login con contraseña incorrecta / sin token | 401 / 401 | 401 / 401 |
| Recepción → Laboratorio | unidad tras 5 pruebas no reactivas | disponible | disponible |
| Laboratorio | cambiar un resultado definitivo | 409 BS014 | 409 BS014 |
| Recepción | GET /inventario/unidades | 403 | 403 |
| Hospital | el sur consulta la solicitud del norte | 404 (RLS) | 404 |
| Inventario | asignación manual 1 de 2 | parcial | parcial |
| Inventario | reasignar una unidad ya asignada | 409 BS001 | 409 BS001 |
| Inventario | FEFO para la unidad faltante | 1 asignada, surtida | 1, surtida |
| Inventario | baja de una unidad entregada | 409 BS010 | 409 BS010 |
| Admin | bitácora de la asignación: rol_app / usuario_bd | rol_inventario / rol_inventario | rol_inventario / rol_inventario |
| Admin | crear usuario hospital sin hospital | 422 BS016 | 422 BS016 |
