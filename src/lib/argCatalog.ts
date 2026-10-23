import type { ArgOption } from "../types";
import { getLanguage } from "./i18n";

export type ArgCategory =
  | "Sugeridos"
  | "GPU y offload"
  | "Contexto y KV"
  | "Rendimiento"
  | "Muestreo"
  | "Servidor"
  | "Modelo y carga"
  | "Especulativo"
  | "Multimodal"
  | "General"
  | "Otros";

export const ARG_CATEGORY_LABEL: Record<ArgCategory, string> = {
  Sugeridos: "Sugeridos",
  "GPU y offload": "GPU",
  "Contexto y KV": "Contexto",
  Rendimiento: "Rendimiento",
  Muestreo: "Muestreo",
  Servidor: "Servidor",
  "Modelo y carga": "Modelo",
  Especulativo: "Especulativo",
  Multimodal: "Multimodal",
  General: "General",
  Otros: "Otros",
};

export const CATEGORY_ORDER: ArgCategory[] = [
  "Sugeridos",
  "GPU y offload",
  "Contexto y KV",
  "Rendimiento",
  "Muestreo",
  "Servidor",
  "Modelo y carga",
  "Especulativo",
  "Multimodal",
  "General",
  "Otros",
];

interface Override {
  title: string;
  description: string;
  category?: ArgCategory;
}

const OVERRIDES: Record<string, Override> = {
  "ctx-size": {
    title: "Contexto",
    description:
      "Tokens de contexto que puede recordar el modelo. Más contexto gasta más KV cache y VRAM.",
    category: "Contexto y KV",
  },
  predict: {
    title: "Tokens a generar",
    description: "Máximo de tokens que produce cada respuesta. -1 significa sin límite.",
    category: "Muestreo",
  },
  "gpu-layers": {
    title: "Capas en GPU",
    description:
      "Número de capas del modelo que se cargan en VRAM. 99 intenta mover todo el modelo a la GPU.",
    category: "GPU y offload",
  },
  "flash-attn": {
    title: "Flash Attention",
    description:
      "Atención optimizada: acelera el prompt y reduce el tamaño de la KV cache cuando el backend la soporta.",
    category: "GPU y offload",
  },
  "cache-type-k": {
    title: "Tipo de KV cache K",
    description:
      "Precisión de la caché de claves. q8_0 ahorra VRAM con una pérdida pequeña frente a f16.",
    category: "Contexto y KV",
  },
  "cache-type-v": {
    title: "Tipo de KV cache V",
    description:
      "Precisión de la caché de valores. Cuantizarla ahorra VRAM; f16 es la opción conservadora.",
    category: "Contexto y KV",
  },
  parallel: {
    title: "Slots en paralelo",
    description:
      "Peticiones que el servidor puede atender a la vez. Cada slot reserva su propia KV cache.",
    category: "Rendimiento",
  },
  "batch-size": {
    title: "Lote lógico",
    description: "Máximo de tokens que se procesan juntos en un lote lógico.",
    category: "Rendimiento",
  },
  "ubatch-size": {
    title: "Micro-lote físico",
    description:
      "Bloque real de cómputo. Bajarlo reduce el pico de VRAM; subirlo suele acelerar el prompt.",
    category: "Rendimiento",
  },
  threads: {
    title: "Hilos de CPU",
    description: "Hilos usados durante la generación. -1 deja que llama.cpp decida.",
    category: "Rendimiento",
  },
  "threads-batch": {
    title: "Hilos de prompt",
    description: "Hilos usados al procesar el prompt y los lotes grandes.",
    category: "Rendimiento",
  },
  "cont-batching": {
    title: "Batching continuo",
    description:
      "Mezcla peticiones nuevas con las que ya están generando. Mejora el uso con varios slots.",
    category: "Rendimiento",
  },
  jinja: {
    title: "Plantillas Jinja",
    description:
      "Usa la plantilla de chat incluida en el modelo. Recomendado para modelos conversacionales.",
    category: "Servidor",
  },
  host: {
    title: "Host de escucha",
    description:
      "127.0.0.1 limita el servidor a este equipo; 0.0.0.0 lo expone a la red local.",
    category: "Servidor",
  },
  port: {
    title: "Puerto",
    description: "Puerto HTTP donde escucha llama-server.",
    category: "Servidor",
  },
  alias: {
    title: "Alias del modelo",
    description: "Nombre que verán los clientes en /v1/models en lugar de la ruta del archivo.",
    category: "Servidor",
  },
  "no-mmap": {
    title: "Sin mmap",
    description:
      "Carga el modelo en memoria en lugar de mapearlo. Puede evitar fallos con algunos drivers.",
    category: "Modelo y carga",
  },
  mlock: {
    title: "Bloquear en RAM",
    description: "Mantiene el modelo en RAM y evita que Windows lo mande al archivo de paginación.",
    category: "Modelo y carga",
  },
  mmproj: {
    title: "Proyector multimodal",
    description: "Archivo mmproj que añade visión, audio o vídeo al modelo principal.",
    category: "Multimodal",
  },
  model: {
    title: "Modelo",
    description: "Ruta del archivo GGUF que se carga como modelo principal.",
    category: "Modelo y carga",
  },
  "tensor-split": {
    title: "Reparto entre GPUs",
    description:
      "Proporción del modelo que se asigna a cada GPU, separada por comas. Ejemplo: 0.7,0.3.",
    category: "GPU y offload",
  },
  "split-mode": {
    title: "Modo de reparto",
    description: "Cómo se dividen capas y KV entre varias GPUs: none, layer, row o tensor.",
    category: "GPU y offload",
  },
  "main-gpu": {
    title: "GPU principal",
    description: "Índice de la GPU que actúa como principal cuando no se reparte el modelo.",
    category: "GPU y offload",
  },
  device: {
    title: "Dispositivos",
    description: "Lista de dispositivos de cómputo que llama.cpp puede usar para el offload.",
    category: "GPU y offload",
  },
  "cache-idle-slots": {
    title: "Cachear slots libres",
    description: "Conserva la KV cache de los slots inactivos para reutilizarla en la siguiente petición.",
    category: "Contexto y KV",
  },
  "kv-unified": {
    title: "KV unificada",
    description: "Comparte una única caché KV entre los slots en lugar de reservar una por slot.",
    category: "Contexto y KV",
  },
  "no-kv-offload": {
    title: "KV en CPU",
    description: "Mantiene la caché KV en RAM en lugar de moverla a la VRAM de la GPU.",
    category: "GPU y offload",
  },
  "reasoning-format": {
    title: "Formato de razonamiento",
    description:
      "Controla cómo se separan los tokens de pensamiento del texto final en modelos razonadores.",
    category: "Servidor",
  },
  "chat-template": {
    title: "Plantilla de chat",
    description: "Plantilla Jinja propia para convertir los mensajes en el prompt del modelo.",
    category: "Servidor",
  },
  "api-key": {
    title: "API key",
    description: "Clave que deben enviar los clientes para usar el servidor HTTP.",
    category: "Servidor",
  },
  "no-webui": {
    title: "Sin interfaz web",
    description: "Desactiva la interfaz web integrada de llama-server.",
    category: "Servidor",
  },
  slots: {
    title: "Endpoint de slots",
    description: "Activa el endpoint /slots para consultar y gestionar las sesiones.",
    category: "Servidor",
  },
  metrics: {
    title: "Métricas",
    description: "Activa el endpoint /metrics con métricas del servidor.",
    category: "Servidor",
  },
  "spec-draft-model": {
    title: "Modelo draft",
    description: "Modelo pequeño que propone tokens para decodificación especulativa.",
    category: "Especulativo",
  },
  "spec-type": {
    title: "Tipo de especulación",
    description: "Estrategia de decodificación especulativa: draft, MTP, ngram, etc.",
    category: "Especulativo",
  },
  embeddings: {
    title: "Embeddings",
    description: "Activa el endpoint de embeddings y carga el modelo en modo embedding.",
    category: "Servidor",
  },
  rerank: {
    title: "Reranking",
    description: "Activa el endpoint de reranking para reordenar documentos por relevancia.",
    category: "Servidor",
  },
};

export const SUGGESTED_KEYS = [
  "gpu-layers",
  "ctx-size",
  "flash-attn",
  "cache-type-k",
  "cache-type-v",
  "parallel",
  "ubatch-size",
  "threads",
  "cont-batching",
  "jinja",
  "host",
  "port",
  "no-mmap",
  "alias",
];

export function metadataFor(option: ArgOption): Override {
  if (getLanguage() === "en") {
    return {
      title: humanize(option.key),
      description: option.description,
      category: categoryFor(option),
    };
  }
  return (
    OVERRIDES[option.key] ?? {
      title: humanize(option.key),
      description: option.description,
      category: categoryFor(option),
    }
  );
}

export function categoryFor(option: ArgOption): ArgCategory {
  const explicit = OVERRIDES[option.key]?.category;
  if (explicit) return explicit;
  const key = option.key.toLowerCase();

  if (/(^spec-|-draft|^draft|mtp)/.test(key)) return "Especulativo";
  if (/(mmproj|image|video|audio|vision)/.test(key)) return "Multimodal";
  if (
    /(gpu|ngl|device|split|tensor|offload|flash|fit|repack|cpu-moe|n-cpu|main-gpu|direct-io)/.test(
      key,
    )
  ) {
    return "GPU y offload";
  }
  if (/(ctx|cache|kv|rope|yarn|swa|keep|checkpoint|slot-prompt|context)/.test(key)) {
    return "Contexto y KV";
  }
  if (
    /(temp|top-|min-p|typ-p|xtc|dry|repeat|penalty|seed|grammar|sampler|mirostat|predict|logit|ignore-eos)/.test(
      key,
    )
  ) {
    return "Muestreo";
  }
  if (
    /(thread|batch|parallel|poll|prio|cpu-mask|cpu-range|numa|cont-batching|affinity|poll)/.test(
      key,
    )
  ) {
    return "Rendimiento";
  }
  if (
    /(host|port|api-key|ssl|webui|cors|ui-|metrics|props|alias|log|chat|jinja|reasoning|tools|embedding|rerank|timeout|path|models-|slots|agent)/.test(
      key,
    )
  ) {
    return "Servidor";
  }
  if (/(model|lora|vocab|control-vector|mmap|mlock|load-mode|override-kv|hf-)/.test(key)) {
    return "Modelo y carga";
  }
  if (/(help|version|usage|completion)/.test(key)) return "General";
  return "Otros";
}

export function humanize(key: string): string {
  const text = key.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const FALLBACK_OPTIONS: ArgOption[] = [
  opt("ctx-size", ["-c", "--ctx-size"], "N", "0", "Contexto"),
  opt("gpu-layers", ["-ngl", "--gpu-layers", "--n-gpu-layers"], "N", null, "GPU"),
  opt("flash-attn", ["-fa", "--flash-attn"], "[on|off|auto]", "auto", "GPU"),
  opt("cache-type-k", ["-ctk", "--cache-type-k"], "TYPE", "f16", "KV"),
  opt("cache-type-v", ["-ctv", "--cache-type-v"], "TYPE", "f16", "KV"),
  opt("parallel", ["-np", "--parallel", "--n-parallel"], "N", "-1", "Slots"),
  opt("batch-size", ["-b", "--batch-size"], "N", "2048", "Lote"),
  opt("ubatch-size", ["-ub", "--ubatch-size"], "N", "512", "Micro-lote"),
  opt("threads", ["-t", "--threads"], "N", "-1", "Hilos"),
  opt("threads-batch", ["-tb", "--threads-batch"], "N", null, "Hilos de prompt"),
  opt("cont-batching", ["-cb", "--cont-batching", "--no-cont-batching"], null, null, "Batching"),
  opt("jinja", ["--jinja"], null, null, "Plantillas Jinja"),
  opt("host", ["--host"], "HOST", "127.0.0.1", "Host"),
  opt("port", ["--port"], "PORT", "8080", "Puerto"),
  opt("alias", ["-a", "--alias"], "STRING", null, "Alias"),
  opt("no-mmap", ["--no-mmap"], null, null, "Carga"),
  opt("mlock", ["--mlock"], null, null, "Carga"),
  opt("tensor-split", ["-ts", "--tensor-split"], "N0,N1,...", null, "Reparto"),
  opt("split-mode", ["-sm", "--split-mode"], "{none,layer,row,tensor}", "layer", "Reparto"),
  opt("device", ["-dev", "--device"], "<dev1,dev2,..>", null, "Dispositivos"),
  opt("mmproj", ["-mm", "--mmproj"], "FILE", null, "Multimodal"),
  opt("model", ["-m", "--model"], "FNAME", null, "Modelo"),
  opt("predict", ["-n", "--predict", "--n-predict"], "N", "-1", "Tokens"),
  opt("seed", ["-s", "--seed"], "SEED", "-1", "Semilla"),
  opt("temp", ["--temp", "--temperature"], "N", "0.80", "Temperatura"),
  opt("top-k", ["--top-k"], "N", "40", "Top K"),
  opt("top-p", ["--top-p"], "N", "0.95", "Top P"),
  opt("reasoning-format", ["--reasoning-format"], "FORMAT", "auto", "Razonamiento"),
  opt("api-key", ["--api-key"], "KEY", null, "API key"),
];

function opt(
  key: string,
  flags: string[],
  valueHint: string | null,
  defaultValue: string | null,
  description: string,
): ArgOption {
  const canonical =
    flags.find((flag) => flag.startsWith("--") && !flag.startsWith("--no-")) ??
    flags.find((flag) => flag.startsWith("--")) ??
    flags[0];
  return {
    key,
    canonical,
    flags,
    valueHint,
    defaultValue,
    section: "fallback",
    description,
  };
}
