---
description: Valida y cierra la feature actual con merge --no-ff a develop
---
Cierra la rama actual (`feature/*`, `fix/*` o `chore/*`):

1. Confirma la rama y que no hay cambios sin commitear (`git status --short` vacío). Si hay, detente.
2. Valida en **un solo comando encadenado con `&&`**, de modo que el merge sea imposible si algo falla:

   ```bash
   npm run db:reset && npm test && npm run lint && npm run build && echo "VALIDACION OK"
   ```

   - Nunca uses `;`, `|`, `| grep` ni `| tail` entre los pasos: ocultan el código de salida y dejan pasar un fallo.
   - Si no aparece `VALIDACION OK`, **no hagas merge**: muestra la salida del paso que falló, arréglalo en esta misma rama con commits `fix(...)` y vuelve a validar.
3. Si la feature produjo evidencia (salidas de pruebas, benchmarks, capturas), verifica que esté en `docs/evidencias/` y commiteada.
4. Solo después de `VALIDACION OK`, en el mismo comando encadenado:

   ```bash
   git checkout develop && git merge --no-ff <rama> -m "merge: <rama> en develop" && git branch -d <rama>
   ```

5. Muéstrame `git log --oneline --graph -15`.
6. Dame el resumen: qué se hizo, qué concepto de PostgreSQL se aplicó y qué evidencia quedó. No hagas push salvo que te lo pida.
