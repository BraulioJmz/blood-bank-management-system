---
description: Crea release, mergea a main y develop y etiqueta (Git Flow)
argument-hint: <x.y.z>
---
Prepara la release `$ARGUMENTS`:

1. Desde `develop` limpio, crea `release/$ARGUMENTS`. **Pregúntame si `CLAUDE.md` va en el zip del entregable.** Si la respuesta es no, agrega `CLAUDE.md export-ignore` a `.gitattributes` dentro de la rama release (antes del tag, porque `git archive` lee el `.gitattributes` del commit etiquetado).
2. Actualiza la versión en los `package.json` y genera `CHANGELOG.md` a partir de los commits desde la última etiqueta, agrupado por tipo (feat, fix, docs…).
3. Valida en **un solo comando encadenado con `&&`** (nunca `;`, `|` ni `| grep`, que ocultan el código de salida):

   ```bash
   npm run db:reset && npm run test:evidencia && npm run lint && npm run build && echo "VALIDACION OK"
   ```

   `db:reset` ya carga los datos sintéticos y `test:evidencia` reescribe `docs/evidencias/pruebas.md`. Si no aparece `VALIDACION OK`, **detente**: no hay commit, ni merge, ni tag; arregla en la rama release con `fix(...)` y vuelve a validar.
4. Commit `chore(release): v$ARGUMENTS`.
5. Solo tras `VALIDACION OK`, encadenado con `&&` para que un conflicto detenga todo:

   ```bash
   git checkout main && git merge --no-ff release/$ARGUMENTS -m "release: v$ARGUMENTS" \
     && git tag -a v$ARGUMENTS -m "v$ARGUMENTS" \
     && git checkout develop && git merge --no-ff release/$ARGUMENTS -m "merge: release/$ARGUMENTS en develop" \
     && git branch -d release/$ARGUMENTS
   ```
6. Genera el entregable desde el tag: `mkdir -p entrega && git archive --format=zip -o entrega/banco-sangre-v$ARGUMENTS.zip v$ARGUMENTS && unzip -l entrega/banco-sangre-v$ARGUMENTS.zip`. Respeta los `export-ignore` de `.gitattributes`; verifica con `unzip -l` que no trae `.claude/` (ni `CLAUDE.md` si así se decidió). `entrega/` está en `.gitignore`.
7. Muestra `git log --oneline --graph --all -25`. No hagas push salvo que te lo pida.
