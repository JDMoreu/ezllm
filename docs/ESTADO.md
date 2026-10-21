# EzLlamaCpp — Estado del proyecto

**Última actualización:** 20 de octubre de 2026
**Estado:** Backend Rust completo y verificado. Frontend React completo y compilando.
Prueba de ciclo de vida del servidor pendiente (en curso al pausar).

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

## Dónde se quedó (pausa)

**Estaba ejecutándose** el test de ciclo de vida del servidor
(`src-tauri/tests/server_lifecycle.rs` + `src/server_probe.rs`), recién escritos
y aún SIN compilar. Falta:

1. Compilar y ejecutar ese test.
2. Si arranca bien: instalarlo también desde la UI (falta pulsar el botón
   «Instalar» de Vulkan — el scroll en la ventana Tauri necesita
   `delivery_mode=foreground`).

---

## Bugs encontrados y corregidos durante el desarrollo

| Bug | Causa | Corrección |
|---|---|---|
| Recomendaba `cudart-llama-...` en vez de los binarios | `recommend_asset` no filtraba `is_cudart` | Se excluyen los assets `cudart-*` (son el runtime de CUDA, no llama.cpp) |
| GPU marcada como «Integrada» | El parsing de `vulkaninfo --summary` partía por líneas en blanco; los bloques empiezan por `GPU<n>:` | Se parte por el regex `(?m)^GPU\d+:\s*$` |
| La app no guardaba nada | `config::load()` solo leía; la carpeta de datos no existía | `load()` crea la carpeta y persiste la config por defecto |
| El botón «Instalar» no respondía | El botón de Vulkan quedaba en y=805, justo bajo el borde de la ventana de 820 px | Pendiente de verificar si es scroll o clic perdido |

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
