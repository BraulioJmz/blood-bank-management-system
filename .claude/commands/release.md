---
description: Crea release, mergea a main y develop y etiqueta (Git Flow)
argument-hint: <x.y.z>
---
Prepara la release `$ARGUMENTS`:

1. Desde `develop` limpio, crea `release/$ARGUMENTS`.
2. Actualiza la versión en los `package.json` y genera `CHANGELOG.md` a partir de los commits desde la última etiqueta, agrupado por tipo (feat, fix, docs…).
3. `npm run db:reset`, carga datos sintéticos, `npm test` y guarda la salida en `docs/evidencias/pruebas.md`; verifica `npm run build` de api y web.
4. Commit `chore(release): v$ARGUMENTS`.
5. Merge `--no-ff` a `main`, tag anotado `v$ARGUMENTS`, merge `--no-ff` de vuelta a `develop`, borra la rama release.
6. Muestra `git log --oneline --graph --all -25`. No hagas push salvo que te lo pida.
