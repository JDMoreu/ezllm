---
name: EzLLM
description: Local llama.cpp workbench for people who want the command line made legible.
colors:
  action-blue: "#5a8cf0"
  action-blue-hover: "#7aa7f7"
  action-blue-soft: "#a9c6fb"
  action-ink: "#05070d"
  surface-app: "#000000"
  surface-panel: "#0c0d10"
  surface-raised: "#16181d"
  surface-hover: "#22262d"
  rule-subtle: "#22262d"
  border-strong: "#323741"
  border-control: "#5c6370"
  text-strong: "#f3f5f8"
  text-body: "#d7dae0"
  text-secondary: "#b9c0ca"
  text-muted: "#9da5b4"
  status-ok: "#89ca78"
  status-warn: "#e5c07b"
  status-danger: "#ef596f"
  status-info: "#2bbac5"
  model-violet: "#d55fde"
typography:
  display:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.01em"
  meta:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  micro:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "Plex Mono, Cascadia Code, Consolas, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  micro: "4px"
  tag: "5px"
  control: "7px"
  card: "10px"
  panel: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  button-ghost:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  input-field:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  status-chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "2px 6px"
  section:
    backgroundColor: "{colors.surface-panel}"
    rounded: "{rounded.card}"
    padding: "16px"
  command-editor:
    backgroundColor: "{colors.surface-app}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "10px"
---

# Design System: EzLLM

## Current implementation contract (2026-11-13)

The UI uses shadcn/ui + Radix primitives through `src/components/ui.tsx` and
`ui-kit`. Core buttons, inputs, selects and language choices share one system.
Use 14px body, 13px labels, 12px metadata; 36px controls and 32px compact controls.
Use Lucide outline icons with a 1.75px stroke, self-hosted IBM Plex families,
and the Hyper Term palette (pitch black, One Dark grays, Hyper syntax semantics). Workspaces have no page heading: the
active title-bar tab already names the view, so content starts with its first section. The sidebar is 280px, or 256px at compact desktop widths.
Model slots have a label row and file row, collapsing into compact single rows.
Dedicated GPU memory appears right after GPU usage and before CPU/RAM, with an adapter selector and
explicit unavailable state. Never infer global VRAM use from a process budget.
See [implementation and validation](docs/UI_VRAM_VALIDACION.md).
These rules supersede older dimensions and component descriptions below.

## Overview

**Creative North Star: "The Instrument Bench"**

EzLLM looks like a bench that is already in use, not a dashboard that wants to be admired. The interface is dark, precise, and unhurried: the title bar holds the workspace tabs, a fixed sidebar holds the runtime, the machine and the server status, and the main area changes between four complete workspaces. Controls are compact, rows are flat, and the measured values are the only elements allowed to look technical.

The system gets its depth from four graphite surfaces and one-pixel rules, not from stacked floating cards. Blue is the only action color. Green, amber, red, cyan, and violet carry meaning and are never used as decoration. The result should feel like professional local software: dense enough for someone who knows llama.cpp, legible enough for someone opening their first GGUF.

Motion is short and functional. Numbers change with tabular figures, focus is always visible, and every status has a word next to its color. The command line is not hidden; it is made readable and editable inside the execution card, with the argument library feeding it directly.

**Key Characteristics:**
- A fixed 280px instrument sidebar under a 48px in-app title bar that holds the brand, the workspace tabs and the window controls.
- Four graphite surfaces, one-pixel rules, and almost no ambient shadow.
- One blue action accent; semantic colors remain semantic.
- Flat rows and sections instead of nested card stacks.
- IBM Plex Sans for language, IBM Plex Mono for flags, paths, and measured data.
- Three domains with one vocabulary: Ejecutar, Modelos, Runtime.

## Colors

The palette is the Hyper Term world adapted to EzLLM: a pitch-black terminal canvas, cool One Dark grays for elevation, a single Hyper blue voltage for action, and weather colors taken from Hyper's syntax palette. Hyper's neon cursor green (`--color-caret`, #14fa50) appears only as the caret of the command editor.

### Primary
- **Action Blue** (#5a8cf0): the primary button, active tab underline, selected model rail, keyboard outline, and the "in use" state. It is the only color that means "this is the action".
- **Action Blue Hover** (#7aa7f7): hover for primary actions and brighter icon accents.
- **Action Blue Soft** (#a9c6fb): text and icons on tinted blue surfaces.
- **Action Ink** (#05070d): text on a filled blue button. It is deliberately darker than the app background.

### Neutral
- **Bench Black** (#000000): the app background and the deepest wells, including the command editor.
- **Panel Graphite** (#0c0d10): sections, the sidebar bottom zone, and cards.
- **Raised Graphite** (#16181d): chips, quiet buttons, row emphasis, and scrollbar thumbs.
- **Hover Graphite** (#22262d): hover surfaces and visible separators.
- **Border Steel** (#323741): the 1px border of cards, panels and menus (1.7:1 on a card).
- **Control Steel** (#5c6370): the 1px stroke of every interactive control: inputs, selects, search fields, the command editor, outline buttons and the Guardar group. 3.2:1 on a card, so a control is identifiable by its boundary (WCAG 1.4.11). Focus turns it Action Blue Hover.
- **Rule Line** (#22262d): row dividers and section rules.
- **Bright Chalk** (#f3f5f8): headings, primary values, and selected labels.
- **Body Chalk** (#d7dae0): body copy.
- **Secondary Ash** (#b9c0ca): secondary copy and quiet button labels.
- **Muted Ash** (#9da5b4): metadata, descriptions, and placeholders.

### Semantic
- **Healthy Green** (#89ca78): healthy server, verified SHA, and successful completion. Never brand.
- **Attention Amber** (#e5c07b): partial reads, missing companions, and cautionary states.
- **Fault Red** (#ef596f): failed actions, destructive controls, and blocking errors.
- **Info Cyan** (#2bbac5): neutral information banners only.
- **MTP Violet** (#d55fde): experimental or speculative model roles, currently MTP and draft blocks.

### Named Rules
**The One Voice Rule.** Action Blue is used on 10% of a screen or less. If everything is blue, nothing is the action.

**The Semantic Weather Rule.** Green means healthy, amber means attention, red means fault, cyan means information, violet means experimental. These colors never become decoration or branding.

**The Four Surfaces Rule.** Use Bench Black, Panel Graphite, Raised Graphite, and Hover Graphite. A fifth gray is not a new level; it is drift.

**The Measured Contrast Rule.** Every text token is AA (≥ 4.5:1) on every surface, the hover surface included: Bright Chalk 17.8, Body Chalk 13.9, Secondary Ash 10.6, Muted Ash 7.8 and Dim Ash (`ink-500`, #8b93a2) 6.3 on a card and 4.9 on hover. `ink-600` is for decorative separators only, never text. Rules sit at 1.3:1, card borders at 1.7:1 and control strokes at 3.2:1.

## Typography

**Display Font:** Plex Sans (with Segoe UI Variable, Segoe UI, system-ui, sans-serif)
**Body Font:** Plex Sans (same stack)
**Label/Mono Font:** Plex Mono (with Cascadia Code, Consolas, ui-monospace, monospace)

**Character:** IBM Plex gives the app an engineering-document tone without becoming cold. Sans carries the reading path; Mono appears only where a value must be copied, compared, or trusted.

### Hierarchy
- **Display** (600, 24px, 1.25): the contextual workspace heading, shared by all four views.
- **Title** (600, 17px, 1.35): section headings and the name of an object.
- **Body** (400, 14px, 1.55): descriptions, argument help, and model metadata.
- **Label** (500, 12px, 1.25): buttons, chips, field labels, and tab labels.
- **Meta** (500, 11px, 1.4): timestamps, byte counts, state words, and the small eyebrow above a value.
- **Micro** (600, 10px, 1.4): the tiny uppercase eyebrow and the status line inside the sidebar server well. Never body copy.
- **Mono** (400, 13px, 1.6): flags, paths, commands, hashes, and measured numerics. Never for sentences.

### Named Rules
**The Mono Means Measured Rule.** If a value can be copied into a terminal or compared byte-for-byte, it is Mono. If it is a sentence, it is Sans.

**The 14px Floor Rule.** Body copy never drops below 14px. Eleven-pixel text is reserved for metadata and labels, never for reading.

**The Tabular Rule.** Live numbers use tabular figures so a changing value never shifts its own column.

## Layout

The app is a two-column shell under a 48px in-app title bar. The title bar owns the brand, the workspace tabs and the window controls; it replaces the native Windows chrome. The server endpoint and its status live only in the sidebar — there is no second status readout in the title bar and no chat button inside the execution panel. The sidebar is fixed at 280px and contains the runtime summary, the measured machine, and the server status well. Model selection, the command preview and the presets live in the main workspace. The workspace is the only scrolling region, followed by a content column with a 1088px maximum and 24px horizontal padding. New installations default to `Documents/EzLLM/models` for GGUFs and `Documents/EzLLM/llama.cpp` for installed builds; `config.json` and logs live under `AppData/Roaming/EzLLM`. Existing configured paths are preserved.

The vertical rhythm is 4px, with 20px between major blocks and 8–12px inside a row. Sections use 16px of padding. The layout is designed to be legible at the 960 × 640 minimum: tabs and the server state stay on one line, the execution model row stacks into three lines, the model master-detail becomes a single column, and the category chips wrap instead of forcing a horizontal scroll.

Workspaces do not repeat their name: the active title-bar tab is the only label of the current view, and the content starts directly with its first section or toolbar. The active tab uses Hover Graphite, Bright Chalk 600 text and an blue icon; no tinted fill, lavender text or rail.

Three workspace layouts share the system:
- **Ejecutar:** the execution card (headed by the active configuration), then the argument library. The execution card holds the model, an editable command, the copy action, the primary run/stop action, the estimated memory, and the preset controls. There is no separate Arguments card; the argument library writes into the command editor.
- **Modelos:** a one-line description with the Hugging Face/Local switch, a search row whose sort group sits at the right, then a master-detail split. Enter submits the search; there is no submit button. It opens with 12 popular text-generation GGUF repositories already selected and their first detail loaded; searching replaces that preview. The split collapses to one column when its container is under 760px and hides the empty detail until a model is selected.
- **Runtime:** a one-line description with the channel switch, **Build local**, official repository, and refresh actions, then installed builds, then the release channel; the stable channel is compacted to one release and one recommended asset by default. A local folder build or fork appears as **Build local** in the installed card when it is the active `llama-server`.

## Elevation & Depth

This is a tonal system, not a shadow system. Depth comes from the four graphite surfaces, one-pixel borders, and an occasional accent rail. A section is a flat block, not a floating card. Shadows are reserved for things that genuinely float above the page: dialogs, popovers, and toasts. Focus is shown with a neutral border or the keyboard outline, never an inner colored halo.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.28)`): the small separation under a section or card.
- **Float** (`box-shadow: 0 16px 44px -12px rgb(0 0 0 / 0.7)`): dialogs, popovers, and the elevated card surface.
- **Inset edge** (`box-shadow: inset 0 1px 0 0 rgb(255 255 255 / 0.04)`): a hairline of light on the command editor and dark wells.
- **Keyboard focus** (`outline: 2px solid Action Blue Soft; outline-offset: 2px`): buttons and non-text controls when focused from the keyboard. Text fields use a neutral border change instead of an inner colored halo.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest. A shadow appears only when something is lifted, focused, or temporarily floating.

**The No Card Stack Rule.** If a section lives inside a section inside a card, one of those boxes is unnecessary. Flatten it into a row, a rule, or a header.

## Shapes

Corners are compact and consistent: 4px for tiny icon-only controls, 5px for inline tags and quantization labels, 7px for controls, 10px for sections and cards, 12px for dialogs and panels, and a full pill only for status chips and badges. Borders are 1px, never 2px, except for the 2px accent rail that marks the active section. Icon tiles are 28px squares with the same 7px control radius.

The form language is orthogonal and quiet. There are no overlapping shapes, no cut corners, and no decorative outlines. Emphasis comes from a border color, a filled surface, or a short accent rail.

## Components

### Buttons
- **Shape:** compact control radius (7px), 1px transparent border, 6px 11px padding, 13px label.
- **Primary:** Action Blue fill, Action Ink text, 600 weight. Used once per local task.
- **Hover / Focus:** primary lightens to Action Blue Hover; ghost surfaces lift from Raised Graphite to Hover Graphite; focus uses the global 2px blue outline with 2px offset.
- **Ghost / Quiet:** Raised Graphite with a Border Steel stroke for a secondary action; transparent with Secondary Ash text for tertiary actions. Destructive actions use Fault Red tint, never a solid red fill.

### Chips
- **Style:** pill shape, 1px border, 12px label, 2px 6px padding.
- **State:** neutral chips use Raised Graphite and Secondary Ash. Semantic chips use a 14% tint of their semantic color with a 45% border. The label always carries the meaning; color never acts alone.

### Sections / Cards
- **Corner Style:** 10px.
- **Background:** Panel Graphite.
- **Shadow Strategy:** Panel shadow at rest; Float only for dialogs and popovers.
- **Border:** 1px Border Steel.
- **Internal Padding:** 16px, with a 12px header rule and a 16px body inset.
- **Behavior:** sections are the default container for in-page groups; cards are for surfaces that leave the flow.

### Inputs / Fields
- **Style:** Hover Graphite background, 1px Border Steel, 7px radius, 6px 10px padding, Bright Chalk text. Selects use a 14px chevron and 28px right padding.
- **Focus:** the border moves from Border Steel to Muted Ash; no inner ring, glow, or purple frame. Keyboard users still get the global 2px outline on non-text controls.
- **Error / Disabled:** error uses Fault Red for border and message; disabled keeps the shape and drops to 50% opacity.

### Navigation
- **App title bar:** 48px tall, Bench Black tint over Panel Graphite, 1px bottom rule. The left 280px brand cell lines up with the sidebar and holds a 28px logo tile, the wordmark and, right after it, the app version (`v0.1.2`, read from the Tauri binary) in 12px muted Mono. Right after it come the workspace tabs — **Ejecutar**, **Modelos**, **Motor**, **Ajustes** — as 32px buttons (15px icon, 13px label); the first tab's edge lines up with the content column. The active tab uses Hover Graphite, Bright Chalk 600 text and an blue icon; hover uses Raised Graphite. `Ctrl+1…4` is the tab's tooltip. The rest of the bar is a drag region. The active configuration is not here: it belongs to Ejecutar, next to the model and command it saves. Window controls are 32px quiet buttons on the right; close uses a Fault Red hover.
- **Window controls:** custom in-app controls replace native Windows chrome. Minimize, maximize/restore, and close are icon-only 32px buttons with accessible labels. They are not styled as pills and never carry the accent.
- **Sidebar:** fixed 280px, darker than the workspace, with a slight blue radial at the top. It holds only status, in three blocks that share one anatomy, in this order: **Equipo**, **Motor** and **Servidor** (pinned to the bottom). Each block has a 13px semibold heading with an optional 12px muted datum on the right (the server state), then rows of 12px label → value. Live metrics (GPU, VRAM, CPU, RAM, Disco, in that order; Disco is the drive holding the models folder, used / total with `N GB libres · C:\` underneath, read from Windows every 20 s) add a 13px outline icon on the label, a Mono tabular value with the total in Muted Ash, one muted secondary line (adapter, `12 hilos · <CPU model>`, RAM speed) and a 4px track or a 20px sparkline. Tracks are neutral and turn amber/red only past a threshold. The adapter switch sits on the GPU block's secondary line and is an inline disclosure, never a floating menu: the full-width adapter name is the button, with a chevron at the right that turns 180° when open. Opening grows a list in place (grid rows 0fr → 1fr, 200ms) that pushes VRAM, CPU and RAM down: a Panel Graphite background with the control radius and no border, one 32px row per adapter separated by 1px horizontal rules, each with the name, its dedicated VRAM in muted Mono, and an blue check at the right on the selected one. Choosing closes it. Arrow keys move through the list and Escape closes it. With a single adapter it is plain text. The choice governs the VRAM block below it. The GPU percentage is the busiest engine across adapters. The **Servidor** block sits at the bottom on Panel Graphite; its heading carries a status dot plus a word (`Detenido`, `Cargando`, `En marcha`). Stopped, it shows one muted readiness line; running, it lists Dirección, API and Modelo, then a full-width quiet `Abrir chat` button once the server is healthy. The start/stop action lives in the execution panel so there is only one primary run control.
- **Settings:** Ajustes is a workspace of its own, not a dialog. It uses the shared `Section` component at the full content width, like every other view: **Carpetas** (Modelos, Binarios, Config) and **General** (Idioma, Token de GitHub). Rows copy Motor's installed-build rows: a 15px muted outline icon, a 13px medium title with one 12px muted line under it (the full Mono path, or the token state `Sin token` / `Guardado en este equipo`), and the actions on the right. Idioma has no second line, since the Select already shows the value. Controls on the right share one 20rem column: the language Select, and the token's Mono password field plus **Guardar**. The rate-limit explanation lives in an info icon's tooltip. No fixed label column, no helper sentences, no config.json footnote.

### Execution Panel
The execution panel is the first card in **Ejecutar**. The card's header is built like every section header and carries everything about the run: on the left the configuration name in 14px semibold with an up-down chevron (it opens the saved list), under a 12px muted `Configuración` label; the name sits in a 32px row bottom-aligned with the buttons so both share one axis; on the right a 32px bordered group with **Guardar** and its split-menu chevron, then the single primary action (**Iniciar modelo** as the filled primary, or **Instalar el motor** / **Elegir un modelo** when something is missing). While running, that slot becomes a second bordered group twinned with Guardar — `⟳ Reiniciar | ■ Detener`, same 32px height, Control Steel stroke, divider and 13px icons — with Detener in Fault Red text and a 14% red hover tint, never a solid red fill. A rule separates it from the model strip. There is no bottom action row: the card is header, models, command. The card itself holds only what runs — starting with the model strip: three equal cells divided by 1px vertical rules (**Principal**, **Multimodal**, **MTP**). Each cell holds the slot label in 11px Muted Ink, the file name as plain 12px text (truncated, accent on hover), an icon-only clear button when a file is set, and an icon-only folder button. The name and the folder button both open the GGUF file picker, which starts in the models folder; there is no intermediate list. There are no boxes, chevrons, and no separate Contexto or Capas en GPU controls: those flags are set in the command editor or the Arguments library, and the memory line reflects whatever `-c` and `-ngl` the command already carries. When a model is chosen and the command has no `-c`, the app writes the largest context that fits with margin in 75% of the VRAM — or of the available RAM when there is no GPU or `-ngl 0` — capped by the model's trained context; an existing `-c` is never overwritten, and removing it does not bring it back until another model is chosen. While a model is starting, an accent progress track and `Desplegando modelo…` label animate above the command. The command block shows the generated `llama-server` prefix in a 10px Mono line and an editable 12px Mono textarea for the flags. **Copiar** copies the fully composed command. The single primary **Iniciar modelo / Detener** action lives in the card header; `Memoria estimada` with its Mono value sits at the right end of the `Comando` label row. **Guardar** overwrites the active configuration without a prompt; its split chevron opens `Guardar como…` and `Importar archivo…`. The configuration name is plain text, not a button; **Cambiar** is the only way to open the saved list. While the current command differs from the saved configuration, **Guardar** keeps its label and its quiet surface but its icon and text turn accent blue (title `Cambios sin guardar`); once saved they return to grey. No border, fill, badge, or extra word marks the state. The saved count lives in the dialog title. If no configuration is active, Guardar creates one with the model name.

### Control Language
Settings choices use labeled `Select` controls, never banks of segmented pills: sort order and release channel are the same 36px trigger with a 12px label, a 1px border, and no hint underneath. Run settings are not controls of their own: context, layers, temperature, and sampling live in the command editor and the Arguments library, each with its verified llama.cpp default and a plain description. A value shows its real unit (tokens, layers, GB), never a decorative name. Navigation between workspaces is the title-bar tab row, not a sidebar list or underline tabs. A model slot is a strip cell whose name and folder button both open the file picker, which starts in the models folder; its empty state reads **Ninguno**. The primary action is the only filled blue button in the panel.

### Fit States
Compatibility is an icon, not a label. The same 14px check is green when the file stays at or below 75% of the GPU's VRAM, and amber between 75% and 95%; a red X marks a file above 95%, and a gray question marks unknown hardware. No visible word is printed; the accessible name and tooltip carry the explanation, the size, and the percentage. The hardware itself lives in the sidebar, so the model detail does not repeat a compatibility header. The memory line in Ejecutar shows only `Memoria estimada` and the value: no fit icon.

### Model Rows
Hugging Face files are flat rows separated by 1px rules, one row per file: fit icon, model name, the muted variant token that distinguishes files of the same repo (e.g. `Q4_K_M`), a star on the recommended file, a warning triangle on an incomplete shard set, the size in Mono, and a bordered icon-only download button. Downloading swaps the icon for a spinner with a thin progress rule under the row; queued files show a clock; finished files show a check plus a text **Usar**. The file name in full is the row's tooltip. The detail header is two lines: the repo name and one muted meta line, followed by icon-and-number stats (downloads, likes, max context) and an icon-only **Abrir en Hugging Face** link. Files are grouped by role (Archivos GGUF, Proyector multimodal, Draft / MTP); an icon-only filter hides files that do not fit. One search field plus one sort `Select` sit above the split; there is no second search button and no local-models tab, because local GGUF files are chosen inside Ejecutar.

### Argument Filter
The category filter is a list selector to the right of the search, built on the shadcn/radix `Select` and customized inside `src/components/ui-kit/select.tsx` rather than restyled per view. The trigger is a real button: 36px tall, 144px wide, 1px border, Hover Graphite surface, and an accent border while open; it carries a filter icon, the active category in 12px Sans, and a chevron. It shows no count. The panel matches the trigger width exactly (`--radix-select-trigger-width`, enforced inside `ui-kit/select.tsx` for every popper Select, so no view sets it and the panel never grows by its own padding), so the list reads as an extension of the button: 12px panel radius, 1px border, Float shadow, and a height capped at 18rem so it always opens below the trigger and scrolls instead of flipping over the title bar. Rows are 32px with 5px radii and the category name at 12px; hover paints Hover Graphite, and the checked row uses a translucent blue fill with Action Blue Soft text. Choosing a row clears the text query.

### Model Sort
The sort control is a shadcn `Select`, not a segmented group. It sits at the right of the model search, 140px wide, with a sort icon, the active label (Descargas, Likes, Recientes), and the standard chevron. The three options live in the panel; the trigger shows only the current one, so the header keeps one control row and no competing segments.

### Argument Rows
Argument rows are flat and never grow a second editor block below the row. The library lists configuration flags only: `--help`, `--usage`, `--version`, `--cache-list`, `--list-devices`, and the shell-completion flags are dropped from the catalog because they print something and exit instead of configuring the server; typing one in the command editor still works. Adding takes as few clicks as the flag allows: a flag with no value (`--jinja`, `--mlock`) is added in one click; a flag with enumerated values opens its choices and choosing one applies it immediately, with no confirm button; a free-text or numeric value becomes a borderless Mono field marked only by a 1px underline that turns accent while focused, with the value pre-selected, and Enter or the small check icon commits it. No filled button appears inside a row. Escape closes the editor from anywhere inside it. The context row shows "Valor: tokens" and opens empty with a `32768` placeholder; it never preloads `0` or `loaded from model`. At 1080px the search moves to a second header row and the category chips keep their own full-width row; at 620px the row stacks but the inline editor keeps the input and action together.

### Command Editor
The command editor is the signature control inside the execution card. It starts with a dim Mono line showing the generated `llama-server` invocation, then a near-black well with 12px Mono flags, a 112px minimum height with room for three lines, and a neutral focus border. A 12px footnote explains that the argument library writes into the same command; a Mono token count sits on the right. The estimated memory sits at the right of the `Comando` label row, never in a second card or a row below the editor.

### Inline Metadata
Status metadata in Runtime and the argument library is plain inline text with an optional 9–11px icon: `En uso`, `Estable`, `Nightly`, `Recomendado`, `Verificado`, `build equivalente`, and active flag values. These labels do not use a pill, fill, border, or uppercase styling. Color reinforces the word; the word carries the meaning. Pill-shaped `chip` elements remain only for object tags and compact counts outside these regions.

## Do's and Don'ts

### Do:
- **Do** keep the sidebar for hardware, runtime, server status, and the healthy API/chat endpoint; keep model selection, command, presets, and the run action in the main execution panel. Paths and language live in Ajustes.
- **Do** keep window chrome inside the app's visual system: title bar, tabs, and controls share the same graphite surfaces and accent rules.
- **Do** use Mono for flags, paths, hashes, filenames, and measured numbers; use tabular figures for live values.
- **Do** show a text label next to every semantic color.
- **Do** prefer a 1px rule and 8–12px of spacing over a new bordered container.
- **Do** preserve the 960 × 640 minimum layout and keep keyboard focus visible on every control.
- **Do** keep value editing in the row action slot; the input, quick values, and confirm action belong on the same line as the flag.
- **Do** let the execution card and the current command carry the accent; everything else stays graphite.

### Don't:
- **Don't** turn the app into a dashboard of stacked cards or nested panels.
- **Don't** use green, amber, red, cyan, or violet as brand accents.
- **Don't** use solid red for destructive buttons; use the tinted danger treatment.
- **Don't** add large corner radii, floating pills, or marketing-style hero sections.
- **Don't** wrap version status, active flags, or runtime metadata in pills; use the inline metadata treatment.
- **Don't** use segmented pill groups for settings or navigation; use a Select for a choice and the title-bar tabs for a workspace.
- **Don't** write a helper sentence under a control; if the explanation matters, put it in the tooltip of an icon.
- **Don't** label a value with a mood word (Precisa, Creativa, Equilibrada) when the number itself is the setting.
- **Don't** put a row icon inside a tinted square; use a plain 13–14px outline icon in the same ink as its row.
- **Don't** hide advanced llama.cpp arguments behind a different visual language; keep them in the same searchable row system.
- **Don't** use mono for prose or body copy, and don't use uppercase body text.
- **Don't** invent a fifth surface or a new gray when the four existing levels can do the job.

### Menus
The Guardar split menu sizes to its content (min 10rem), aligns with the right edge of its group 4px below it, and uses the same 32px rows, 5px row radius, 12px text and 12px panel radius as Select panels.
