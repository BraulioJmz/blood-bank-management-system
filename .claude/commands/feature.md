---
description: Inicia una rama feature desde develop (Git Flow)
argument-hint: <area>-<descripcion>
---
Inicia la feature `feature/$ARGUMENTS` siguiendo Git Flow:

1. Verifica que el árbol de trabajo esté limpio; si no, detente y dime qué hay pendiente.
2. `git checkout develop` y crea `feature/$ARGUMENTS`.
3. Dime en 3–5 líneas el alcance de la feature y la lista de commits atómicos en los que la vas a dividir (formato Conventional Commits en español).
4. Implementa commit por commit. Cada commit debe dejar el proyecto funcionando.
