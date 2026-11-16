---
description: Valida y cierra la feature actual con merge --no-ff a develop
---
Cierra la rama feature actual:

1. Confirma que estás en una rama `feature/*` y que no hay cambios sin commitear.
2. Corre `npm run db:reset`, `npm test` y `npm run lint`. Si algo falla, arréglalo en esta misma rama con commits `fix(...)` antes de continuar.
3. Si la feature produjo evidencia (salidas de pruebas, benchmarks, capturas), verifica que esté en `docs/evidencias/` y commiteada.
4. `git checkout develop && git merge --no-ff <rama> -m "merge: <rama> en develop"`.
5. Borra la rama local ya integrada y muéstrame `git log --oneline --graph -15`.
6. Dame el resumen: qué se hizo, qué concepto de PostgreSQL se aplicó y qué evidencia quedó. No hagas push salvo que te lo pida.
