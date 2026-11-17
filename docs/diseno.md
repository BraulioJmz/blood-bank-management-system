# Guía de diseño de la web

Criterios tomados de las skills `emil-design-eng` y `pick-ui-library` (`.claude/skills/`).
Los tokens viven en `apps/web/src/index.css` (`@theme` de Tailwind v4).

## Carácter
Panel clínico de uso diario: sobrio, denso pero legible, rápido. La información
crítica (caducidad, prioridad, estado de la unidad) se distingue por **color semántico + texto**,
nunca solo por color.

## Librerías (lista curada de `pick-ui-library`)
| Necesidad | Librería |
|---|---|
| Primitivas accesibles (diálogo, menú, select) | `@base-ui/react` |
| Notificaciones | `sonner` |
| Clases condicionales / variantes tipadas | `clsx` / `class-variance-authority` |
| Íconos | `lucide-react` (fuera de la lista curada; elección propia) |
| Datos del servidor | `@tanstack/react-query` (decidido en CLAUDE.md) |

## Tokens
- **Superficies:** `fondo`, `superficie`, `hundido`, `borde`, `borde-fuerte`; texto `texto` y `tenue`.
- **Acento:** `acento` (rojo sangre) solo en la acción principal de cada pantalla y en la marca.
- **Semánticos:** `ok`, `aviso`, `peligro`, `info` (+ variante `-suave` para fondos).
- **Estado de unidad → tono:** cuarentena=aviso · disponible=ok · asignada=info · entregada=neutro · caducada/descartada=peligro.
- **Prioridad → tono:** normal=neutro · urgente=aviso · emergencia=peligro.
- Cifras con `.cifras` (`tabular-nums`) en tablas y KPIs.

## Movimiento
- Curvas: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` para entradas/salidas y presión; `--ease-drawer` para el menú lateral móvil. Nunca `ease-in`.
- Duraciones: presión 150 ms · popovers 150–200 ms · drawer/diálogo ≤ 300 ms. Salida más rápida que la entrada.
- Botones: `scale(0.97)` en `:active`. Hover solo con `@media (hover: hover)`.
- Nada anima en acciones de teclado ni en navegación entre pantallas (se usa cientos de veces al día).
- Entradas desde `scale(0.95)` + `opacity: 0`, nunca `scale(0)`; popovers con `transform-origin` en su disparador; diálogos centrados.
- Solo se animan `transform` y `opacity`.
- `prefers-reduced-motion`: se quitan desplazamientos y escalas, se conservan opacidad y color.

## Responsivo
- Móvil primero. Menú lateral fijo desde `lg`; en móvil es un drawer (Base UI `Dialog`).
- Tablas anchas con scroll horizontal dentro de su tarjeta, nunca de la página.
