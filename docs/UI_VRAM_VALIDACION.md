# UI y VRAM: revisión de noviembre de 2026

## Interfaz

La paleta pasa a Hyper Term (negro de terminal, grises One Dark, azul de acción y semánticos de la sintaxis de Hyper); se conserva la estructura y el sistema de EzLLM. Los botones compartidos
ahora componen `ui-kit/button` (shadcn/ui + Radix); campos, selectores e idioma
usan las mismas primitivas. IBM Plex Sans y Mono siguen alojadas localmente.
Lucide mantiene un trazo común de 1,75 px.

- Texto de cuerpo de 14 px, controles de 13 px y metadatos de 12 px.
- Controles de 36 px; variante compacta de 32 px; navegación de 36 px.
- Cabecera contextual por vista, selección de archivos en dos niveles y
  adaptación a filas compactas en ventanas de hasta 1080 px.
- Radios compartidos de 5 / 7 / 10 / 12 px; los tokens shadcn referencian
  la paleta principal en vez de duplicar colores.
- Foco visible, flechas arriba/abajo en navegación vertical, etiquetas de
  controles y transiciones que respetan `prefers-reduced-motion`.
- La VRAM ocupa el primer lugar en la telemetría para ser visible en la
  ventana mínima de escritorio.

## Causa de la lectura incorrecta

La interfaz restaba `vramFreeMib` de `vramTotalMib`, obtenidos ejecutando
`llama-server --list-devices`. Un presupuesto de memoria disponible para un
backend/proceso no representa el consumo global de la GPU. En la inspección
inicial la UI mostraba 885 MB, mientras Windows reportaba alrededor de 4,8 GiB
de memoria dedicada ocupada en la Radeon RX 9070.

Además, se lanzaba ese proceso en cada sondeo aunque el frontend descartaba
las lecturas intermedias durante tres segundos.

## Corrección

`src-tauri/src/gpu_memory.rs` enumera adaptadores mediante DXGI. Lee capacidad
dedicada e identidad LUID y las asocia con `GPU Adapter Memory / Dedicated
Usage` de Windows mediante PDH. No usa la suma de memoria por proceso ni
mezcla GPU dedicada, integrada o RAM compartida.

El contrato `gpuMemory` es independiente del inventario de dispositivos que
llama.cpp expone. Un dato ausente es `null`. La UI muestra «Sin lectura
disponible», nunca cero ni una muestra anterior presentada como actual.
En equipos con varias GPU puede elegirse el adaptador. Las lecturas pequeñas
se expresan en MiB para evitar redondear, por ejemplo, 4,1 MiB a 0,00 GiB.
La memoria calculada del modelo se identifica como «Memoria estimada».

El sondeo de telemetría y de slots espera a terminar cada solicitud antes
de programar la siguiente. Se pausa cuando el documento está oculto y se
reanuda con una lectura nueva. Una consulta PDH fallida se cierra y reabre.

## Validación

- `npm run build`: TypeScript y compilación de producción correctos.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=2`:
  61 pruebas aprobadas; una prueba de hardware marcada como ignorada.
- Esa prueba de hardware se ejecutó explícitamente con
  `cargo test --manifest-path src-tauri/Cargo.toml --lib gpu_memory::tests::live_gpu_memory -- --ignored --nocapture`
  y pasó. Detectó la RX 9070 y Radeon Graphics con identificadores distintos.
- En una comparación cercana, el proveedor devolvió 5.399.908.352 bytes y
  CIM/Windows 5.402.480.640 bytes para la RX 9070: unos 5,03 GiB, con la
  variación esperable entre muestras sucesivas. No son lecturas simultáneas.
- Una solicitud completa desde la aplicación tardó 6 ms en esta máquina;
  es una observación puntual, no un benchmark ni una garantía.
- Revisión visual de Ejecutar, Modelos, Motor y Ajustes en el WebView real.
  Sin desbordamiento horizontal a 1280 × 820 y 960 × 640.
  VRAM visible sin desplazar el panel a 960 × 640. Movimiento reducido
  comprobado: transición del medidor limitada a 0,01 ms.
- Selector de GPU dedicada/integrada, navegación con flecha abajo y fuentes
  locales cargadas comprobados. Sin botones visibles sin nombre accesible
  en la pantalla de ejecución revisada.
- Fallo transitorio simulado en memoria del frontend: mostró «Sin lectura
  disponible» y recuperó la medición al restaurar la API, sin modificar la
  configuración guardada.

No se arrancó un modelo ni se descargaron modelos/builds durante esta revisión.
La nueva medición global está implementada para Windows/WDDM. En otros sistemas
se presenta como no disponible hasta incorporar un proveedor nativo. La build
conserva la advertencia de Vite sobre el bundle principal superior a 500 kB y
avisos Rust preexistentes ajenos a este cambio.

## Referencias

Capturas: [antes](qa/antes.png), [ejecución y VRAM](qa/ejecutar-vram.png),
[ventana mínima](qa/ejecutar-960.png) y [ajustes](qa/ajustes.png).

- [Microsoft: QueryVideoMemoryInfo informa presupuesto y uso del proceso](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/nf-dxgi1_4-idxgiadapter3-queryvideomemoryinfo).
- [Microsoft: memoria dedicada, compartida y medición global de GPU](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/).
- [shadcn/ui: Button](https://ui.shadcn.com/docs/components/radix/button),
  [Select](https://ui.shadcn.com/docs/components/radix/select) y
  [Field](https://ui.shadcn.com/docs/components/radix/field).
