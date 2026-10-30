export type Language = "es" | "en";

let current: Language = "es";

/**
 * El idioma efectivo. En desarrollo, Vite puede instanciar este módulo más de
 * una vez (HMR); `document.lang` es el estado compartido que evita que el
 * formato de números y la interfaz lean idiomas distintos.
 */
function activeLanguage(): Language {
  // El documento es el único estado compartido entre instancias del módulo.
  // Si aún no se fijó el idioma, el producto es español por defecto.
  if (typeof document !== "undefined") {
    return document.documentElement.lang === "en" ? "en" : "es";
  }
  return current;
}

/** Locale de formato: fechas, números y decimales siguen el idioma elegido. */
export function currentLocale(): string {
  return activeLanguage() === "en" ? "en-US" : "es-ES";
}

/** Separador decimal del idioma activo. */
export function decimalSeparator(): string {
  return activeLanguage() === "en" ? "." : ",";
}

/** Fija el idioma activo. `t()` y los formateadores lo leen de aquí. */
export function setLanguage(language: Language): void {
  current = language;
  if (typeof window !== "undefined") {
    (window as Window & { __ezllmLanguage?: string }).__ezllmLanguage = language;
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
}

const EN: Record<string, string> = {
  Ejecutar: "Run",
  Modelos: "Models",
  Motor: "Runtime",
  "Cada paquete se verifica con el SHA-256 de GitHub antes de instalarse.":
    "Each package is verified against GitHub's SHA-256 before installing.",
  "Instala y actualiza los binarios oficiales de":
    "Install and update the official binaries from",
  Runtime: "Runtime",
  Idioma: "Language",
  Aceleración: "Acceleration",
  SO: "OS",
  Equipo: "Machine",
  hilos: "threads",
  "En espera": "Idle",
  "En marcha": "Running",
  Rutas: "Paths",
  Binarios: "Binaries",
  Config: "Config",
  "Servidor local": "Local server",
  "Servidor detenido": "Server stopped",
  "Sin instalar": "Not installed",
  "Sin asignar": "Not set",
  "Medir velocidad": "Measure speed",
  "Elegir carpeta de modelos": "Choose models folder",
  "Elegir carpeta de llama.cpp": "Choose llama.cpp folder",
  "Abrir carpeta de configuración": "Open configuration folder",
  "Ruta de config.json": "config.json path",
  "Sin proceso activo": "No active process",
  "Listo para arrancar": "Ready to start",
  "IP local": "Local IP",
  API: "API",
  "Abrir chat": "Open chat",
  "Modelo desplegado": "Model deployed",
  "Cargando el modelo…": "Loading model…",
  "Modelo": "Model",
  "Principal": "Primary",
  "Multimodal": "Multimodal",
  "MTP": "MTP",
  "Elegir…": "Choose…",
  "Comando": "Command",
  "Copiar": "Copy",
  "Copiado": "Copied",
  "Detener": "Stop",
  "Iniciar modelo": "Start model",
  "Iniciando…": "Starting…",
  "Deteniendo…": "Stopping…",
  "Salida del modelo": "Model output",
  "Ocultar salida": "Hide output",
  "Usar este build": "Use this build",
  "Detén el servidor para cambiar de build":
    "Stop the server to switch builds",
  "Esperando salida del modelo…": "Waiting for model output…",
  "Sin líneas todavía.": "No output yet.",
  "Configuración": "Configuration",
  "Guardar": "Save",
  "Cargar": "Load",
  "Guardar configuración": "Save configuration",
  "Cargar configuración": "Load configuration",
  "Cargar configuración desde un archivo": "Load configuration from a file",
  "Cargar archivo…": "Load file…",
  "Guardar como": "Save as",
  "Guardar como…": "Save as…",
  "Exportar": "Export",
  "Exportar…": "Export…",
  "Importar": "Import",
  "Importar…": "Import…",
  "Cerrar": "Close",
  "Configuraciones": "Configurations",
  "Configuraciones guardadas": "Saved configurations",
  "Aplica una configuración al comando actual.": "Apply a configuration to the current command.",
  "Todavía no hay configuraciones guardadas.": "There are no saved configurations yet.",
  "Sin modelo": "No model",
  "Eliminar configuración": "Delete configuration",
  "Guardadas": "Saved",
  "Abrir archivo…": "Open file…",
  "No se pudo": "Could not",
  "Sin guardar": "Unsaved",
  "Cambios sin guardar": "Unsaved changes",
  "Cambiar configuración…": "Switch configuration…",
  "Desplegando modelo…": "Deploying model…",
  "Memoria estimada": "Estimated memory",
  "Edita los flags. La biblioteca los añade a este mismo comando.":
    "Edit the flags. The library writes them into this same command.",
  "tokens": "tokens",
  "Valor:": "Value:",
  "por defecto": "default",
  "Biblioteca de argumentos": "Argument library",
  "en uso": "in use",
  "Leyendo el catálogo del runtime…": "Reading the runtime catalog…",
  "Categorías de argumentos": "Argument categories",
  "flags del runtime instalado": "flags from the installed runtime",
  "argumentos esenciales · no se pudo leer el runtime":
    "essential arguments · runtime could not be read",
  "Buscar un argumento…": "Search an argument…",
  "Categoría": "Category",
  "Sugeridos": "Suggested",
  "Todas": "All",
  GPU: "GPU",
  Rendimiento: "Performance",
  Muestreo: "Sampling",
  Servidor: "Server",
  Especulativo: "Speculative",
  General: "General",
  Otros: "Other",
  "Añadir": "Add",
  "Quitar": "Remove",
  "Editar": "Edit",
  "Aplicar": "Apply",
  "Cancelar": "Cancel",
  "Mostrar": "Show",
  "más de": "more of",
  "No hay argumentos que coincidan con esa búsqueda.":
    "No arguments match this search.",
  "El catálogo completo necesita un runtime instalado. Mientras tanto se muestran las flags esenciales.":
    "The full catalog needs an installed runtime. Essential flags are shown meanwhile.",
  "Sugerencias": "Suggestions",
  "Explora GGUF en Hugging Face y elige un modelo para el servidor.":
    "Browse GGUF models on Hugging Face and choose one for the server.",
  "Hugging Face": "Hugging Face",
  "Local": "Local",
  "Busca un GGUF: Qwen3, Gemma 3, DeepSeek…":
    "Search a GGUF: Qwen3, Gemma 3, DeepSeek…",
  "Más descargados": "Most downloaded",
  "Mejor valorados": "Most liked",
  "Más recientes": "Newest",
  Recientes: "Newest",
  "Ordenar resultados": "Sort results",
  "Explora modelos": "Explore models",
  "Modelos locales": "Local models",
  "Ver los GGUF de tu equipo": "See the GGUFs on your machine",
  "Buscar": "Search",
  "Populares en Hugging Face": "Popular on Hugging Face",
  "Resultados para": "Results for",
  "Sin resultados": "No results",
  "No hay modelos GGUF para": "No GGUF models for",
  "Prueba otra búsqueda.": "Try another search.",
  "No hay populares ahora": "No popular models right now",
  "Escribe un modelo o empieza por una de estas búsquedas.":
    "Type a model or start with one of these searches.",
  "Detalle del modelo": "Model details",
  "Elige un resultado para ver arquitectura, contexto y las cuantizaciones disponibles antes de descargar.":
    "Choose a result to see architecture, context, and available quantizations before downloading.",
  "No hay archivos GGUF aquí": "No GGUF files here",
  "Elige una carpeta de modelos": "Choose a models folder",
  "Descarga uno desde Hugging Face o elige otra carpeta.": "Download one from Hugging Face or choose another folder.",
  "Buscar en Hugging Face": "Search on Hugging Face",
  "Descargado": "Downloaded",
  "capas": "layers",
  "Ver en Hugging Face": "View on Hugging Face",
  "Contexto": "Context",
  "Descargas": "Downloads",
  "Me gusta": "Likes",
  "Actualizado": "Updated",
  "Descargas GGUF": "GGUF downloads",
  "cuantización": "quantization",
  "cuantizaciones": "quantizations",
  "proyector": "projector",
  "proyectores": "projectors",
  "Proyector multimodal": "Multimodal projector",
  "Necesario para imágenes, audio o vídeo.": "Required for images, audio, or video.",
  "Draft / MTP": "Draft / MTP",
  "Opcional para decodificación especulativa.":
    "Optional for speculative decoding.",
  "Descargar": "Download",
  "Usar": "Use",
  "En este equipo": "On this device",
  "Carpeta de modelos": "Models folder",
  "Filtrar modelos instalados…": "Filter installed models…",
  "Actualizar": "Refresh",
  "Cambiar carpeta": "Change folder",
  "Instalar": "Install",
  "Nightly": "Nightly",
  "Estable": "Stable",
  "Build local": "Local build",
  "Repositorio": "Repository",
  "Buscando versiones instaladas…": "Looking for installed versions…",
  "Elige una versión de la lista y pulsa «Instalar». Se descarga el paquete de tu plataforma y se verifica su integridad.": "Choose a version from the list and press “Install”. Your platform package is downloaded and verified.",
  "Mostrar solo el recomendado": "Show only the recommended one",
  "Ver": "Show",
  "paquetes alternativos": "alternative packages",
  "Mostrar solo la última": "Show only the latest",
  "build disponible": "build available",
  "builds disponibles": "builds available",
  "Consultando": "Checking",
  "Consultando las releases oficiales…": "Checking official releases…",
  "Versiones instaladas": "Installed versions",
  "versiones disponibles": "versions available",
  "versión disponible": "version available",
  "En uso": "In use",
  "build equivalente": "equivalent build",
  "Recomendado": "Recommended",
  Mínima: "Lowest",
  Baja: "Low",
  Rápida: "Fast",
  Equilibrada: "Balanced",
  Alta: "High",
  "Muy alta": "Very high",
  "Casi exacta": "Near-exact",
  Exacta: "Exact",
  "Ocupa muy poco y pierde bastante calidad.": "Tiny download, noticeable quality loss.",
  "Ocupa poco y pierde algo de calidad.": "Small download, some quality loss.",
  "Rápida de generar, con más pérdida que Q4_K.": "Fast to generate, but lossier than Q4_K.",
  "Buen equilibrio entre tamaño y calidad.": "Good balance between size and quality.",
  "Alta calidad con poco más de tamaño.": "High quality for a little more size.",
  "Calidad muy alta; apenas se nota la compresión.": "Very high quality; compression is barely noticeable.",
  "Casi idéntica al modelo original.": "Nearly identical to the original model.",
  "El modelo original, sin comprimir.": "The original model, uncompressed.",
  "Los archivos se guardan en": "Files are saved in",
  "la carpeta de modelos": "the models folder",
  "Verificado": "Verified",
  "Ver paquetes alternativos": "Show alternative packages",
  "versiones anteriores": "previous versions",
  "Instalando": "Installing",
  "No se pudo contactar con GitHub": "Could not reach GitHub",
  "GitHub limita las peticiones anónimas. Espera unos minutos y vuelve a intentarlo.":
    "GitHub rate-limits anonymous requests. Wait a few minutes and try again.",
  "Elige una versión de la lista y pulsa «Instalar».": "Choose a version from the list and press “Install”.",
  "Consultando versiones…": "Checking versions…",
  "Todavía no hay ninguna versión instalada": "No versions installed yet",
  "No se pudo arrancar el servidor": "Could not start the server",
  "No se pudo parar el servidor": "Could not stop the server",
  "No se pudo guardar": "Could not save",
  "No se pudo abrir el archivo": "Could not open the file",
  "No se pudo exportar": "Could not export",
  "Configuración guardada": "Configuration saved",
  "Configuración importada": "Configuration imported",
  "Configuración exportada": "Configuration exported",
  "Preset": "Preset",
  "Sin motor": "No runtime",
  "Limpiar búsqueda": "Clear search",
  "Incompleto": "Incomplete",
  archivos: "files",
  "Descargando…": "Downloading…",
  "En cola": "Queued",
  Descargando: "Downloading",
  "Tu GPU": "Your GPU",
  "Recomendado para tu equipo": "Recommended for your machine",
  Proyector: "Projector",
  "Instalar el motor": "Install runtime",
  "Elegir un modelo": "Choose a model",
  Reiniciar: "Restart",
  Ocultar: "Hide",
  "Ver argumentos": "Show arguments",
  "Detener y usar": "Stop and use",
  "Detener el servidor y usar este build": "Stop the server and use this build",
  "Al cambiar de build se detendrá el servidor en marcha.":
    "Switching builds stops the running server.",
  "Filtra tus GGUF por nombre o cuantización…": "Filter your GGUFs by name or quantization…",
  "Todavía no hay GGUF en esta carpeta.": "There are no GGUFs in this folder yet.",
  "Ningún GGUF coincide con": "No GGUF matches",
  Canal: "Channel",
  Reintentar: "Retry",
  "Prueba con un nombre conocido": "Try a known name",
  Resultados: "Results",
  "Detén el servidor para eliminar este build": "Stop the server to delete this build",
  "Eliminar build": "Delete build",
  "Más opciones de guardado": "More save options",
  "Los cambios se aplican al reiniciar el servidor.":
    "Changes apply when the server restarts.",
  "Importar archivo…": "Import file…",
  "Saltar al contenido": "Skip to content",
  "Uso de CPU": "CPU usage",
  "Espacio de trabajo": "Workspace",
  "RAM en uso": "RAM in use",
  "VRAM en uso": "VRAM in use",
  "Volver a leer la carpeta de modelos": "Rescan the models folder",
  "Fuente de modelos": "Model source",
  "Configuración actual": "Current configuration",
  "Sin configuración": "No configuration",
  Cambiar: "Change",
  Ajustes: "Settings",
  Carpetas: "Folders",
  Abrir: "Open",
  "Abrir carpeta": "Open folder",
  "Cambia la interfaz y el formato de fechas y números.":
    "Changes the interface and the date and number formats.",
  "La configuración se guarda en": "Configuration is saved in",
  "Los modelos y los binarios viven en las carpetas de arriba.":
    "Models and binaries live in the folders above.",
  "Carpetas que la app lee y escribe. Nada se sube a la nube.":
    "Folders the app reads and writes. Nothing is uploaded to the cloud.",
  "Ver cola": "View queue",
  "Vaciar cola": "Clear queue",
  "Solo los que caben": "Only what fits",
  "Oculta las cuantizaciones que no caben en tu equipo":
    "Hides quantizations that do not fit your machine",
  "Ninguna cuantización cabe en tu equipo. Quita el filtro para ver todas.":
    "No quantization fits your machine. Clear the filter to see all.",
  "El archivo que se cargará. Multimodal y MTP son opcionales.":
    "The file that will be loaded. Multimodal and MTP are optional.",
  "Dónde se carga el modelo. Lo que no cabe en la GPU se queda en la RAM.":
    "Where the model is loaded. What does not fit in the GPU stays in RAM.",
  "Sin GPU dedicada": "No dedicated GPU",
  libres: "free",
  Hardware: "Hardware",
  Auto: "Auto",
  "GPU + CPU": "GPU + CPU",
  "Todo en RAM": "All in RAM",
  "Todo, puede fallar": "All, may fail",
  Mixto: "Mixed",
  "llama.cpp reparte las capas según la memoria disponible.":
    "llama.cpp distributes layers according to available memory.",
  "Todas las capas en la GPU. Si no cabe, el arranque puede fallar.":
    "All layers on the GPU. If it does not fit, startup may fail.",
  "La GPU hace una parte y la RAM el resto.":
    "The GPU does part of the work and RAM does the rest.",
  "Sin GPU. Más lento, pero funciona en cualquier equipo.":
    "No GPU. Slower, but works on any machine.",
  "llama.cpp reparte las capas según la memoria que encuentra. La opción segura si no quieres pensar.":
    "llama.cpp distributes layers according to the memory it finds. The safe option if you do not want to think about it.",
  "Todas las capas en la GPU. Si el modelo no cabe, el arranque puede fallar.":
    "All layers on the GPU. If the model does not fit, startup may fail.",
  "La GPU hará": "The GPU will run",
  de: "of",
  "capas; la RAM, el resto.": "layers; RAM takes the rest.",
  "La GPU hace una parte y la RAM el resto. Más lento que GPU, más rápido que CPU.":
    "The GPU does part of the work and RAM the rest. Slower than GPU, faster than CPU.",
  "Todo en RAM. Funciona en cualquier equipo; el más lento.":
    "All in RAM. Works on any machine; the slowest option.",
  "Por defecto": "Default",
  "El modelo decide. Empieza aquí si no quieres tocar nada.":
    "The model decides. Start here if you do not want to change anything.",
  Precisa: "Precise",
  "Estable y literal. Para código, datos y respuestas factuales.":
    "Stable and literal. For code, data and factual answers.",
  "Natural sin desvariar. La opción habitual.":
    "Natural without drifting. The usual choice.",
  Creativa: "Creative",
  "Más variada y libre; puede inventar o divagar.":
    "More varied and free; it may invent or ramble.",
  Personalizada: "Custom",
  "Temperatura personalizada.": "Custom temperature.",
  "No fija --temp: usa el valor por defecto del modelo.":
    "Does not set --temp: uses the model default.",
  "Cuánto texto puede recordar. Más contexto gasta más memoria.":
    "How much text it can remember. More context uses more memory.",
  "Exactamente lo que se ejecutará. Los argumentos de abajo se añaden aquí.":
    "Exactly what will run. The arguments below are appended here.",
  "Tu GPU está disponible.": "Your GPU is available.",
  "Usar Auto": "Use Auto",
  "No se pudieron cargar las versiones estables":
    "Could not load stable versions",
  "GitHub puede limitar las peticiones anónimas. Las builds nightly siguen disponibles mientras tanto.":
    "GitHub may rate-limit anonymous requests. Nightly builds are still available.",
  "Ver Nightly": "View Nightly",
  Cabe: "Fits",
  Justa: "Tight",
  "No cabe": "Won't fit",
  "Sin datos": "No data",
  Creatividad: "Creativity",
  "Cabe con margen en la VRAM de tu GPU.":
    "Fits with room in your GPU's VRAM.",
  "Cabe con margen en la RAM disponible.":
    "Fits with room in available RAM.",
  "Cabe, pero deja poco margen para la caché KV. Puede necesitar reparto.":
    "Fits, but leaves little room for the KV cache. May need splitting.",
  "Cabe, pero deja poco margen en la RAM.":
    "Fits, but leaves little room in RAM.",
  "No cabe en la VRAM; necesitará RAM/CPU o fallará al cargar.":
    "Doesn't fit in VRAM; it will need RAM/CPU or fail to load.",
  "No cabe en la RAM disponible ahora.":
    "Doesn't fit in available RAM now.",
  "No hay datos de VRAM o el tamaño es desconocido.":
    "No VRAM data or unknown size.",
  "No hay datos de RAM o el tamaño es desconocido.":
    "No RAM data or unknown size.",
  "Token de GitHub (opcional)": "GitHub token (optional)",
  "Guardar token": "Save token",
  "Motor consulta a GitHub las versiones de llama.cpp. Sin token, GitHub permite 60 peticiones por hora desde tu IP; con un token, 5000. No necesita permisos y se guarda solo en este equipo.":
    "Runtime asks GitHub for the llama.cpp releases. Without a token GitHub allows 60 requests per hour from your IP; with one, 5,000. It needs no scopes and is stored only on this machine.",
  "Las versiones instaladas siguen disponibles aunque la lista remota no cargue.":
    "Installed versions remain available even if the remote list cannot load.",
  Argumentos: "Arguments",
  "Elegir un GGUF…": "Choose a GGUF…",
  "Añadir proyector multimodal": "Add multimodal projector",
  "Opcional para imágenes, audio o vídeo": "Optional for images, audio or video",
  "Añadir MTP": "Add MTP",
  "Opcional para decodificación especulativa": "Optional for speculative decoding",
  "Buscar modelo": "Browse for model",
  "Buscar proyector": "Browse for projector",
  "Buscar MTP": "Browse for MTP",
  "Auto · recomendado": "Auto · recommended",
  "GPU · todas las capas": "GPU · all layers",
  "CPU · sin GPU": "CPU · no GPU",
  Compatibilidad: "Compatibility",
  "Reparte capas entre GPU y CPU.": "Splits layers between GPU and CPU.",
  "Todo en la GPU; puede fallar si no cabe.":
    "All on the GPU; may fail if it does not fit.",
  "capas en GPU; el resto en RAM.": "layers on GPU; the rest in RAM.",
  "GPU + CPU; el resto en RAM.": "GPU + CPU; the rest in RAM.",
  "Todo en RAM; el más lento.": "All in RAM; the slowest.",
  "Modelo listo en Ejecutar": "Model ready in Run",
  "Buscar modelos GGUF en Hugging Face": "Search GGUF models on Hugging Face",
  "Modelos de Hugging Face": "Hugging Face models",
  "Requiere acceso en Hugging Face": "Requires access on Hugging Face",
  "Actualizado {date}": "Updated {date}",
  "Elige un modelo para ver sus archivos GGUF.": "Choose a model to see its GGUF files.",
  "Descargar un modelo grande": "Download a large model",
  "El archivo ocupa {size} y puede tardar varios minutos. Se guardará en":
    "The file takes up {size} and may take several minutes. It will be saved in",
  "{size} de {vram} ({percent}%)": "{size} of {vram} ({percent}%)",
  "Ocultar las que no caben en tu VRAM": "Hide files that don't fit in your VRAM",
  "Contexto máximo": "Maximum context",
  "Abrir en Hugging Face": "Open on Hugging Face",
  "Repositorio con acceso restringido: acepta la licencia en Hugging Face. Esta versión descarga de forma anónima y no acepta tokens.":
    "Restricted repository: accept the license on Hugging Face. This version downloads anonymously and does not accept tokens.",
  "Archivos GGUF": "GGUF files",
  "Este repositorio no contiene archivos GGUF descargables.":
    "This repository has no downloadable GGUF files.",
  "Comprobando SHA-256": "Checking SHA-256",
  "Faltan archivos de esta cuantización": "Files are missing for this quantization",
  "Faltan archivos": "Files missing",
  "Buscar archivo…": "Choose file…",
  "CPU": "CPU",
  "Elegir modelo…": "Choose a model…",
  "GitHub": "GitHub",
  "Memoria": "Memory",
  "Ninguno": "None",
  "Uso de GPU": "GPU usage",
};

export function languageFrom(value: string | null | undefined): Language {
  return value === "en" ? "en" : "es";
}

export function getLanguage(): Language {
  return activeLanguage();
}

export function t(spanish: string, vars?: Record<string, string | number>): string {
  const template = activeLanguage() === "en" ? (EN[spanish] ?? spanish) : spanish;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
