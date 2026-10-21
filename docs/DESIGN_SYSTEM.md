# EzLlamaCpp — Sistema visual y de movimiento

Especificación operativa, modo **Operate**. App de escritorio Tauri 2 (Windows 11).

**Todo lo que sigue está verificado, no supuesto:**

- Los contrastes son **WCAG 2.1 calculados** contra la superficie donde se usa el color.
- La separación entre tonos es **CIELAB ΔE** (no "a ojo").
- Los namespaces `@theme` están **compilados con `tailwindcss@4.3.3`**, el del proyecto.
- Las fuentes están **instaladas y servidas** desde `public/fonts/`.

El CSS completo y listo para pegar está en
[`docs/index.design-system.css`](./index.design-system.css).

---

## 0. Principio rector

> **El color es información, no decoración.** Si un píxel no dice "esto está mal",
> "esto está en marcha", "esto es experimental" o "esto está seleccionado", va en gris.

Tres reglas gobiernan todo lo demás:

1. **Una sola acción primaria por vista.** El acento no decora tarjetas; marca la
   acción que el usuario puede tomar ahora.
2. **La densidad es una decisión de producto.** Un operario quiere ver 40 filas de
   modelo, no 6 tarjetas con aire.
3. **El movimiento explica estado.** Si no cambia el significado de algo, no se anima.

---

## 1. El hallazgo que reencuadra todo: el acento verde colisiona con "ok"

El sistema anterior usaba **verde para el acento** (`accent-500: #26cb8e`, hue 158)
y **verde para "sano"** (`ok-500: #22c55e`, hue 142). Medido:

| Métrica | Valor | Lectura |
|---|---|---|
| ΔE CIELAB entre ambos | **22.5** | Por debajo de 30 = indistinguibles para el ojo |
| Contraste mutuo | **1.087** | 1.0 = el mismo color |
| Δhue HSL | 16° | Casi el mismo tono |

Es decir: **"la acción en curso" y "el sistema está sano" son el mismo color.**
Cuando el servidor arrancaba, el botón "Arrancar" y el indicador de "sano" se
pintaban casi igual. Un operario no puede leer esa señal.

La solución: **el acento se mueve a indigo (hue 232)**, con ΔE 136.4 frente al
verde de "ok". Ahora el color dice *qué es*: indigo = lo que tú controlas, verde =
cómo está el sistema.

| | Antes | Ahora |
|---|---|---|
| Acento (acción) | `#26cb8e` verde (hue 158) | `#6b7cf3` indigo (hue 232) |
| OK (estado sano) | `#22c55e` verde (hue 142) | `#22c55e` verde (hue 142) |
| ΔE acento↔ok | 22.5 ❌ | **136.4** ✅ |

---

## 2. Fundamentos

### 2.1 Tipografía — una familia, escala fija de 6 roles

**IBM Plex Sans Variable** (100–700, self-hosted) para UI, títulos y datos.
**IBM Plex Mono** (400/500) para rutas, hashes, flags de CLI, ports, bytes.

> Por qué no Inter: el detector de `impeccable` lo marca como *overused font*
> ("used on so many sites they no longer feel distinctive"). IBM Plex da
> identidad de herramienta de ingeniería sin coste de legibilidad, y tiene un
> mono de la misma familia.

> Por qué self-hosted: el CSP de Tauri es `font-src 'self' data:` — no permite
> `fonts.googleapis.com`. Antes, `--font-sans` declaraba `"Inter"` pero **no
> existía ningún `@font-face`**: la app renderizaba en Segoe UI Variable. Los
> `.woff2` ya están en `public/fonts/`.

Escala fija en `rem` (no fluida — el usuario ve la app a DPI constante):

| Rol | Token | px | Peso | Line-height | Tracking | Uso |
|---|---|---|---|---|---|---|
| Display | `text-display` | 24 | 600 | 1.2 | -0.02em | Título de vista. Uno por pantalla. |
| Title | `text-title` | 17 | 600 | 1.3 | -0.01em | Título de tarjeta/sección. |
| Body | `text-body` | 13.5 | 400 | 1.55 | 0 | Párrafo, celdas, descripciones. |
| Label | `text-label` | 12 | 500 | 1.4 | 0 | Etiquetas de campo, botones, tabs. |
| Meta | `text-meta` | 11 | 400 | 1.35 | 0.005em | Metadatos, unidades, timestamps. |
| Micro | `text-micro` | 10 | 500 | 1.3 | 0.06em | Solo overline en MAYÚSCULAS (`.overline`). |

**El diagnóstico del código actual** (medido con grep sobre `src/`):

| Patrón | Usos | Problema |
|---|---|---|
| `text-[0.6875rem]` (11px) | 64 | Etiquetas y subtextos a 11px → se lee informal y pequeño. |
| `text-xs` (12px) | 77 | Cuerpos de texto a 12px → sin margen para jerarquía. |
| `text-[0.8125rem]` (13px) | 5 | Escala con 3 pasos entre 11 y 18px, sin roles. |
| `text-lg` (18px) | 6 | Único título grande, sin escalón intermedio. |

**Justificación de cada nivel:**

- **13.5px de cuerpo** es el piso de una app de escritorio densa, no de la web.
  Un operario lee 13.5px durante horas; 12px le fuerza a inclinar la cabeza.
- **12px de etiqueta** con peso 500: el peso hace el trabajo de "esto es una
  etiqueta" sin necesidad de 11px ni de mayúsculas. La versión anterior usaba
  11px + `text-transform: uppercase` + `letter-spacing: 0.06em` — eso es
  *overline de marketing*, no etiqueta de control.
- **11px de metadato** es correcto para "12.4 GB · CUDA 0 · ctx 8192": son
  datos secundarios que no compiten.
- **10px** queda reservado a `.overline` (una sola palabra en mayúsculas sobre
  un grupo). Su uso por defecto es **cero**.
- **6 roles con salto real** (1.5–2px entre pasos) en vez de 11/12/13/18.

**Pesos:** solo 400 / 500 / 600. Nada de 700+ en UI. El salto se hace con
**peso + color + tamaño**, nunca con bold solo.

**Números:** todo dato que cambie en vivo usa `tabular-nums` (ya en `.mono` vía
`font-feature-settings: "tnum"`). Sin esto, un medidor que salta de 12 a 13
desplaza toda la columna.

**Medidas:** cuerpo de párrafo a 60–72ch; tablas de modelos hasta 120ch+; notas
de campo a 45–60ch.

### 2.2 Superficies y bordes — 4 superficies + 2 bordes

Regla: **cada nivel de gris tiene un trabajo y uno solo.**

| Token | Hex | Trabajo | Contraste vs canvas |
|---|---|---|---|
| `--color-base-950` | `#0b0d11` | Canvas de la app | 1.00 |
| `--color-base-900` | `#12151b` | Panel / tarjeta | 1.04 |
| `--color-base-850` | `#181c24` | Elevada: menú, popover, hover de fila | 1.08 |
| `--color-base-800` | `#1f242e` | Control: input, botón | 1.14 |
| `--color-base-700` | `#2b3240` | Hairline: borde de tarjeta y de control | 1.49 |
| `--color-base-600` | `#3b4453` | Borde fuerte: hover/focus de control | 1.92 |

El código original tenía `base-950…base-600` (7 niveles) más `base-850`
intercalado, y los usaba sin regla: el mismo `border-base-750` aparecía como
borde de tarjeta, de chip y de input.

Reglas duras:

- **Una tarjeta** = `bg-base-900` + `border-base-700`. Nunca más.
- **Un input** = `bg-base-800` + `border-base-700`; en hover `border-base-600`.
- **Una fila de lista** = sin caja; separación por `bg-base-850` en hover (`.row`).
- **Un separador** dentro de un panel = `border-base-700` 1px.
- **`base-950`** es *solo* canvas y wells. Nunca un borde.

Bordes hairline de **1px** (nunca 0.5px: en HiDPI 150% un 0.5px se ve borroso).
Sombras **solo para lo que flota** (menú, toast, modal). Linear fue explícito:
*"Do not use shadows to separate cards from the canvas — use hairline borders."*

### 2.3 Color — acento con significado semántico

**Acento (indigo, hue 232) = la acción del usuario:**

| Token | Hex | Contraste sobre base-900 | Rol |
|---|---|---|---|
| `--color-accent-300` | `#a8b4fb` | 9.22:1 | Texto de acento |
| `--color-accent-400` | `#8a97f7` | 6.83:1 | Hover + anillo de foco |
| `--color-accent-500` | `#6b7cf3` | 5.05:1 | Borde de focus / selección |
| `--color-accent-600` | `#5468e6` | 3.92:1 | Relleno del botón primario (blanco encima: 4.67:1) |
| `--color-accent-700` | `#3f4cb8` | 2.56:1 | Press |

**Semánticos = el estado del sistema:**

| Rol | 400 (texto) | 500 (relleno/borde) | 600 (sombra/hover) | Hue | Uso |
|---|---|---|---|---|---|
| `ok` | `#4ade80` | `#22c55e` | `#16a34a` | 142 | Servidor sano, GPU activa, operación correcta |
| `warn` | `#fbbf24` | `#f59e0b` | `#d97706` | 38 | Umbral excedido, degradación, "arrancando" |
| `danger` | `#f87171` | `#ef4444` | `#dc2626` | 0 | Error, caído, VRAM insuficiente |
| `info` | `#7dd3fc` | `#38bdf8` | `#0ea5e9` | 198 | Informativo, CPU/RAM, dato que no es estado |
| `violet` | `#e879f9` | `#c026d3` | — | 318 | **Solo experimental**: MTP, draft, flags inestables |

**ΔE mínimo entre cualquier par de tokens `-500`: 50.4.** Ninguno se confunde
con otro. (El par más cercano es accent↔violet a 50.4; el par más lejano,
violet↔ok, a 169.9.)

> **Por qué `violet` es fuchsia y no violeta.** El violeta original (`#a855f7`)
> queda a **ΔE 22.8** del indigo del acento — demasiado cerca. Fuchsia
> (`#c026d3`) abre a **ΔE 50.4**. Y sigue siendo claramente "no producción".

**Regla de asignación de color (para que el color guíe, no decore):**

| Si el píxel es… | Color |
|---|---|
| La acción primaria de la vista | `accent-600` relleno, `accent-300` texto |
| El elemento seleccionado / foco de teclado | `accent-500` borde + `accent-300` texto |
| Un estado del sistema (vivo) | `ok-500` / `warn-500` / `danger-500` |
| Un dato que no es estado | `ink-200` o `ink-300` |
| Una superficie, borde, fondo | escala `base` |

**El verde no es marca.** Si la app "parece verde", es que un estado sano está
pintado como si fuera identidad. Y el **medidor de VRAM no usa el acento**: usa
`ok` → `warn` → `danger` según el umbral. Un 92% de VRAM debe verse ámbar, no
indigo.

### 2.4 Espaciado y grid

Base **4px**, con un único múltiplo libre: `--spacing-gutter: 20px`.

| Token | px | Uso |
|---|---|---|
| `space-1` | 4 | Padding interno de chip, gap icono-texto |
| `space-2` | 8 | Gap entre campos, padding de botón |
| `space-3` | 12 | Padding de control, gap entre filas densas |
| `space-4` | 16 | Padding estándar de tarjeta |
| `space-5` | 20 | **Gutter** de la app (padding lateral del contenido) |
| `space-6` | 24 | Padding de panel, separación de bloques |
| `space-8` | 32 | Separación entre secciones mayores |
| `space-10` | 40 | Respiración entre grupos de tarjeta |

**Reglas de densidad:**

- Tarjeta estándar: padding **16px** (`p-4`). Densa: **12px** (`p-3`).
- Fila de control: 8px entre elementos, 12px entre filas.
- Entre tarjetas: **16px** (`gap-4`). Entre secciones: **24px** (`gap-6`).
- **Más espacio arriba que abajo de un heading**: `mt-6` al heading, `mt-2` al cuerpo.
- Ancho máximo de contenido: **1440px** (`max-w-[90rem]`). A 1600px el contenido
  se centra y no se estira — una línea de 200ch es ilegible.

Grid de 12 columnas, gutter 16px. En el Panel: GPU a 7 col, CPU/RAM a 5 col.

### 2.5 Radios y sombras

Vocabulario de **3 radios** (como Linear: "three radii is the entire radius vocabulary"):

| Token | px | Elemento |
|---|---|---|
| `--radius-control` | 6 | Inputs, botones, chips, toggles |
| `--radius-card` | 12 | Tarjetas y paneles |
| `--radius-panel` | 14 | Modales y overlays grandes |

Pills `9999px` solo para chips de estado.

```
--shadow-panel:   0 1px 2px rgb(0 0 0 / 0.35), 0 6px 20px -10px rgb(0 0 0 / 0.55);
--shadow-float:   0 16px 44px -12px rgb(0 0 0 / 0.7);
--shadow-overlay: 0 24px 64px -16px rgb(0 0 0 / 0.8);
--shadow-inset:   inset 0 1px 0 0 rgb(255 255 255 / 0.04);
```

Todas con offset y blur. Sin halo de color, sin sombra de bloque duro.

### 2.6 Iconografía — lucide-react

- **Tamaño por rol**: 12 (chips/botones sm), 14 (botones md, junto a labels),
  16 (fila de dato), 20 (encabezado de sección), 24 (estado vacío).
- **Grosor**: `strokeWidth={1.75}` para 12–16px; `2` para 20–24px. Nunca 1
  (se rompe en HiDPI), nunca 2.5+.
- **Ícono vs texto**: si la etiqueta cabe, **usa texto**. El icono es para:
  (a) acción icon-only en toolbar, (b) identidad de un ítem en fila densa,
  (c) estado (check, alert, x).
- **Nunca** emoji ni glifos Unicode (el craft-floor lo prohíbe y no escalan bien
  en Windows).
- Icono dentro de botón → `aria-hidden`; el botón lleva el texto.
- `lucide-react@1.60` ya está instalado: no añadir otra librería.

---

## 3. Telemetría viva

### 3.1 El problema del "gauge carísimo"

Un medidor clásico = un elemento con un `width` que cambia cada 500ms → eso
**dispara layout**. Con 30 medidores la app se siente pesada.

**Regla: máximo 1 elemento animado por medidor, y solo con `transform`.**

| Nivel | Elementos animados | Técnica |
|---|---|---|
| Barras de uso (VRAM, RAM) | 1 `span` por barra | `transform: scaleX()` |
| Indicador de estado (servidor) | 1 dot + 1 pseudo-elemento | `transform`/`opacity` |
| Sparkline | 1 `<svg>` con 2 `<path>` | Redibujo al llegar muestra |
| Carga / descarga | 0 (texto) | El número cambia; no se anima |

**Budget:** ≤ 6 animaciones CSS activas simultáneas en el Panel. Todo lo demás
(skeletons, transiciones de estado) es `transition`, no `animation`.

### 3.2 Medidor de uso (VRAM / RAM) — `scaleX`, no `width`

```tsx
export function LiveMeter({
  value, max, label, valueLabel, tone,
}: {
  value: number; max: number;
  label: React.ReactNode; valueLabel: React.ReactNode;
  tone?: "ok" | "warn" | "danger";
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink-300">{label}</span>
        <span className="mono tabular-nums text-body font-medium text-ink-100">
          {valueLabel}
        </span>
      </div>
      <div
        className={clsx("meter", tone === "danger" && "meter-danger", tone === "warn" && "meter-warn")}
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
      >
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}
```

CSS (ya en `docs/index.design-system.css`):

```css
.meter {
  position: relative;
  height: 6px;
  border-radius: 999px;
  background: var(--color-base-800);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.03);
}
.meter > span {
  display: block;
  height: 100%;
  width: 100%;
  border-radius: 999px;
  transform-origin: left center;
  transform: scaleX(0);
  background: var(--color-ok-500);
  transition:
    transform 320ms var(--ease-instrument),
    background-color 320ms var(--ease-instrument);
}
.meter-warn > span   { background: var(--color-warn-500); }
.meter-danger > span { background: var(--color-danger-500); }
```

**Por qué `scaleX`:** no dispara layout — solo composición. Un `width` animado
recalcula geometría del árbol en cada frame. Con 30 medidores esa es la
diferencia entre "vivo" y "pesado".

**El "vivo" visual** no es solo el movimiento: es que **el número cambia con
decimales y sin parpadeo**. `tabular-nums` + `tnum` evitan el reflow horizontal.

**El color cruza el umbral** al pasar de ok → warn → danger. Para que no haya
salto visible, la transición de `background-color` dura lo mismo que la de
`transform` (320ms).

**Umbrales por defecto:** warn 0.80, danger 0.95. El color del medidor
**nunca** es el acento: el acento significa "tú controlas esto", el medidor
significa "el sistema está así".

### 3.3 Sparkline de latencia / throughput

La implementación ya presente en `src/components/Telemetry.tsx` usa **SVG con
`viewBox` fijo (100×32) y `preserveAspectRatio="none"`** — 2 `<path>`, no 60
elementos. Es la opción correcta y más simple que un canvas en este caso:

- `vector-effect: non-scaling-stroke` mantiene el grosor del trazo de 1.5px
  aunque el viewBox se estire → nitidez en cualquier ancho.
- El área bajo la curva es un gradiente al 16% del color de tono.
- El buffer es un `Ring` circular de 90 muestras en `src/lib/useTelemetry.ts`
  (1 Hz, 90 s de ventana), y vive en un `useRef` para no disparar render al
  escribir.

**Regla anti-jitter:** la sparkline se redibuja **solo cuando llega una muestra
nueva**, no en cada render de React.

**Tono de la sparkline según el significado de la serie:**

| Serie | Tono | Razón |
|---|---|---|
| Throughput / tokens/s | `accent` | Es una medida de "lo que tú pediste", no un estado del sistema. |
| Latencia / p95 | `ok` → `warn` → `danger` según umbral | Es un estado de salud del servidor. |
| CPU % | `ok` | igual: el uso normal no es "malo". |
| RAM % | `ok` → `warn` → `danger` | sí escala. |

### 3.4 Pulso de estado del servidor

Tres estados, **tres tratamientos distintos** (no "el mismo punto en otro color"):

| Estado | Dot | Halo | Texto | Animación |
|---|---|---|---|---|
| **Sano** (`health`) | `ok-500` 7px | Halo que *respira* | `ink-100` | `ez-breathe` 3.4s |
| **Arrancando** (`running` sin `health`) | `warn-500` 7px | Halo que *late* | `warn-400` | `ez-ping` 1.9s |
| **Detenido** | `ink-500` 7px | Ninguno | `ink-400` | Ninguna |

```css
.pulse-dot {
  position: relative;
  display: inline-block;
  height: 7px; width: 7px; flex: none;
  border-radius: 999px;
  background: var(--color-ink-500);
}
.pulse-dot::after {
  content: "";
  position: absolute; inset: 0;
  border-radius: 999px;
  background: inherit;
  animation: ez-ping 1.9s var(--ease-instrument) infinite;
}
.pulse-dot-ok     { background: var(--color-ok-500); }
.pulse-dot-warn   { background: var(--color-warn-500); }
.pulse-dot-danger { background: var(--color-danger-500); }
.pulse-dot-live::after { animation: ez-breathe 3.4s ease-in-out infinite; }
.pulse-dot-idle::after { animation: none; opacity: 0; }
```

**Por qué "sano" respira y "arrancando" late.** Un latido constante en una UI
de escritorio es ruido (el operador lo ve 8 horas). La respiración a 3.4s es
perceptible pero no llama la atención. El pulso rápido queda reservado al
estado transitorio, que es el único que exige acción.

**El halo es UN pseudo-elemento** con `transform`/`opacity` — nunca `filter`
(`filter` es caro) ni `box-shadow` animado (repinta).

### 3.5 Indicador de uso CPU/GPU — el que NO es un gauge

CPU/GPU **no** llevan una barra gruesa: un porcentaje de CPU es ruido. Llevan
una **fila de dato con barra fina inline** (6px) y lectura numérica en tabular.

Si se necesita histórico, la **sparkline** (§3.3) es el vehículo correcto, no
un anillo de progreso. Un anillo para "62% CPU" es un gauge carísimo con forma
de donut: cero información por pixel.

**CPU/GPU usan el tono `ok`, no el de estado:** un 62% de CPU no es un problema.
Solo se vira a `warn`/`danger` cuando el umbral se cruza de verdad.

### 3.6 Carga diferida (skeletons)

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-base-850) 25%,
    var(--color-base-800) 37%,
    var(--color-base-850) 63%
  );
  background-size: 400% 100%;
  animation: ez-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-control);
}
```

**Regla:** el skeleton imita la **forma exacta** del contenido final (misma
altura de fila, mismo ancho de columna). Un skeleton genérico de "3 barras
grises" rompe la continuidad al cargar.

---

## 4. Movimiento

### 4.1 Tokens

| Token | Valor | Uso |
|---|---|---|
| `--ease-instrument` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entradas, expansiones, medidores |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Salidas |
| `--ease-snap` | `cubic-bezier(0.16, 1, 0.3, 1)` | Feedback inmediato, press |

> **Nota técnica:** `--duration-*` **no es un namespace válido** en Tailwind v4
> (verificado: la cadena `--duration-` no existe en `tailwindcss/dist/lib.mjs`).
> Usa los `duration-150`/`duration-200` built-in, o define la duración dentro
> de la clase de componente. En este sistema las duraciones viven en las
> clases, no en `@theme`.

**Duraciones (según `impeccable/animate.md`):**

| Nombre | ms | Uso |
|---|---|---|
| instant | 90 | Press, toggle de check |
| fast | 140 | Hover, focus, color de chip |
| base | 200 | Cambio de estado de control |
| slow | 320 | Entrada de vista, barra de medidor |
| slower | 480 | Skeleton, toast |

**La salida es más rápida que la entrada** (200ms vs 320ms).

### 4.2 Snippets listos para pegar

```css
/* --- Keyframes --------------------------------------------------------- */

@keyframes ez-fade-up {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

@keyframes ez-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Entrada de fila de lista: el contenido aparece, no "flota". */
@keyframes ez-rise {
  from { opacity: 0; transform: translateY(4px) scale(0.995); }
  to   { opacity: 1; transform: none; }
}

@keyframes ez-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}

/* Halo del punto de estado (servidor arrancando). */
@keyframes ez-ping {
  0%        { transform: scale(1);   opacity: 0.7; }
  75%, 100% { transform: scale(2.6); opacity: 0; }
}

/* Respiración lenta del estado sano. */
@keyframes ez-breathe {
  0%, 100% { opacity: 0.24; transform: scale(1); }
  50%      { opacity: 0.5;  transform: scale(1.3); }
}

@keyframes ez-shimmer {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

@keyframes ez-spin {
  to { transform: rotate(360deg); }
}

/* Toast: sube con desenfoque acotado. */
@keyframes ez-toast-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); filter: blur(4px); }
  to   { opacity: 1; transform: none; filter: blur(0); }
}

@keyframes ez-toast-out {
  from { opacity: 1; transform: none; }
  to   { opacity: 0; transform: translateY(4px); }
}

/* --- Utilidades -------------------------------------------------------- */

.animate-fade-up   { animation: ez-fade-up 260ms var(--ease-instrument) both; }
.animate-fade-in   { animation: ez-fade-in 240ms var(--ease-instrument) both; }
.animate-rise      { animation: ez-rise 260ms var(--ease-instrument) both; }
.animate-pulse     { animation: ez-pulse 1.9s ease-in-out infinite; }
.animate-skeleton  { animation: ez-shimmer 1.4s ease-in-out infinite; }
.animate-spin      { animation: ez-spin 700ms linear infinite; }
.animate-toast-in  { animation: ez-toast-in 320ms var(--ease-instrument) both; }

/* Stagger: SOLO para siblings de una lista. Tope de 150ms. */
.stagger > * { animation: ez-rise 280ms var(--ease-instrument) both; }
.stagger > *:nth-child(1)   { animation-delay: 0ms; }
.stagger > *:nth-child(2)   { animation-delay: 30ms; }
.stagger > *:nth-child(3)   { animation-delay: 60ms; }
.stagger > *:nth-child(4)   { animation-delay: 90ms; }
.stagger > *:nth-child(5)   { animation-delay: 120ms; }
.stagger > *:nth-child(n+6) { animation-delay: 150ms; }
```

### 4.3 `prefers-reduced-motion`

**No se desactiva el movimiento: se degrada.** La telemetría debe seguir *viva*
(el número cambia, el estado cambia de color), pero sin desplazamiento espacial.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* El halo se vuelve un anillo fijo: el color del estado sigue visible. */
  .pulse-dot::after {
    animation: none !important;
    opacity: 0.3 !important;
    transform: none !important;
    inset: -2px !important;
  }

  /* El medidor sigue cambiando de tamaño; solo pierde el ease-out largo. */
  .meter > span { transition-duration: 120ms !important; }

  /* El skeleton deja de barrerse: un bloque plano sigue diciendo "cargando". */
  .skeleton {
    animation: none !important;
    background: var(--color-base-800) !important;
  }

  /* Entradas: solo opacidad, sin desplazamiento. */
  .animate-fade-up,
  .animate-rise,
  .stagger > * {
    animation-name: ez-fade-in !important;
    transform: none !important;
  }
}
```

El bloque global que hace "todo 0.01ms" es **deseable**: es el estándar y mata
cualquier animación que se cuele. Los overrides restauran la *información* (el
estado por color) sin restaurar el movimiento.

### 4.4 Micro-interacciones con intención

**Botón** — 6 estados, todos definidos:

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border-radius: var(--radius-control);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color 140ms var(--ease-instrument),
    border-color 140ms var(--ease-instrument),
    color 140ms var(--ease-instrument),
    box-shadow 140ms var(--ease-instrument),
    transform 90ms var(--ease-snap);
  user-select: none;
}
.btn:active:not(:disabled) { transform: translateY(0.5px); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
```

| Variante | Default | Hover | Active | Disabled |
|---|---|---|---|---|
| `btn-primary` | bg `accent-600`, texto blanco | bg `accent-500` | bg `accent-700` + `translateY(.5px)` | opacity .45 |
| `btn-ghost` | bg `base-800`, texto `ink-200`, borde `base-700` | bg `base-850`, borde `base-600` | bg `base-850` | opacity .45 |
| `btn-quiet` | bg transparente, texto `ink-300` | bg `base-800`, texto `ink-100` | — | opacity .45 |
| `btn-danger` | bg `danger-500`/14%, texto `danger-400`, borde /38% | bg /24% | bg /30% | opacity .45 |

**Input** — 5 estados:

```css
.field {
  width: 100%;
  background: var(--color-base-800);
  border: 1px solid var(--color-base-700);
  border-radius: var(--radius-control);
  padding: 0.375rem 0.625rem;
  color: var(--color-ink-100);
  font-size: 0.75rem;
  font-family: inherit;
  transition:
    border-color 140ms var(--ease-instrument),
    box-shadow 140ms var(--ease-instrument),
    background-color 140ms var(--ease-instrument);
}
.field:hover:not(:disabled) { border-color: var(--color-base-600); }
.field:focus {
  outline: none;
  border-color: var(--color-accent-500);
  box-shadow: 0 0 0 3px rgb(107 124 243 / 0.2);
}
.field:disabled { opacity: 0.5; cursor: not-allowed; }
.field::placeholder { color: var(--color-ink-500); }
```

**Foco global:**

```css
:focus-visible {
  outline: 2px solid var(--color-accent-400);
  outline-offset: 2px;
  border-radius: var(--radius-control);
}
```

`accent-400` sobre `base-950` da **7.27:1** — el anillo de foco es claramente
visible sin ser agresivo.

**Optimistic UI con reversión** (en `App.tsx`):

```tsx
const saveConfig = useCallback(
  async (next: AppConfig) => {
    const prev = config;
    setConfig(next);                       // optimista: la UI ya cambió
    try {
      const saved = await api.setConfig(next);
      setConfig(saved);                    // reconciliación con la verdad
    } catch (e) {
      setConfig(prev);                     // reversión
      toast.push(`No se pudo guardar: ${String(e)}`, "danger");
    }
  },
  [config, toast],
);
```

**Estado de carga en botones:**

```tsx
{loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : icon}
```

El spinner rota en `transform` (composición, no layout). `aria-hidden` porque el
texto del botón ya dice qué pasa.

---

## 5. Responsive — reglas para app de escritorio

Ventana por defecto **1280×820**, `minWidth: 960`, `minHeight: 640`
(`src-tauri/tauri.conf.json`).

### 5.1 1280 → 1600px

- Contenido **centrado** con `max-w-[90rem]` (1440px) y gutter de 20px.
- A partir de **1440px** (`3xl`, breakpoint declarado en `@theme`), el Panel
  pasa a 3 columnas: GPU (5) | CPU-RAM (4) | Presets (3).
- A **1600px** no se añade nada más. La densidad no crece: el grid ya está
  lleno. Un tool de escritorio no debe "aprovechar" el monitor con decorado.

### 5.2 900–1280px (ventana estrecha)

| Elemento | Regla |
|---|---|
| Gutter lateral | 20px → 16px por debajo de 1280px |
| Grid del Panel | 2 columnas hasta 900px; 1 columna por debajo |
| Tabla de modelos | Columnas secundarias (`backend`, `quant`, `ctx`) se ocultan en `<xl` |
| Nav superior | Los labels de sección se ocultan por debajo de 1100px, quedan iconos + `title` |
| Presets | 3 col → 2 col → 1 col |
| Stat row | 3 col → 2 col → 1 col |

```tsx
<main className="flex-1 overflow-y-auto">
  <div className="mx-auto max-w-[90rem] px-4 py-5 xl:px-5 xl:py-6">
    {content}
  </div>
</main>
```

### 5.3 < 960px (bajo el `minWidth` de Tauri — solo por redimensionado agresivo)

- Nav → **solo iconos**, con `aria-label` y tooltip.
- Grid del Panel → 1 columna.
- La tabla de modelos pasa a **lista de tarjetas**. Regla: nunca una tabla con
  scroll horizontal en una app de escritorio.

### 5.4 HiDPI (125%, 150%, 200%)

- **Nada de bordes de 0.5px.** En 150% un hairline de 0.5px se renderiza a
  0.75px y se ve borroso. Todo borde es **1px CSS** y deja que el DPR lo maneje.
- **Iconos de 12px** se ven proxies a 150%; los de botones sm suben a 13px con
  DPR ≥ 1.5.
- **Sombras**: en px CSS, escalan con el DPR. Correcto.
- **`transform: scaleX()`** en el medidor: no se pixela, se re-renderiza. Correcto.
- **Sparkline SVG**: `vector-effect: non-scaling-stroke` mantiene el trazo
  nítido a cualquier DPR y cualquier ancho.
- **`tabular-nums`**: sin esto los números cambian de ancho y la columna
  "vibra". Crítico en HiDPI, donde 1px se nota.
- **Scrollbar**: 10px, el ancho nativo de Windows 11. No adelgazar a 8px.
- **Texto de 11px en HiDPI 200%** se lee bien; en 100% es el límite inferior.
  Por eso `text-meta` (11px) es solo para metadatos, nunca para etiquetas.

---

## 6. Guía de uso de la telemetría viva

### 6.1 Componente completo

```tsx
// src/components/Telemetry.tsx (ya implementado en el repo)
import { useMemo } from "react";
import clsx from "clsx";
import type { Sample } from "../lib/useTelemetry";

/** Sparkline: serie temporal con área bajo la curva.
 *  viewBox fijo (100x32) + preserveAspectRatio="none" -> 2 <path>, no 60
 *  elementos. non-scaling-stroke mantiene el trazo nítido a cualquier DPR. */
export function Sparkline({
  samples, height = 32, tone, min, max, className,
}: {
  samples: Sample[]; height?: number;
  tone?: "accent" | "ok" | "warn" | "danger";
  min?: number; max?: number; className?: string;
}) {
  const path = useMemo(() => {
    if (samples.length < 2) return null;
    const values = samples.map((s) => s.value);
    const lo = min ?? Math.min(...values);
    const hi = max ?? Math.max(...values);
    const span = hi - lo || 1;
    const stepX = 100 / (samples.length - 1);
    const y = (v: number) => 30 - ((v - lo) / span) * 28;
    const line = samples
      .map((s, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${y(s.value).toFixed(2)}`)
      .join(" ");
    return { line, area: `${line} L100,32 L0,32 Z` };
  }, [samples, min, max]);

  if (!path) {
    return (
      <div className={clsx("flex items-center justify-center", className)}
           style={{ height }} aria-hidden>
        <div className="h-px w-full bg-base-800" />
      </div>
    );
  }

  return (
    <svg className={clsx("spark", tone === "warn" && "spark-warn",
                          tone === "danger" && "spark-danger", className)}
         viewBox="0 0 100 32" preserveAspectRatio="none" style={{ height }}
         role="img" aria-label={`Serie de ${samples.length} muestras`}>
      <path className="spark-area" d={path.area} />
      <path className="spark-line" d={path.line} />
    </svg>
  );
}

/** Medidor con pulso: el relleno se anima con scaleX (sin layout). */
export function LiveMeter({
  value, max, label, valueLabel, tone, className,
}: {
  value: number; max: number;
  label: React.ReactNode; valueLabel: React.ReactNode;
  tone?: "ok" | "warn" | "danger"; className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={clsx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink-300">{label}</span>
        <span className="mono tabular-nums text-body font-medium text-ink-100">
          {valueLabel}
        </span>
      </div>
      <div className={clsx("meter", tone === "danger" && "meter-danger",
                           tone === "warn" && "meter-warn")}
           role="meter" aria-valuenow={Math.round(value)}
           aria-valuemin={0} aria-valuemax={Math.round(max)}>
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

/** Punto de estado: "sano" respira, "arrancando" late, "detenido" no se mueve. */
export function Pulse({
  tone = "idle", label, className,
}: {
  tone?: "idle" | "ok" | "warn" | "danger";
  label?: React.ReactNode; className?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <span className={clsx("pulse-dot",
                            tone === "ok" && "pulse-dot-ok pulse-dot-live",
                            tone === "warn" && "pulse-dot-warn",
                            tone === "danger" && "pulse-dot-danger",
                            tone === "idle" && "pulse-dot-idle")}
            aria-hidden />
      {label && <span className="text-label text-ink-300">{label}</span>}
    </span>
  );
}
```

### 6.2 El buffer (ya implementado en `src/lib/useTelemetry.ts`)

```ts
export class Ring {
  private items: Sample[] = [];
  constructor(private readonly max: number) {}
  push(value: number, at = Date.now()): void {
    this.items.push({ at, value });
    if (this.items.length > this.max) {
      this.items.splice(0, this.items.length - this.max);
    }
  }
  values(): Sample[] { return this.items; }
  last(): number | null { return this.items.length ? this.items[this.items.length - 1].value : null; }
  peak(): number { return this.items.reduce((m, s) => Math.max(m, s.value), 0); }
  clear(): void { this.items = []; }
}
```

- Ventana de **90 muestras a 1 Hz = 90 segundos** de historial.
- Vive en un `useRef`: escribir en él **no dispara render**; solo el `setSnapshot`
  del tick lo hace.
- La **VRAM se refresca cada 3 s**, no cada 1 s, porque leerla lanza
  `llama-server --list-devices` — un proceso nuevo. En el intervalo se
  reutiliza la última lectura.
- El sondeo **se pausa cuando la ventana pierde el foco** (`document.hidden`): una
  app de escritorio no debe lanzar procesos en segundo plano sin que nadie la mire.

### 6.3 Tono de la telemetría — tabla de decisión

| Elemento | Tono | Razón |
|---|---|---|
| VRAM en uso | `ok`→`warn`(80%)→`danger`(95%) | Es un estado del sistema con umbral. |
| RAM en uso | `ok`→`warn`(80%)→`danger`(95%) | Igual. |
| CPU % | `ok` siempre (salvo >90 → `warn`) | Un 62% de CPU no es un problema. |
| GPU % (util.) | `ok` siempre | Igual. |
| Latencia p95 | `ok`→`warn`→`danger` por umbral | Salud del servidor. |
| Throughput / tok/s | `accent` | Es "lo que tú pediste", no un estado. |
| Servidor sano | `pulse-dot-ok pulse-dot-live` | Respira. |
| Servidor arrancando | `pulse-dot-warn` | Late. |
| Servidor caído | `pulse-dot-danger` | Fijo, rojo. |
| Slots ocupados | `ink-300` + barra fina | Dato, no alerta. |

### 6.4 La regla de "una barra por fila"

Nunca dos barras en la misma fila. Si necesitas CPU **y** GPU, son dos filas
distintas con su propio dato y su propia sparkline. Y un medidor de barras solo
se justifies si el valor tiene **umbral** (VRAM, RAM); si no lo tiene, el
número y la sparkline bastan.

---

## 7. Mapeo de tokens: código viejo → nuevo

| Viejo | Nuevo | Cambio |
|---|---|---|
| `--color-accent-*` (verde `#86f0c6`…`#0f8559`) | `#a8b4fb`…`#3f4cb8` (indigo) | **Acento ≠ estado.** ΔE vs ok: 22.5 → 136.4 |
| `--color-ok-400/500` | igual (`#4ade80`/`#22c55e`) + `--color-ok-600` | Añade 600 |
| `--color-warn-400/500` | igual + `--color-warn-600` | Añade 600 |
| `--color-danger-400/500` | igual + `--color-danger-600` | Añade 600 |
| `--color-info-400/500` | `#7dd3fc`/`#38bdf8` + `#0ea5e9` | Cian, no azul (separado del acento) |
| `--color-violet-400/500` | `#e879f9`/`#c026d3` | Fuchsia: ΔE vs acento 22.8 → 50.4 |
| `--radius-card: 10px` | `12px` | Alineado con Linear |
| `--radius-panel: 12px` | `14px` | |
| `--radius-control: 7px` | `6px` | |
| `--ease-out-soft` | `--ease-instrument` (+ `--ease-exit`, `--ease-snap`) | Mismo valor, nombre con sentido |
| `--font-sans: "Inter"` | `"IBM Plex Sans"` (self-hosted) | Inter no estaba ni cargado; además es *overused* |
| `--font-mono: "JetBrains Mono"` | `"IBM Plex Mono"` (self-hosted) | Idem |
| `body { font-size: 13px }` | `13.5px` + escala de 6 roles | El cuerpo era demasiado pequeño |
| `.label` 11px uppercase | `.label` 12px peso 500, sin mayúsculas | Etiqueta de control, no de marketing |
| `.meter > span { width }` | `transform: scaleX()` | Evita layout |
| `.chip-*` tinte 45%/14% | tinte 42%/14% | Margen de seguridad |

**No hay rupturas**: `base-850`, `base-800`, `base-750`, `base-700`, `base-600`,
`ink-100…ink-500` y `accent-300…accent-700` **siguen existiendo** con el mismo
nombre. Lo que cambia es el **valor** de `accent-*` y `violet-*` (por eso hay
que revisar los pocos sitios donde el verde era decorativo, p. ej. el logo
`public/ezllama.svg`, que aún va en `#22c98a`).

---

## 8. Nota técnica: namespaces de Tailwind v4

Verificado compilando con `tailwindcss@4.3.3` (el del proyecto):

**Válidos** (generan utility): `--color-*`, `--font-*`, `--text-*` (con su
`--text-*--line-height` / `--text-*--letter-spacing` / `--text-*--font-weight`),
`--radius-*`, `--shadow-*`, `--ease-*`, `--animate-*`, `--tracking-*`,
`--leading-*`, `--breakpoint-*`, `--spacing-*`, `--font-weight-*`.

**NO válido:** `--duration-*` **no existe** en Tailwind v4 (la cadena
`--duration-` no aparece en `tailwindcss/dist/lib.mjs`). Usa `duration-150`,
`duration-200` built-in, o define la duración en la clase de componente.

**`--breakpoint-3xl` / `--breakpoint-4xl` sí funcionan**: compilan a
`@media (width >= 90rem)`. Tailwind escapa el nombre de la clase como `.\33 xl\:`
(por eso un grep literal de `3xl:flex` no lo encuentra).

**Fuentes:** los `.woff2` ya están en `public/fonts/`:
`ibm-plex-sans-latin-var.woff2` (45KB, ejes wght 100–700),
`ibm-plex-mono-latin-400.woff2` (14KB),
`ibm-plex-mono-latin-500.woff2` (15KB).

El subconjunto `latin` cubre latin-1, así que incluye `á é í ó ú ñ ¿ ¡` — suficiente
para español. Si en el futuro hay cirílico o griego, añadir `latin-ext` o el
subconjunto correspondiente.

---

## 9. Referencias — qué se tomó de cada app

Todas verificadas leyendo la fuente, no de memoria.

### Linear — el modelo de referencia principal
Fuente: `design.hagicode.com/designs/linear.app/DESIGN.md`,
`styles.refero.design/style/90ce5883-…`

- **Canvas casi negro** `#08090a` → `--color-base-950: #0b0d11`.
- **Bordes hairline** `rgba(255,255,255,0.05–0.08)` → la escala `base-700/600`.
- **3 radios** (input 6px, botón 6px, card 12px) → `--radius-control/card/panel`.
  Su guía es literal: *"three radii is the entire radius vocabulary"*.
- **Peso 510 como firma** (entre 400 y 500) → aquí se materializa como
  `text-label` a 500 y `text-meta` a 400: el énfasis sin el peso.
- **Un solo acento cromático**, solo en CTA/selection/estado → la regla de
  asignación de §2.3.
- **Tracking negativo progresivo** en display (-1.584px a 72px) → `-0.02em` en
  `text-display`.
- **"Do not use shadows to separate cards from the canvas"** → de ahí que las
  sombras solo decoren lo que flota.
- **4 niveles de gris de texto** (`#f7f8f8`, `#d0d6e0`, `#8a8f98`, `#62666d`) →
  la rampa `ink-100…ink-500`, recalculada para pasar AA en `base-800`.
- **"Do not introduce additional chromatic accent colors as actions"** → de aquí
  que el acento sea **una sola familia cromática** y los semánticos estén
  cromáticamente separados de ella.

### Warp — densidad y semántica de bloques
Fuente: `docs.warp.dev/terminal/blocks/block-basics/`,
`VoltAgent/awesome-design-md/design-md/warp/DESIGN.md`

- **"Blocks are color-coded. Blocks that quit with a non-zero exit code have a
  red background and red sidebar."** → el color codifica el *estado del proceso*,
  no la marca. De ahí que ok/warn/danger pinten el estado del servidor.
- **Bloques agrupando comando + salida** → la "unidad operativa" (un modelo, un
  preset) es una región con borde propio, no una tarjeta suelta.
- **Escala de espaciado 8/16/24/32/48/64** → la escalera de 4px con gutter de 20px
  como única excepción.
- **Radios 4/6px e Inter densa** → la base del modelo de controles.

### LM Studio — tokenización semántica y perfiles
Fuente: `lmstudio.ai/docs/app/user-interface/themes`,
`github.com/ChristinaBusacker/lmstudio-web`

- **Tokens semánticos** (`--bg`, `--surface-1`, `--text`, `--border`,
  `--primary`, `--focus-ring`) en vez de hex sueltos en componentes → el enfoque
  de `@theme` con nombres por rol.
- **Tema oscuro por defecto** + selector de tema → la app queda con un tema
  oscuro, pero el token está listo para variantes.
- **"Auto" siguiendo el tema del sistema** → relevante si se añade modo claro.
- **Perfiles/presets con nombre** → la noción de "preset" como unidad de
  configuración restaurable, que EzLlamaCpp ya tiene.

### Jan — configuración por roles y ejecución local
Fuente: `jan.ai/handbook/what-jan-is`, `JanAI-Local-LLM-Workstation`

- **Ejecución local y offline como promesa central** → sostiene el tema oscuro
  técnico: "todo ocurre en tu máquina".
- **Tabs de función clara** (Models / Chat / Settings) → la navegación por
  secciones (Panel / llama.cpp / Despliegue / Ajustes).
- **Documentos de modelo con metadatos ricos** (params, quant, context) → la
  densidad de la tabla de modelos, y la razón de que `mono` + `tabular-nums`
  sean obligatorios ahí.

### ComfyUI — el color como tipo de dato
Fuente: `docs.comfy.org/interface/appearance`,
`Comfy-Org/ComfyUI_frontend/packages/design-system/src/css/style.css`

- **Paleta por *tipo de dato*** (`node_slot` con un color por CLIP, VAE, MASK,
  LATENT…) → el modelo de asignar color por **función del dato** (GPU, CPU/RAM,
  experimental) y no por decorado.
- **Tokens CSS con nombres funcionales** (`--comfy-menu-bg`, `--comfy-input-bg`,
  `--border-color`, `--descrip-text`, `--widget-text-color`) → la convención de
  nombres por rol.
- **Jerarquía de 3 niveles en el nodo**: `NODE_TEXT_SIZE: 14`,
  `NODE_SUBTEXT_SIZE: 12` → el par `text-title`/`text-meta` de la fila densa.
- **`--default-transition-duration: 0.1s`** → el extremo rápido de la escala.

### Zed — radios, grid y elevación mínima
Fuente: `sokosumi.com/tools/design-md/analysis/zed`, `zed.dev/docs/appearance`

- **"Sharp edges (4px and 8px radii)"** y `primary #3d7fd9` reservado en
  exclusiva a CTA/focus/links → la regla de que el acento no se reparte.
- **Transiciones de nivel a 150ms** `cubic-bezier(0.4, 0, 0.2, 1)` → el extremo
  rápido de `--ease-instrument`.
- **Container max-width 1280px, gutter 24px, grid de 12 columnas** → el
  `max-w-[90rem]` (1440px) con gutter de 20px.
- **Elevación en 3 niveles** (base con borde, elevated con sombra al hover,
  floating con sombra profunda) → `--shadow-panel/float/overlay`.
- **`entry_spacing: "comfortable" | "standard"`** como densidad conmutable → el
  concepto de `p-4` (normal) vs `p-3` (densa).

### Cursor — un color = un significado
Fuente: `designbycurio.com/learn/cursor-ide`, `opendesign.cc/en/sites/cursor`

- **"Every surface that is dark and quiet is human territory. Every surface that
  glows with the signature blue is AI territory. The distinction is enforced
  purely through color."** → el modelo de "el color codifica un dominio
  semántico": aquí, acento = lo que controlas, semánticos = cómo está el
  sistema, fuchsia = experimental.
- **Restricción cromática deliberada**: *"where most productivity software
  distributes color freely… Cursor withholds it almost entirely"* → el veto a
  pintar chips decorativos.
- **Off-white typography** sobre near-black → la tinta `ink-100…ink-500`.
- **Radios redondeados, nada de esquinas vivas** → el vocabulario de 3 radios.

---

## 10. Checklist de aplicación

- [x] `@font-face` de IBM Plex Sans + IBM Plex Mono, `.woff2` en `public/fonts/`
- [x] Bloque `@theme` completo verificado (§7 y `docs/index.design-system.css`)
- [x] `@layer components` con card/panel/btn/field/label/chip/meter/pulse-dot/skeleton
- [x] `prefers-reduced-motion` con los overrides de §4.3
- [ ] Aplicar la escala tipográfica (`text-display/title/body/label/meta`) en las
      vistas — hoy hay 64 usos de `text-[0.6875rem]` y 77 de `text-xs`
- [ ] Cambiar `Meter`/`LiveMeter` a `transform: scaleX()` (§3.2)
- [ ] Actualizar `public/ezllama.svg`: el logo sigue en verde `#22c98a`, que
      ahora significa "sano", no "identidad"
- [ ] Revisar los usos de `accent-*` que eran decorativos (fondos `bg-accent-600/15`
      en iconos) y decidir si son acción o estado
- [ ] Mover el botón Arrancar/Parar al final del flujo (no al header sticky)
- [ ] Verificar con `impeccable detect --json src`
