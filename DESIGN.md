---
name: EzLLM
description: Local llama.cpp workbench for people who want the command line made legible.
colors:
  action-indigo: "#6b7cf3"
  action-indigo-hover: "#8a97f7"
  action-indigo-soft: "#a8b4fb"
  action-ink: "#08091c"
  surface-app: "#0b0d11"
  surface-panel: "#12151b"
  surface-raised: "#181c24"
  surface-hover: "#1f242e"
  rule-subtle: "#1f242e"
  border-strong: "#2b3240"
  text-strong: "#f4f7fa"
  text-body: "#dde3ec"
  text-secondary: "#bcc5d4"
  text-muted: "#8f9bad"
  status-ok: "#34d399"
  status-warn: "#fbbf24"
  status-danger: "#f87171"
  status-info: "#22d3ee"
  model-violet: "#d68bff"
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
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.01em"
  meta:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  micro:
    fontFamily: "Plex Sans, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
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
    backgroundColor: "{colors.action-indigo}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "6px 11px"
  button-primary-hover:
    backgroundColor: "{colors.action-indigo-hover}"
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

## Overview

**Creative North Star: "The Instrument Bench"**

EzLLM looks like a bench that is already in use, not a dashboard that wants to be admired. The interface is dark, precise, and unhurried: a fixed sidebar holds the workspace navigation, the machine and the server status, while the main area changes between four complete workspaces. Controls are compact, rows are flat, and the measured values are the only elements allowed to look technical.

The system gets its depth from four graphite surfaces and one-pixel rules, not from stacked floating cards. Indigo is the only action color. Green, amber, red, cyan, and violet carry meaning and are never used as decoration. The result should feel like professional local software: dense enough for someone who knows llama.cpp, legible enough for someone opening their first GGUF.

Motion is short and functional. Numbers change with tabular figures, focus is always visible, and every status has a word next to its color. The command line is not hidden; it is made readable and editable inside the execution card, with the argument library feeding it directly.

**Key Characteristics:**
- A fixed 264px instrument sidebar under a 48px in-app title bar with workspace tabs and window controls.
- Four graphite surfaces, one-pixel rules, and almost no ambient shadow.
- One indigo action accent; semantic colors remain semantic.
- Flat rows and sections instead of nested card stacks.
- IBM Plex Sans for language, IBM Plex Mono for flags, paths, and measured data.
- Three domains with one vocabulary: Ejecutar, Modelos, Runtime.

## Colors

The palette is graphite with a single cool indigo voltage and a small set of weather colors.

### Primary
- **Action Indigo** (#6b7cf3): the primary button, active tab underline, selected model rail, keyboard outline, and the "in use" state. It is the only color that means "this is the action".
- **Action Indigo Hover** (#8a97f7): hover for primary actions and brighter icon accents.
- **Action Indigo Soft** (#a8b4fb): text and icons on tinted indigo surfaces.
- **Action Ink** (#08091c): text on a filled indigo button. It is deliberately darker than the app background.

### Neutral
- **Bench Black** (#0b0d11): the app background and the deepest wells, including the command editor.
- **Panel Graphite** (#12151b): sections, the sidebar bottom zone, and cards.
- **Raised Graphite** (#181c24): chips, quiet buttons, row emphasis, and scrollbar thumbs.
- **Hover Graphite** (#1f242e): hover surfaces and visible separators.
- **Border Steel** (#2b3240): the standard 1px border and input stroke.
- **Rule Line** (#1f242e): row dividers and section rules.
- **Bright Chalk** (#f4f7fa): headings, primary values, and selected labels.
- **Body Chalk** (#dde3ec): body copy.
- **Secondary Ash** (#bcc5d4): secondary copy and quiet button labels.
- **Muted Ash** (#8f9bad): metadata, descriptions, and placeholders.

### Semantic
- **Healthy Green** (#34d399): healthy server, verified SHA, and successful completion. Never brand.
- **Attention Amber** (#fbbf24): partial reads, missing companions, and cautionary states.
- **Fault Red** (#f87171): failed actions, destructive controls, and blocking errors.
- **Info Cyan** (#22d3ee): neutral information banners only.
- **MTP Violet** (#d68bff): experimental or speculative model roles, currently MTP and draft blocks.

### Named Rules
**The One Voice Rule.** Action Indigo is used on 10% of a screen or less. If everything is indigo, nothing is the action.

**The Semantic Weather Rule.** Green means healthy, amber means attention, red means fault, cyan means information, violet means experimental. These colors never become decoration or branding.

**The Four Surfaces Rule.** Use Bench Black, Panel Graphite, Raised Graphite, and Hover Graphite. A fifth gray is not a new level; it is drift.

## Typography

**Display Font:** Plex Sans (with Segoe UI Variable, Segoe UI, system-ui, sans-serif)
**Body Font:** Plex Sans (same stack)
**Label/Mono Font:** Plex Mono (with Cascadia Code, Consolas, ui-monospace, monospace)

**Character:** IBM Plex gives the app an engineering-document tone without becoming cold. Sans carries the reading path; Mono appears only where a value must be copied, compared, or trusted.

### Hierarchy
- **Display** (600, 24px, 1.25): reserved for a future standalone view title; the current workspaces use the active tab as their title.
- **Title** (600, 17px, 1.35): section headings and the name of an object.
- **Body** (400, 13.5px, 1.55): descriptions, argument help, and model metadata.
- **Label** (500, 12px, 1.25): buttons, chips, field labels, and tab labels.
- **Meta** (500, 11px, 1.4): timestamps, byte counts, state words, and the small eyebrow above a value.
- **Micro** (600, 10px, 1.4): the tiny uppercase eyebrow and the status line inside the sidebar server well. Never body copy.
- **Mono** (400, 13px, 1.6): flags, paths, commands, hashes, and measured numerics. Never for sentences.

### Named Rules
**The Mono Means Measured Rule.** If a value can be copied into a terminal or compared byte-for-byte, it is Mono. If it is a sentence, it is Sans.

**The 13.5px Floor Rule.** Body copy never drops below 13.5px. Eleven-pixel text is reserved for metadata and labels, never for reading.

**The Tabular Rule.** Live numbers use tabular figures so a changing value never shifts its own column.

## Layout

The app is a two-column shell under a 48px in-app title bar. The title bar owns the brand, the active configuration group, and the window controls; it replaces the native Windows chrome. The workspace navigation, the server endpoint and its status live only in the sidebar — there is no second status readout in the title bar and no chat button inside the execution panel. The sidebar is fixed at 264px and contains the navigation, the runtime summary, the measured machine, and the server status well. Model selection, the command preview and the presets live in the main workspace. The workspace is the only scrolling region, followed by a content column with a 1088px maximum and 24px horizontal padding. New installations default to `Documents/EzLLM/models` for GGUFs and `Documents/EzLLM/llama.cpp` for installed builds; `config.json` and logs live under `AppData/Roaming/EzLLM`. Existing configured paths are preserved.

The vertical rhythm is 4px, with 20px between major blocks and 8–12px inside a row. Sections use 16px of padding. The layout is designed to be legible at the 960 × 640 minimum: tabs and the server state stay on one line, the execution model row stacks into three lines, the model master-detail becomes a single column, and the category chips wrap instead of forcing a horizontal scroll.

The active workspace tab carries the view name; none of the three views repeats it as a page heading.

Three workspace layouts share the system:
- **Ejecutar:** the execution card starts directly below the title bar, followed by the argument library. The execution card holds the model, an editable command, the copy action, the primary run/stop action, the estimated memory, and the preset controls. There is no separate Arguments card; the argument library writes into the command editor.
- **Modelos:** a one-line description with the Hugging Face/Local switch, a search row whose sort group sits at the right, then a master-detail split. Enter submits the search; there is no submit button. It opens with 12 popular text-generation GGUF repositories already selected and their first detail loaded; searching replaces that preview. The split collapses to one column when its container is under 760px and hides the empty detail until a model is selected.
- **Runtime:** a one-line description with the channel switch, **Build local**, official repository, and refresh actions, then installed builds, then the release channel; the stable channel is compacted to one release and one recommended asset by default. A local folder build or fork appears as **Build local** in the installed card when it is the active `llama-server`.

## Elevation & Depth

This is a tonal system, not a shadow system. Depth comes from the four graphite surfaces, one-pixel borders, and an occasional accent rail. A section is a flat block, not a floating card. Shadows are reserved for things that genuinely float above the page: dialogs, popovers, and toasts. Focus is shown with a neutral border or the keyboard outline, never an inner colored halo.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.28)`): the small separation under a section or card.
- **Float** (`box-shadow: 0 16px 44px -12px rgb(0 0 0 / 0.7)`): dialogs, popovers, and the elevated card surface.
- **Inset edge** (`box-shadow: inset 0 1px 0 0 rgb(255 255 255 / 0.04)`): a hairline of light on the command editor and dark wells.
- **Keyboard focus** (`outline: 2px solid Action Indigo Soft; outline-offset: 2px`): buttons and non-text controls when focused from the keyboard. Text fields use a neutral border change instead of an inner colored halo.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest. A shadow appears only when something is lifted, focused, or temporarily floating.

**The No Card Stack Rule.** If a section lives inside a section inside a card, one of those boxes is unnecessary. Flatten it into a row, a rule, or a header.

## Shapes

Corners are compact and consistent: 4px for tiny icon-only controls, 5px for inline tags and quantization labels, 7px for controls, 10px for sections and cards, 12px for dialogs and panels, and a full pill only for status chips and badges. Borders are 1px, never 2px, except for the 2px accent rail that marks the active section. Icon tiles are 28px squares with the same 7px control radius.

The form language is orthogonal and quiet. There are no overlapping shapes, no cut corners, and no decorative outlines. Emphasis comes from a border color, a filled surface, or a short accent rail.

## Components

### Buttons
- **Shape:** compact control radius (7px), 1px transparent border, 6px 11px padding, 13px label.
- **Primary:** Action Indigo fill, Action Ink text, 600 weight. Used once per local task.
- **Hover / Focus:** primary lightens to Action Indigo Hover; ghost surfaces lift from Raised Graphite to Hover Graphite; focus uses the global 2px indigo outline with 2px offset.
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
- **App title bar:** 48px tall, Bench Black tint over Panel Graphite, 1px bottom rule. The left 264px brand cell lines up with the sidebar and holds a 28px Zap tile plus the wordmark. Immediately after it, vertically centred in the bar, sits the active configuration as one bordered control group (28px tall, 1px `base-800` border, control radius, translucent `base-900`): the configuration name in 12px Sans, a 1px divider, **Guardar** with its icon, and a divider before the split-menu chevron. The name is the only way to open the saved list (accent on hover, tooltip `Cambiar configuración…`); the chevron's menu holds only `Guardar como…` and `Importar archivo…`. The empty middle is a drag region. Window controls are 32px quiet buttons on the right; close uses a Fault Red hover.
- **Window controls:** custom in-app controls replace native Windows chrome. Minimize, maximize/restore, and close are icon-only 32px buttons with accessible labels. They are not styled as pills and never carry the accent.
- **Sidebar:** fixed 264px, darker than the workspace, with a slight indigo radial at the top. It opens with the workspace navigation — **Ejecutar**, **Modelos**, **Motor**, **Ajustes** as a vertical list of 32px rows (13px icon, 12.5px label, tinted indigo row and accent text on the active one) — separated by a rule from the runtime block. Section labels are 11px metadata; values use Mono. It holds runtime, machine telemetry, and the server status well. When the server is healthy, the status well shows the local IP, the `/v1` API URL, and an `Abrir chat` action that opens the llama-server WebUI in the browser; the start/stop action lives in the execution panel so there is only one primary run control.
- **Settings:** Ajustes is a workspace of its own, not a dialog. It opens with a title and one muted line, then three sections on card surfaces: **Carpetas** (Models, Binaries, Config, each with `Abrir` and, where it applies, `Cambiar`), **Idioma** (the Español/English switch), and **GitHub** (the optional token, with the limit note under the field). A final rule-separated line names the `config.json` path. The content is capped at 48rem and left-aligned.

### Execution Panel
The execution panel is the first card in **Ejecutar**. The active configuration lives in the title bar, not above the card: name, **Cambiar** and **Guardar** with its split menu. The card itself holds only what runs — starting with the model strip: three equal cells divided by 1px vertical rules (**Principal**, **Multimodal**, **MTP**). Each cell holds the slot label in 11px Muted Ink, the file name as plain 12px text (truncated, accent on hover), an icon-only clear button when a file is set, and an icon-only folder button. The name and the folder button both open the GGUF file picker, which starts in the models folder; there is no intermediate list. There are no boxes, chevrons, and no separate Contexto or Capas en GPU controls: those flags are set in the command editor or the Arguments library, and the memory line reflects whatever `-c` and `-ngl` the command already carries. When a model is chosen and the command has no `-c`, the app writes the largest context that fits with margin in 75% of the VRAM — or of the available RAM when there is no GPU or `-ngl 0` — capped by the model's trained context; an existing `-c` is never overwritten, and removing it does not bring it back until another model is chosen. While a model is starting, an accent progress track and `Desplegando modelo…` label animate above the command. The command block shows the generated `llama-server` prefix in a 10px Mono line and an editable 12px Mono textarea for the flags. **Copiar** copies the fully composed command. The estimated memory sits in a rule-separated row with the fit icon and the single primary **Iniciar modelo / Detener** action. **Guardar** overwrites the active configuration without a prompt; its split chevron opens `Guardar como…` and `Importar archivo…`. The configuration name is plain text, not a button; **Cambiar** is the only way to open the saved list. While the current command differs from the saved configuration, **Guardar** keeps its label and its quiet surface but its icon and text turn accent indigo (title `Cambios sin guardar`); once saved they return to grey. No border, fill, badge, or extra word marks the state. The saved count lives in the dialog title. If no configuration is active, Guardar creates one with the model name.

### Control Language
Settings choices use labeled `Select` controls, never banks of segmented pills: sort order and release channel are the same 36px trigger with a 12px label, a 1px border, and no hint underneath. Run settings are not controls of their own: context, layers, temperature, and sampling live in the command editor and the Arguments library, each with its verified llama.cpp default and a plain description. A value shows its real unit (tokens, layers, GB), never a decorative name. Navigation between workspaces is the sidebar list, not underline tabs. A model slot is a strip cell whose name and folder button both open the file picker, which starts in the models folder; its empty state reads **Ninguno**. The primary action is the only filled indigo button in the panel.

### Fit States
Compatibility is an icon, not a label. The same 14px check is green when the file stays at or below 75% of the GPU's VRAM, and amber between 75% and 95%; a red X marks a file above 95%, and a gray question marks unknown hardware. No visible word is printed; the accessible name and tooltip carry the explanation, the size, and the percentage. The hardware itself lives in the sidebar, so the model detail does not repeat a compatibility header. The memory line in Ejecutar applies the same rule to what the current command requests, against VRAM — or against RAM when `-ngl 0` sends everything to the CPU.

### Model Rows
Hugging Face files are flat rows separated by 1px rules, one row per file: fit icon, model name, the muted variant token that distinguishes files of the same repo (e.g. `Q4_K_M`), a star on the recommended file, a warning triangle on an incomplete shard set, the size in Mono, and a bordered icon-only download button. Downloading swaps the icon for a spinner with a thin progress rule under the row; queued files show a clock; finished files show a check plus a text **Usar**. The file name in full is the row's tooltip. The detail header is two lines: the repo name and one muted meta line, followed by icon-and-number stats (downloads, likes, max context) and an icon-only **Abrir en Hugging Face** link. Files are grouped by role (Archivos GGUF, Proyector multimodal, Draft / MTP); an icon-only filter hides files that do not fit. One search field plus one sort `Select` sit above the split; there is no second search button and no local-models tab, because local GGUF files are chosen inside Ejecutar.

### Argument Filter
The category filter is a list selector to the right of the search, built on the shadcn/radix `Select` and customized inside `src/components/ui-kit/select.tsx` rather than restyled per view. The trigger is a real button: 36px tall, 144px wide, 1px border, Hover Graphite surface, and an accent border while open; it carries a filter icon, the active category in 12px Sans, and a chevron. It shows no count. The panel matches the trigger width exactly (`--radix-select-trigger-width`), so the list reads as an extension of the button: 12px panel radius, 1px border, Float shadow, and a height capped at 18rem so it always opens below the trigger and scrolls instead of flipping over the title bar. Rows are 32px with 5px radii and the category name at 12px; hover paints Hover Graphite, and the checked row uses a translucent indigo fill with Action Indigo Soft text. Choosing a row clears the text query.

### Model Sort
The sort control is a shadcn `Select`, not a segmented group. It sits at the right of the model search, 140px wide, with a sort icon, the active label (Descargas, Likes, Recientes), and the standard chevron. The three options live in the panel; the trigger shows only the current one, so the header keeps one control row and no competing segments.

### Argument Rows
Argument rows are flat and never grow a second editor block below the row. The library lists configuration flags only: `--help`, `--usage`, `--version`, `--cache-list`, `--list-devices`, and the shell-completion flags are dropped from the catalog because they print something and exit instead of configuring the server; typing one in the command editor still works. Adding takes as few clicks as the flag allows: a flag with no value (`--jinja`, `--mlock`) is added in one click; a flag with enumerated values opens its choices and choosing one applies it immediately, with no confirm button; a free-text or numeric value becomes a borderless Mono field marked only by a 1px underline that turns accent while focused, with the value pre-selected, and Enter or the small check icon commits it. No filled button appears inside a row. Escape closes the editor from anywhere inside it. The context row shows "Valor: tokens" and opens empty with a `32768` placeholder; it never preloads `0` or `loaded from model`. At 1080px the search moves to a second header row and the category chips keep their own full-width row; at 620px the row stacks but the inline editor keeps the input and action together.

### Command Editor
The command editor is the signature control inside the execution card. It starts with a dim Mono line showing the generated `llama-server` invocation, then a near-black well with 12px Mono flags, a 112px minimum height with room for three lines, and a neutral focus border. A 12px footnote explains that the argument library writes into the same command; a Mono token count sits on the right. The estimated memory is a rule-separated row below the editor, never a second card.

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
- **Don't** use segmented pill groups for settings or navigation; use a Select for a choice and the sidebar list for a workspace.
- **Don't** write a helper sentence under a control; if the explanation matters, put it in the tooltip of an icon.
- **Don't** label a value with a mood word (Precisa, Creativa, Equilibrada) when the number itself is the setting.
- **Don't** put a row icon inside a tinted square; use a plain 13–14px outline icon in the same ink as its row.
- **Don't** hide advanced llama.cpp arguments behind a different visual language; keep them in the same searchable row system.
- **Don't** use mono for prose or body copy, and don't use uppercase body text.
- **Don't** invent a fifth surface or a new gray when the four existing levels can do the job.
