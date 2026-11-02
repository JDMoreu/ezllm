# Iteración UI/UX — 29 de octubre de 2026

Objetivo: reducir la curva del primer uso y acelerar a quien ya sabe lo que
hace, sin cambiar el sistema visual. Base de la revisión:
`.impeccable/critique/2026-10-29T00-51-40Z__src-app-tsx.md` (24/40).

## Hecho y verificado en la app real

### Preparación y primer arranque
- Estado real de preparación (`sin motor` / `sin modelo` / `listo`) en la
  barra lateral y en la tira de tres pasos de Ejecutar.
- El CTA principal ya no arranca un servidor vacío: guía a instalar el motor,
  a elegir un modelo o a iniciar. El backend también rechaza un arranque sin
  modelo (`src-tauri/src/lib.rs:539`).
- Motor abre en canal Estable por defecto; Nightly queda como opción explícita.
- El pie de la barra lateral se reduce a Equipo, Ajustes y Servidor. Rutas e
  idioma se movieron a `SettingsDialog`.

### Descargas
- Estado global en `useDownloads`: la descarga y su cola sobreviven al cambio
  de pestaña y se ven en las tres vistas.
- Cancelación real en Rust (`src-tauri/src/hf.rs:26`) y comando
  `hf_cancel_download`.
- Confirmación antes de bajar más de 4 GB, ETA y cola secuencial.
- Los GGUF ya descargados se reconocen al reiniciar leyendo la carpeta local.

### Modelos y hardware
- Badge de encaje por cuantización («Cabe en tu GPU», «Cabe repartido con
  RAM», «Puede no caber»), recomendación para el equipo y filtro «Solo los
  que caben».
- Pestaña «En este equipo» con `scan_models`, búsqueda local y «Usar».
- La memoria estimada distingue GPU/CPU y compara con la VRAM; `-ngl auto` y
  `-ngl all` se interpretan como GPU. Se corrigió la estimación de capas
  negativas en `src-tauri/src/memory.rs`.
- La búsqueda de Hugging Face tiene botón, limpiar y orden visible de tres
  opciones.

### Jerarquía y expertos
- Ajustes rápidos humanos (Contexto, GPU, Temperatura) que escriben flags.
- Biblioteca de argumentos colapsada por defecto; el buscador sigue visible y
  la abre al teclear.
- Editor de argumentos más bajo y etiquetado como argumentos adicionales.
- Reiniciar con los flags actuales, Abrir chat en el panel, copiar salida y
  abrir la carpeta de logs.
- Atajos `Ctrl+1/2/3`, `Ctrl+K` (buscar modelo) y `Ctrl+Enter` (iniciar/parar).
- Arrastrar un `.gguf` a la ventana lo asigna al slot que corresponda.

### Accesibilidad y consistencia
- `Progress` expone su valor a lectores de pantalla.
- Las tres pestañas tienen panel válido (`aria-controls`) y conservan su
  estado al cambiar de vista.
- Se eliminaron los 9/10 px en datos accionables; el detector quedó limpio.
- Fechas, números y decimales siguen el idioma; se añadieron claves EN para
  las cadenas nuevas.

## Verificación

- `npm run build` — pasa.
- `cargo test --lib` — 55 tests, 0 fallos.
- `impeccable detect --json src` — 0 hallazgos.
- App real: arranque/parada con modelo, chat visible, log, Modelos HF y local,
  fit por VRAM, Ajustes y estado sin modelo.

## Segunda pasada — superficie profesional (29 oct 2026)

La primera pasada añadió función pero dejó demasiados recursos de "proyecto":
píldoras de color, grupos segmentados y cajas dentro de cajas. La segunda
pasada reduce el vocabulario visual y lo unifica.

- **Skills instaladas** con el CLI `skills`: `frontend-design` (anthropics) y
  `design-md` (Google Labs). Sus principios de restricción, jerarquía y
  consistencia guiaron esta pasada.
- **Ejecutar**: un modelo principal y dos opcionales plegados a botones
  "Añadir" con borde discontinuo. Hardware, Contexto y Creatividad son tres
  `Select` iguales, con etiqueta y una línea de ayuda. La acción primaria es
  el único botón índigo relleno del panel.
- **Estados de encaje**: el mismo icono de check en verde hasta el 75% de la
  VRAM, en ámbar entre el 75% y el 95%; X roja por encima del 95% e
  interrogación gris sin datos. Sin palabra visible; tooltip con tamaño y
  porcentaje. La cabecera de hardware no se repite en la ficha: ya está en la
  barra lateral.
- **Modelos**: tabs con subrayado para Hugging Face / En este equipo; el orden
  es un `Select`; los tags son texto separado por puntos; "Recomendado" es
  icono + texto de acento, no una píldora.
- **Motor**: el canal es un `Select`; las versiones estables muestran todas
  sus variantes compatibles; los estados "En uso", "Estable", "Nightly",
  "Recomendado" y "Verificado" son texto + icono; los iconos de fila son
  planos, sin cuadrados tintados.
- **Ajustes**: campo opcional de token de GitHub para subir el límite de la
  API. Si GitHub falla, las versiones instaladas siguen visibles y el error
  explica el límite sin volcar JSON.
- **DESIGN.md** recoge la regla: `Select` para elegir, tab con subrayado para
  navegar, punto + palabra para estado, borde discontinuo para un slot
  opcional y ningún grupo de píldoras segmentadas.

## Pendiente consciente

- Pausa/reanudación real de una descarga a medias: hoy se cancela y se vuelve
  a empezar; la cola y la cancelación sí están.
- Comprobación de espacio libre en disco antes de descargar.
- Extracción completa de todas las cadenas al inglés (las nuevas y los formatos
  sí; quedan textos heredados).
- Paleta de comandos completa y variantes de copia para cmd/PowerShell/bash.
- El estado «sin motor» no se pudo simular del todo en esta máquina porque el
  detector de hardware sigue encontrando el binario; sí se verificó «sin
  modelo».

## Tercera pasada — controles concretos y una sola búsqueda (29 oct 2026)

Sustituye la fila de tres selects de la segunda pasada. La queja era concreta:
controles que no encajan, texto de ayuda suelto, valores como «4k tokens» y
«Creatividad 1.0» que no dicen nada, y un Modelos con dos búsquedas, pestaña
local y etiquetas de cuantización.

### Ejecutar
- **Modelo**: una sola tira dividida en tres celdas por reglas verticales
  (Principal, Multimodal, MTP), como estaba en el repositorio. Cada celda lleva
  la etiqueta, el nombre como texto (se recorta, acento al pasar) y dos iconos:
  quitar y buscar archivo. El nombre y el icono de carpeta abren el explorador
  de archivos, que arranca en la carpeta de modelos; no hay lista intermedia.
- **Fuera, a petición**: la fila de Contexto y Capas en GPU. El contexto y las
  capas se escriben en el editor de argumentos o en la biblioteca, y la memoria
  estimada respeta el `-c` y el `-ngl` que ya lleve el comando.
- **Contexto automático al cargar**: al elegir un modelo sin `-c`, la app
  escribe el mayor contexto que cabe con margen en el 75 % de la VRAM (o de la
  RAM disponible si no hay GPU o si `-ngl 0`), con el techo del contexto de
  entrenamiento del GGUF. Si ya hay `-c`, no lo toca; si se borra, no vuelve
  hasta elegir otro modelo. Se ve en el propio comando, no en un control aparte.
- **Editor de comandos** más alto (112 px, tres líneas) para que no se vea
  delgado.
- **Barra de configuración**: sale de la tarjeta y sube al **header de la
  ventana**: nombre, **Cambiar** y **Guardar** con su menú quedan siempre
  visibles, también en Modelos y Motor, sin caja propia ni diálogos dentro del
  panel. La lógica y los diálogos viven ahora en `ConfigBar.tsx`. Cuando el
  comando difiere de lo guardado, **Guardar** mantiene texto y superficie, pero
  su icono y su texto pasan a acento índigo.
- **Navegación**: Ejecutar, Modelos, Motor y Ajustes dejan de ser pestañas del
  título y pasan a una lista vertical en el lateral, con fila tintada y texto de
  acento en la activa. El título queda para la marca, la configuración y los
  controles de ventana; los atajos Ctrl+1…4 y la navegación con flechas se
  mantienen.
- **Ajustes como sección**: el botón del pie del lateral desaparece. Ajustes es
  ahora un espacio propio con las mismas piezas del diálogo (Carpetas, Idioma,
  token de GitHub) y el tamaño de primera lectura de una vista, no de un modal.
- **Un solo sitio para el servidor**: el estado («Servidor detenido» o la IP y el
  puerto) deja la barra de título y queda solo en el pozo del lateral, junto a
  **Abrir chat**. El botón de chat sale del panel de Ejecutar para no repetir la
  misma acción en dos sitios.
- **Grupo del header**: el nombre, **Guardar** y el menú quedan dentro de un
  solo control con borde, radio y separadores de 1px, centrado verticalmente en
  la barra. El **nombre** abre la lista de configuraciones (acento al pasar,
  tooltip «Cambiar configuración…»); el menú del chevron queda solo con
  `Guardar como…` e `Importar archivo…`. El acento de Guardar sigue marcando
  cambios sin guardar.
- **Uso de GPU**: la sección Equipo muestra el porcentaje y la serie del motor
  gráfico más ocupado, con la misma gráfica que la CPU. Sale de los contadores
  «GPU Engine» de Windows (la fuente del Administrador de tareas); si el sistema
  no los expone, muestra «—».
- **Fuera**: el selector de Hardware, el control de Creatividad y todas las
  frases de ayuda bajo los controles. La temperatura vive en Argumentos, con su
  valor real por defecto (0,80) y una descripción en lenguaje llano; lo mismo
  para Top K, Top P y Min P. No se inventaron ajustes por modelo: los valores
  por defecto de llama.cpp b11829 son la referencia, y la app no promete
  configuraciones de Hugging Face que no puede verificar.
- **Argumentos de configuración**: la biblioteca ya no lista `--help`,
  `--usage`, `--version`, `--cache-list`, `--list-devices` ni los guiones de
  completado, porque imprimen algo y salen. El catálogo bajó de 260 a 255
  entradas. Si se escriben a mano en el comando siguen funcionando.
- **Añadir argumentos**: las flags sin valor (`--jinja`, `--mlock`, …) se añaden
  con un clic; antes el botón no hacía nada porque la rama solo contemplaba
  flags con valor entre corchetes. En las flags con valores enumerados, elegir
  un valor lo aplica y cierra el editor; ya no hay que pulsar «Añadir» dos veces
  ni distinguir dos botones con el mismo nombre. En las de texto o número, Enter
  o el check confirman, y el valor actual queda seleccionado al enfocar.
  Escape cierra el editor desde cualquier parte. El campo es una línea
  subrayada, no una caja, y el anillo de foco global se anula para él.
- **Valores por defecto**: el parser metía la explicación dentro del valor
  (`-1, -1 = auto`, `0, 0 = disabled`, `0 - same as --n-ubatch`) y el editor
  precargaba eso tal cual. Ahora se guarda solo el valor, y la UI no muestra ni
  precarga los que son prosa (`same as --threads`, `*`, `--otra-flag`). La
  explicación de `-1` se conserva en la descripción de Slots en paralelo.
- La línea de memoria usa el mismo icono de encaje que Modelos y muestra el
  porcentaje y la capacidad en el tooltip.

### Modelos
- **Una sola búsqueda**: el campo (Enter busca, Esc limpia, X borra) y un
  `Select` de orden. Fuera el botón «Buscar» y la pestaña «En este equipo»;
  los GGUF locales se eligen en Ejecutar.
- **Cabecera de la ficha** en dos líneas: nombre del repo, autor y fecha, y
  una fila de iconos con descargas, me gusta y contexto máximo. El enlace a
  Hugging Face es un icono.
- **Filas de archivo**: icono de encaje, nombre del modelo, el trozo que
  distingue dos archivos del mismo repo (`Q4_K_M`, `UD-Q4_K_XL`) en Mono
  apagado, estrella en el recomendado, aviso si faltan archivos, tamaño y un
  botón de descarga solo con borde e icono. Descargando: spinner y una barra
  fina bajo la fila. Descargado: check y **Usar**.
- Sin píldoras de cuantización, sin «Equilibrada / Casi exacto», sin fechas por
  fila y sin línea de hardware en la ficha.

### Backend y datos
- `-ngl 0` ya no se estima como «todo en GPU»: no pide VRAM (pesos, KV ni
  compute). Prueba nueva `cpu_request_asks_no_vram`.
- `MemoryEstimate` expone `nLayers` y `ctxTrain`. El segundo permite calcular
  el contexto real sin `-c` (llama.cpp usa el de entrenamiento y lo reduce si
  no cabe) en vez de suponer 4096 o la VRAM entera.
- Se corrigió una afirmación anterior: sin `-ngl` el servidor **no** va a CPU;
  el valor por defecto de llama.cpp es auto con `--fit on`. La app ya lo
  muestra como **Automático**.

### Verificación en la app real
- `Spark-X2.5-4B-Q8_0`: Automático, 36/36 capas, contexto recomendado 131072
  con 4,61 GB de KV, memoria 8,75 GB e icono verde (16 GB de VRAM).
- `Ornith-1.5-9B-GGUF`: verdes hasta 9,1 GB, X roja en BF16 17,1 GB, estrella
  en Q4_K_M; `Qwen3.8-27B`: ámbar en IQ4_XS 14,3 GB (89 %) y rojo por encima.
- Búsqueda «gemma»: 39 resultados, X para limpiar y vuelta a populares.
- `npm run build` y `npx tsc --noEmit` pasan; `cargo test --lib` 56/56.
- Límite de la verificación: el menú de los slots no se pudo abrir con un clic
  sintético (Radix abre en `pointerdown`); usa los mismos primitivos que el
  menú de guardado, que ya estaba en uso.

### Decisión discutida
El nombre de la fila era idéntico en todos los archivos de un repo, así que no
se distinguían entre sí. Se añadió el trozo variable del nombre en Mono
apagado; si se prefiere cero etiquetas, basta con quitar `variantTag` en
`src/views/ModelsView.tsx`. Recomendar temperatura/top-p/top-k por modelo
exigiría leer `generation_config.json` de cada repo; hoy la app no descarga
ese archivo, así que se optó por lo simple y verificable.

## Nota

El `config.json` del usuario se respaldó en `.shots/config-backup.json` y se
restauró al terminar. La app de desarrollo quedó detenida; para abrirla:
`npm run tauri dev`.
