# EzLlamaCpp — Estado del proyecto

**Última actualización:** 20 de octubre de 2026
**Estado:** COMPLETO Y VERIFICADO de extremo a extremo. Todo el flujo probado
con la app real en marcha: instalar → seleccionar modelo → arrancar → generar
→ parar.

---

## Qué es

Cliente de escritorio de llama.cpp, escrito en Rust (Tauri v2) con interfaz
React + TypeScript + Tailwind v4. Sustituye a `llama-admin` (la versión Python
que se perdió al borrarse su carpeta).

- **Repositorio oficial**: `ggml-org/llama.cpp`
- **Paquete**: `C:\Users\JDMoreu\Documents\ezllamacpp`

---

## Lo que YA FUNCIONA (verificado con ejecución real)

### Backend Rust — 22 tests unitarios en verde

| Módulo | Qué hace | Verificación |
|---|---|---|
| `gguf.rs` | Lector GGUF v2/v3: metadatos KV, índice de tensores, hash SHA-256 | Test: `general.file_type` (enum LlamaFileType) NO es `ggml_type` — file_type=15 es Q4_K_M, no Q8_K |
| `memory.rs` | Modelo de memoria de llama.cpp (KV densa + SWA, compute buffer) | **Error 0,0%** contra medidas reales: ctx 2048→72 MiB, 8192→168 MiB, 32768→552 MiB. También el efecto de `-np` (1/2/4/8) |
| `releases.rs` | API de GitHub, clasificación de assets por SO/backend/arch | Test en vivo contra la API real: recomienda `llama-b11767-bin-win-vulkan-x64.zip` |
| `hardware.rs` | VRAM real, tipo de GPU, CPU, RAM | Test con la salida REAL de `vulkaninfo --summary` de este equipo |
| `models.rs` | Catálogo de modelos, roles (modelo / mmproj / MTP), emparejamiento | Test: prefijo de companionship por nombre |
| `config.rs` | Config persistente + traducción a flags de llama-server | Test: `-fa` es enum con valor; `--mmap`/`--mlock` ya NO existen |
| `install.rs` | Descarga con progreso, verificación SHA-256, extracción ZIP/TAR.GZ | **Instalación real probada** (ver abajo) |
| `server.rs` | Ciclo de vida de llama-server, log a fichero, parada del árbol de procesos | Pendiente el test de ciclo de vida |

### Pruebas reales contra la red (no simuladas)

**Instalación completa** (`cargo test --test install_real -- --ignored`):
```
release b11767
  asset: llama-b11767-bin-win-vulkan-x64.zip  (35.0 MB)
  sha256 esperado: 1431b56fd1cb2faa661fa52e6c9fccbe1a199318705b45ae071e77ea3b9a056c
  instalado en: ...\ezllama-install-test\b11767
  llama-server: ...\b11767\llama-server.exe
  binarios (31)
  version: version: 0.7.0-dev (build 11767, commit 36140dbee)
  OK: instalado y ejecutable
```

El binario instalado detecta la GPU real:
```
Vulkan0: AMD Radeon RX 9070 (16304 MiB, 15419 MiB free)
Vulkan1: AMD Radeon(TM) Graphics (18121 MiB, 17214 MiB free)
```

### Frontend — compila y renderiza

- `npm run build` → sin errores de TypeScript (tsc estricto)
- Ventana real verificada por captura: navegación, Panel, releases, configuración
- Los flags se muestran en vivo: `-c 8192 -b 2048 -ub 512 --host 127.0.0.1 --port 9931`

---

## Ciclo completo verificado desde la UI (20 oct 2026)

Todo esto se hizo con la app real en marcha, no con simulaciones:

1. **Instalar** — botón «Instalar» sobre el paquete Vulkan de `b11776`.
   Resultado: 99 MB en `AppData\Roaming\EzLlamaCpp\llama.cpp\b11776`,
   `llama-server.exe` con `version: 0.7.0-dev (build 11776, commit ead9f3205)`.
2. **Escanear** — la carpeta de modelos muestra `stories260K.gguf` con
   arquitectura `llama`, 5 capas, ctx 2048, F32, 296.344 parámetros,
   4 cabezas KV, 48 tensores.
3. **Seleccionar** — queda como «Modelo principal» y se persiste en la config.
4. **Arrancar** — el sidebar pasa a «En marcha» con `http://127.0.0.1:9931`.
   - `GET /health` → `{"status":"ok"}`
   - `GET /v1/models` → lista el GGUF
   - `POST /v1/chat/completions` → genera texto real:
     `"Here?" Annabyed.\n"Okay"` (44 tokens de prompt, 20 generados)
5. **Parar** — 0 procesos `llama-server`, puerto 9931 libre.

### Tests de integración contra la red

| Test | Qué prueba |
|---|---|
| `cargo test --test live_api -- --ignored` | La clasificación de assets contra la API real de GitHub |
| `cargo test --test install_real -- --ignored` | Descarga + verificación SHA-256 + extracción + ejecución |
| `cargo test --test server_lifecycle -- --ignored` | Arranque en modo router, /health y /v1/models a 200, parada limpia |
| `cargo test --test model_run -- --ignored` | Arranque con GGUF, carga, generación real y parada |

### Modelos de prueba

- `stories260K.gguf` (1,1 MB) en `AppData\Roaming\EzLlamaCpp\models\`
  — descargado de `ggml-org/models` en Hugging Face. Es un modelo diminuto
  de stories: sirve para verificar el flujo, no para conversa útil.

## Funciones añadidas tras la primera entrega (20 oct 2026)

### Correcciones de bugs
| Bug | Causa | Corrección |
|---|---|---|
| El nombre del procesador salía con cuadritos | `RegQueryValueExA` devuelve ANSI; se leía el buffer entero (512 bytes) en vez de los `size` bytes válidos | Recorte exacto por `size` + decodificación UTF-8. Test con el caso real |
| Solo se detectaba la GPU dedicada | `llama-server --list-devices` solo lista los dispositivos que usa el backend | Se combina con `vulkaninfo` para recuperar las GPUs que falten |
| El panel solo pintaba la primera GPU | `hardware.gpu[0]` | Ahora se listan todas, con su VRAM y su tipo |

### Selección de GPU y reparto
- **Tarjeta gráfica**: se elige una o varias con checkboxes. El valor es la
  lista que espera `--device`: `Vulkan0`, `Vulkan0,Vulkan1`.
- **Repartir entre tarjetas**: activa `--tensor-split` y `--split-mode`
  (por capas o por filas). Solo se emiten si el reparto está activo.
- **Ejemplo verificado**:
  ```
  -c 8192 -b 2048 -ub 512 --device vulkan0,vulkan1 --tensor-split 1,1 --host 127.0.0.1 --port 9931 --temp 0.7 --top-p 0.9 --jinja -cnv
  ```
  El servidor arranca con esa configuración y `/health` responde `{"status":"ok"}`.

### Flags avanzados
- Campo **Argumentos adicionales** en Configurar: texto libre que se añade
  al FINAL del comando, así que pisa lo que genere la app.
- Admite comillas: `--jinja "-cnv"` se trata como un solo argumento.
-Va también en cada perfil.

### Perfiles de modelo
Sección nueva **Perfiles**:
- Guarda un modelo (principal + mmproj + MTP) con su configuración completa
  y sus flags.
- Se aplican de un clic: la configuración pasa a ser la activa y los modelos
  quedan seleccionados. No hay que reconfigurar en cada arranque.
- Se pueden duplicar (variantes sin perder el original) y eliminar.
- El perfil activo se marca y se recuerda entre sesiones.

### Instalación por versión
- Selector de canal **Nightly / Estables** en la sección llama.cpp.
- Las releases estables (`vX.Y.Z`) no traen binarios: la app resuelve su
  `nightly-tag.txt` y muestra el tag `b#####` equivalente.
- Se pueden instalar varias versiones a la vez (Vulkan, CUDA, ROCm…), cada
  una en su carpeta `llama.cpp/<tag>/`, y se puede borrar una concreta.

## Rediseño de la experiencia (unificación)

El usuario pidió que modelos + configuración + perfiles quedaran en un solo
lugar, sin tener que ir de sección en sección. Se creó `DeployView.tsx`
que unifica todo:

- **Modelos**: modelo principal + mmproj + MTP, cada uno con su botón
  «Buscar» que abre el explorador nativo. Debajo, carpeta de escaneo y
  catálogo con click-to-asign.
- **Configuración**: contexto, lotes, GPU (con checkboxes por tarjeta y
  reparto), flash attention, caché, hilos, red, alias, flags avanzados.
- **Memoria en vivo**: estimación a la derecha, actualizada al cambiar
  cualquier parámetro.
- **Comando**: se muestra el comando exacto que se ejecutará, con botón
  de copiar.
- **Presets**: selector de perfil en el encabezado + botón
  «Guardar como perfil». Un perfil guarda modelo + mmproj + MTP + toda la
  configuración + flags. Se aplican de un clic.

### Navegación final
- Panel
- Despliegue (unificado)
- llama.cpp (instalación de binarios)
- Ajustes

Se eliminaron las vistas separadas de Modelos, Configurar y Perfiles para
evitar la fragmentación.

## Experiencia unificada (Despliegue)

El usuario pidió que todo quede en un solo lugar: modelo base, mmproj, MTP,
configuración del servidor, flags avanzados y presets, sin saltar entre
secciones. Se consolidó todo en una única vista `Despliegue`:

- **Modelos**: slots para principal, mmproj y MTP, cada uno con su botón
  «Buscar» que abre el explorador nativo. Debajo, carpeta de escaneo y
  catálogo con click-to-asign.
- **Configuración**: contexto, lotes, GPU (checkboxes por tarjeta + reparto
  multi-GPU), flash attention, caché K/V, multi-GPU, args extra.
- **Avanzado** (colapsable): hilos, dirección, puerto, alias.
- **Memoria en vivo**: estimación a la derecha, actualizada al cambiar
  cualquier parámetro.
- **Comando**: se muestra el comando exacto que se ejecutará, con botón
  de copiar.
- **Presets**: selector de preset en el encabezado + botón «Guardar como
  preset». Un preset guarda modelo + mmproj + MTP + toda la configuración.
  Se aplican de un clic. La lista de presets guardados aparece abajo.

### Navegación final
- Panel
- llama.cpp (instalación de binarios)
- Despliegue (unificado)
- Ajustes

Se eliminaron las vistas separadas de Modelos, Configurar y Perfiles para
evitar la fragmentación.

### Correcciones técnicas
- El frontend ahora usa los comandos reales del backend (`list_deployments`,
  `save_deployment`, `apply_deployment`, `delete_deployment`) en lugar de
  los inexistentes `list_profiles`/`save_profile`.
- Se eliminó el interfaz `Deployment` duplicado en `types.ts`.

## Rediseño de la experiencia (2026-10-21)

### Lo que complained el usuario y como quedo
1. "Arrancar" x3 -> ahora solo en la barra lateral, disponible desde
   cualquier seccion.
2. Panel con "Puesta en marcha" + tips duplicados -> una sola fuente; los
   recursos son telemetria real.
3. Medidores estaticos -> backend de telemetria en Rust + sondeo a 1 Hz +
   sparklines.
4. Despliegue sin hilo visual -> secciones por dominio, sin numeracion.
5. "Carpeta de modelos" redundante -> boton dentro del bloque Modelo, con
   el catalogo debajo.
6. "Estable" vacio -> corregido (ver abajo).

### Correccion de la seccion llama.cpp (bug real, verificado)

`list_stable_releases` pedia `per_page=30` y filtra por estables. El feed de
GitHub lo saturan las nightlies (`b#####`, ~6 al dia) frente a las estables
(`vX.Y.Z`, ~1 cada varias semanas). Medido:

    per_page=12  -> 0 estables en la ventana
    per_page=30  -> 0 estables en la ventana
    pagina 1 de 100 -> v0.7.0
    pagina 3 de 100 -> v0.6.0

Por eso "Estable" no mostraba nada. Ahora pagina hasta reunir las pedidas
(10 paginas x 100 = 1000 releases) y resuelve el puntero `nightly-tag.txt`
para traer los assets REALES de la nightly equivalente: v0.7.0 -> b11669,
que tiene los 14 paquetes de Windows. Una version estable ya se instala desde
la propia pestana.

### Documentacion de llama.cpp verificada (2026-10-21)

- Las releases estables NO publican binarios: publican `nightly-tag.txt` con
  el tag `b#####` equivalente. Es el puente estable -> binario.
- Nombres reales de assets Windows:
  `llama-<TAG>-bin-win-vulkan-x64.zip`, `-cpu-`, `-cuda-12.4-`, `-cuda-13.4-`,
  `-rocm-10.0-`, `-sycl-`, `-openvino-2026.4.1-`.
- Los assets `cudart-*` son el runtime de CUDA, NO binarios de llama.cpp:
  nunca deben ganar la recomendacion (ya hay test de regresion).
- `--mmap`, `--mlock` y `--no-mmap` YA NO EXISTEN: se usa `--load-mode`.
- `--fit on|off` existe: ajusta los argumentos NO fijados por el usuario para
  que quepan en la VRAM. ABORTA si el usuario ya fijo `-ngl` o
  `--tensor-split` a mano. La app no debe activar `--fit` junto con esos.
- El README del server esta en `tools/server/README.md` (movido desde
  `examples/server/`).

### Sistema visual

El acento pasa de verde a azul-violeta (hue 232). Motivo: el verde estaba
colisionando con "sano"/"ok", que es un estado del sistema, no la marca. Un
color, un significado. Todos los pares texto/fondo pasan WCAG AA medido
(>= 4.5:1); el unico token que no llega es `ink-500`, reservado a 14px+ o a
elementos decorativos.

El minimo tipografico sube de 11px a 12px. Los 11px en el diseño anterior
leian "informal" porque comprimian el rango util de la escala.

Se eliminan `ConfigureView.tsx`, `ModelsView.tsx` y `DeviceField.tsx`: 1757
lineas que nadie importaba, con dos componentes duplicados.

## Correcciones de correctitud (2026-10-21, segunda ronda)

Todas verificadas contra el binario real, no contra el codigo.

### El bug que hacia que la app se viera plana

La regla global `* { border-color }` estaba FUERA de cualquier `@layer`. En
Tailwind v4 una regla sin capa gana a TODAS las capas, incluidas las
`utilities`. Medido en el CSS compilado:

    regla global  @ 36034
    .border-accent-500 @ 22050
    .border-danger-500 @ 22783
    .border-base-800   @ 22731

Es decir: los 53 `border-color` de color de la app eran codigo muerto. Los
estados seleccionados, los avisos de error y los acentos NO existian, y la
app se veia plana. La regla va ahora en `@layer base` (posicion 7514) y las
utilities la ganan.

### El ejemplo que rompia el arranque

El campo "Argumentos adicionales" sugeria `--jinja "-cnv"` como ejemplo.
`--jinja` es un interruptor (`--jinja` / `--no-jinja`), no admite valor:

    $ llama-server ... --jinja "-cnv"
    error: invalid argument: -cnv

El servidor moria al arrancar y el usuario no tenia idea de por que. Ahora:
- el backend valida los flags libres ANTES de arrancar y devuelve un error
  legible ("`--jinja` no lleva valor: escribe solo `--jinja`, o quitalo");
- la UI avisa al escribir, antes de arrancar;
- hay test de regresion.

### Otras correcciones

- Uso de CPU marcaba 100%: el calculo hacia underflow al restar el idle del
  kernel, que ya lo incluye.
- La GPU integrada aparecia como "Dedicada": `list_devices_via_llama` deja el
  tipo siempre en `discrete` y no se cruzaba con `vulkaninfo`.
- Aplicar un despliegue desde el Panel descartaba el `AppConfig` devuelto:
  aplicaba un preset y arrancaba otro modelo.
- La estimacion de memoria ignoraba `cacheTypeV` (el backend usaba el tipo de
  K para K y V).
- "VRAM en uso" mentia: es memoria reservada por el driver, no la que ocupa tu
  modelo. Ahora lo dice.
- El medidor usaba `width` (recalcula la geometria 60 veces por segundo);
  ahora usa `transform: scaleX()`.
- Las fuentes nunca se cargaban: se declaraba "Inter" sin `@font-face`. Ahora
  IBM Plex Sans y Plex Mono van embebidas, sin depender de la red.
- La carpeta de modelos se perdia al reiniciar (no se persistia).
- Se eliminan `ConfigureView.tsx`, `ModelsView.tsx` y `DeviceField.tsx`:
  1757 lineas que nadie importaba.

## Segunda ronda: lo que decia el critico visual

Una revision con medicion sobre pixeles (no sobre opiniones) devolvio una
lista de hallazgos. Los que eran bugs, corregidos con test. Los que eran
decisiones de diseño, corregidas con su justificacion.

### Bugs reales (con test)

- **`border-base-750` no existia.** `Card` usaba un token de color que no
  esta en `index.css` ni en el CSS compilado: el separador de la cabecera
  caia al color global y salia mas fuerte que el de `Section`, en la misma
  pantalla, entre cajas identicas. Ahora es `base-800`.
- **El sparkline no dibujaba nada.** Con `max={100}` (CPU) y `max={1}` (RAM),
  una fluctuacion del 13% al 20% ocupaba 2,6 px pegados al borde inferior del
  viewBox. Medido sobre la captura: cero pixeles violetas en la banda del
  grafico, solo la linea del fallback. Ahora la serie usa su propio rango con
  un 12% de margen; el numero absoluto va al lado, la forma muestra la
  variacion.
- **El nombre de la GPU salia en minusculas.** `device_types_from` guardaba
  el nombre en minusculas (para comparar) y ese mismo string se usaba para
  mostrar: "amd radeon rx 9070". Separados.
- **La GPU integrada se clasificaba como "Dedicada".** El nombre se
  comparaba limpio contra un indice sucio. Con test.
- **"AMD Radeon(TM) Graphics".** El driver escribe las marcas de fabrica
  como texto. Se limpian en el backend (`clean_gpu_name`), en los DOS caminos
  que reportan GPUs: el reporte de hardware y la telemetria.
- **El separador decimal no coincidia.** La app usa coma (`es-ES`) en un
  sitio y punto en otro: "0.16 GB" junto a "296.344 parametros".
- **`ink-500` fallaba WCAG AA.** 4,26:1 sobre `base-900`, y se usaba a 12px
  en frases completas (los datos tecnicos, los que menos pueden bajarse).
  Ahora `#808c98`: 5,33:1 sobre `base-900` y 4,53:1 sobre `base-800`.

### El sistema de diseño contradiciendose a si mismo

El CSS dice, textual: *"El verde queda LIBRE para 'sano'... Un color, un
significado."* Y el punto de "servidor sano" era violeta, igual que el
"Estado: Sano" del Panel. Ahora el verde es exclusivo del estado sano
(`pulse-dot-ok`, `StatusDot ok`, `Readout tone="ok"`).

Igual con la segunda regla: *"El violeta marca lo experimental (MTP)"* estaba
intercambiada con el proyector multimodal.

### Jerarquia

- El dato grande (24px) media MAS que el titulo de vista (24px): los dos
  compiten y no se distinguen. El dato pasa a 20px; el titulo se queda en 24px.
- La escala declarada no se usaba: 56 saltos a `text-xs` (12px) y
  `text-body` (13.5px) con CERO usos. La app entera era de 12px. Ahora la
  prosa va a 13,5px y los datos cortos a 12px.
- El mono se aplicaba a palabras ("Detenido", "Sano"): un disfraz. Ahora
  `Readout` tiene un prop `mono` explicito, como `KeyValue`.
- `Section` y `Card` eran visualmente identicos (mismo fondo, borde, radio y
  sombra), aunque el docstring de `Section` decia "no una caja mas". Ahora
  `card` es la superficie elevada (modal, popover) y `section` el bloque de
  la vista.
- La franja del despliegue era mas debil que las cajas que resumia, con su
  etiqueta en 11px. Ahora es una subcabecera: badge, fondo tintado, borde de
  acento y aire vertical.
- El estado activo de la barra lateral era un relleno de un gris mas claro:
  indistinguible de un hover. Ahora lleva riel de acento, icono de acento y
  peso tipografico.
- El canal Nightly/Estable: el activo era `base-800` sobre un track
  `base-850` (7 valores RGB de diferencia). Ahora es acento translucido.
- El hardware detectado era una nota al pie gris en la vista cuya unica
  funcion es elegir el binario para TU GPU. Ahora es una lista con icono,
  nombre, VRAM y tipo.
- Los medidores eran violeta: son datos, no marca. Ahora son neutros y solo
  toman color al cruzar un umbral.

### Consistencia

- 7 radios distintos para iconos que son hermanos. Ahora 3, con nombre:
  `rounded-control` (7px), `rounded-card` (10px), `rounded-panel` (12px).
- 4 alturas de boton. El boton pequeno ahora mantiene la altura del base.
- 5 valores de `space-y` en una sola vista. Ahora 2: 16px entre bloques, 8px
  dentro.
- La clase `.well` estaba definida y sin usar. Borrada.

## Prueba de regresión de la UI

El asset recomendado (Vulkan) quedaba al final de la lista: había que hacer
scroll para llegar al botón «Instalar». Ahora **el recomendado va primero**,
ordenado por backend habitual (Vulkan → CUDA → ROCm → SYCL → OpenVINO → CPU)
y luego por tamaño.

---

## Bugs encontrados y corregidos durante el desarrollo

| Bug | Causa | Corrección |
|---|---|---|
| Recomendaba `cudart-llama-...` en vez de los binarios | `recommend_asset` no filtraba `is_cudart` | Se excluyen los assets `cudart-*` (son el runtime de CUDA, no llama.cpp) |
| GPU marcada como «Integrada» | El parsing de `vulkaninfo --summary` partía por líneas en blanco; los bloques empiezan por `GPU<n>:` | Se parte por el regex `(?m)^GPU\d+:\s*$` |
| La app no guardaba nada | `config::load()` solo leía; la carpeta de datos no existía | `load()` crea la carpeta y persiste la config por defecto |
| El asset recomendado quedaba bajo el borde de la ventana | La lista se ordenaba por tamaño y el Vulkan caía en y=805, bajo el borde de 820 px | El recomendado va primero, con orden por backend habitual |
| `llama-server --version` no se leía | La versión se escribe por **stderr**, no por stdout | Se lee stdout + stderr |

---

## Trampas de llama.cpp (verificadas, no supuestas)

- Los binarios están en las tags `b#####` (nightly, `prerelease: true`).
  `/releases/latest` devuelve `v0.7.0`, que **no trae binarios**: publica solo
  `nightly-tag.txt` con el tag `b#####` equivalente. Ese es el puente
  estable → binario.
- Cada asset lleva `digest: "sha256:<hash>"` en la API de GitHub: la descarga
  se puede verificar sin fiarse del tamaño.
- `--mmap` / `--mlock` / `--no-mmap` **ya no existen**: se usa `--load-mode`.
- `-fa/--flash-attn` es enum `on|off|auto`, NO un flag sin valor.
- `-ngl` admite entero, `auto` (-1) o `all` (-2).
- `--device` es una lista separada por comas (`Vulkan0`).
- Sin token de GitHub: 60 peticiones/hora por IP. Con token: 5000.
- La VRAM real sale de `llama-server --list-devices`, NO de `vulkaninfo`.
- `Win32_VideoController.AdapterRAM` está saturado a 4 GB: no sirve.
- El volcado de metadatos de llama_model_loader son ~666 líneas: con
  `stdout=PIPE` sin leerlo el proceso se bloquea. La salida va a un fichero.
- El tensor `per_layer_token_embd` se carga con TENSOR_READ_LAZY: se queda en
  la CPU y NO ocupa VRAM.
- MTP real = metadato `<arch>.nextn_predict_layers` + tensores `nextn.*`.
  El nombre del fichero NO es prueba.
- mmproj real = metadato `general.type == "mmproj"`. Con él, `/v1/models`
  reporta `modalities: text+vision+audio+video`.

---

## Comandos

```bash
export PATH="/c/Users/JDMoreu/.cargo/bin:$PATH"

# Frontend
cd /c/Users/JDMoreu/Documents/ezllamacpp
npm run build

# Backend
cd src-tauri
cargo test --lib                    # 22 tests unitarios
cargo test --test live_api -- --ignored --nocapture    # contra la API real
cargo test --test install_real -- --ignored --nocapture # descarga e instala
cargo test --test server_lifecycle -- --ignored --nocapture

# App
npm run tauri dev
npm run tauri build
```

## Toolchain

- Rust 1.99.1 (stable-x86_64-pc-windows-msvc) — el linker MSVC viene de
  Visual Studio Build Tools 2022 (14.44), instalado con winget.
- Node 22.23.2 / npm 10.9.8
- Tauri 2.12.4, React 19.1, Tailwind 4

---

## Nota importante: `llama-admin` se perdió

La carpeta `C:\Users\JDMoreu\Documents\llama-admin` (versión Python) **fue
borrada a las 19:12 desde fuera de esta sesión**. Ninguno de los subagentes
ejecutó borrados (solo lecturas y escrituras en el scratch).

Se perdieron: el código Python, los 6 informes de investigación y dos modelos
GGUF (`llm-local/gemma-4-e4b` y `microturn/weights`). La carpeta
`llm-local` conserva `llama-b11574-bin-win-vulkan-x64` (los binarios) pero ya
no los modelos.

**EzLlamaCpp no depende de nada de eso**: toda la lógica (fórmula de memoria,
clasificación de assets, detección de hardware, flags) ya está portada a Rust.

## Instaladores (release)

```
src-tauri/target/release/bundle/msi/EzLlamaCpp_0.1.0_x64_en-US.msi   (4,12 MiB)
  sha256 75c14a2b2269bc1ed65d3f072a70eff9709c5d2a6d8722eaf858dc5fdf84dfdf

src-tauri/target/release/bundle/nsis/EzLlamaCpp_0.1.0_x64-setup.exe  (2,96 MiB)
  sha256 2323c6bd5a6c9b44da50de7afb7a4a387a42919dbd51af16a366ae9f9e6926aa
```

El binario release se ejecutó y se verificó con captura: detecta las dos GPUs,
el nombre del processor sale limpio y la sección Perfiles está presente.

Para reconstruir: `npm run tauri build` (tarda ~4 min).
