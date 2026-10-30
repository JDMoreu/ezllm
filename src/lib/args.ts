import type { ServerConfig } from "../types";

export interface ArgsToken {
  value: string;
  quoted: boolean;
}

export interface ArgsView {
  host: string;
  port: number;
  ctxSize: number | null;
  parallel: number | null;
  ubatch: number | null;
  cacheK: string;
  cacheV: string;
  gpuLayers: number | null;
  flashAttn: string | null;
  flagCount: number;
}

/**
 * Distingue un valor suelto de la siguiente flag. Las flags opcionales pueden
 * aparecer sin valor, así que nunca deben "robar" el token `--siguiente`.
 * Se permiten negativos numéricos (`--temp -0.5`) y el path `-`.
 */
export function looksLikeValue(token: string | undefined): token is string {
  if (token === undefined || token === "") return false;
  if (token === "-") return true;
  return !token.startsWith("-") || /^-(?:\d|\.\d)/.test(token);
}

const BOOLEAN_FLAGS = new Set([
  "--jinja",
  "--no-jinja",
  "--cont-batching",
  "--no-cont-batching",
  "--context-shift",
  "--no-context-shift",
  "--cache-idle-slots",
  "--no-cache-idle-slots",
  "--slots",
  "--no-slots",
  "--metrics",
  "--no-metrics",
  "--props",
  "--no-props",
  "--no-mmap",
  "--mlock",
  "--no-warmup",
  "--no-op-offload",
  "--no-kv-offload",
  "--embedding",
  "--embeddings",
  "--rerank",
  "--no-webui",
  "--webui",
]);

export function tokenizeArgs(input: string): ArgsToken[] {
  const out: ArgsToken[] = [];
  let current = "";
  let quote: string | null = null;
  let hasContent = false;
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && i + 1 < input.length) {
        const next = input[i + 1];
        if (next === quote) {
          current += next;
          i++;
        } else {
          current += char;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      quoted = true;
    } else if (/\s/.test(char)) {
      if (hasContent) {
        out.push({ value: current, quoted });
        current = "";
        hasContent = false;
        quoted = false;
      }
    } else {
      current += char;
      hasContent = true;
    }
  }

  if (hasContent) out.push({ value: current, quoted });
  return out;
}

export function quoteToken(value: string): string {
  if (value === "") return '""';
  if (!/[\s"]/.test(value)) return value;
  // Las barras de Windows son literales; solo hay que escapar comillas.
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function commandLine(tokens: string[]): string {
  return tokens.map(quoteToken).join(" ");
}

export function flagValue(values: string[], names: string[]): string | null {
  for (let i = 0; i < values.length; i++) {
    for (const name of names) {
      if (values[i] === name) {
        const next = values[i + 1];
        return looksLikeValue(next) ? next : null;
      }
      if (values[i].startsWith(`${name}=`)) {
        const value = values[i].slice(name.length + 1);
        if (value) return value;
      }
    }
  }
  return null;
}

export function hasFlag(values: string[], names: string[]): boolean {
  return values.some((value) =>
    names.some((name) => value === name || value.startsWith(`${name}=`)),
  );
}

function numberFlag(values: string[], names: string[]): number | null {
  const raw = flagValue(values, names);
  if (!raw) return null;
  // llama.cpp acepta `auto` (-1) y `all` (-2) además de un número de capas.
  const keyword = raw.toLowerCase();
  if (keyword === "auto") return -1;
  if (keyword === "all") return -2;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readArgs(config: ServerConfig): ArgsView {
  const tokens = tokenizeArgs(config.extraArgs);
  const values = tokens.map((token) => token.value);
  return {
    host: flagValue(values, ["--host"]) ?? config.host,
    port: numberFlag(values, ["--port"]) ?? config.port,
    ctxSize: numberFlag(values, ["-c", "--ctx-size"]),
    parallel: numberFlag(values, ["-np", "--parallel", "--n-parallel"]),
    ubatch: numberFlag(values, ["-ub", "--ubatch-size"]),
    cacheK: flagValue(values, ["--cache-type-k", "-ctk"]) ?? "f16",
    cacheV: flagValue(values, ["--cache-type-v", "-ctv"]) ?? "f16",
    gpuLayers: numberFlag(values, ["-ngl", "--n-gpu-layers", "--gpu-layers"]),
    flashAttn: flagValue(values, ["-fa", "--flash-attn"]),
    flagCount: values.filter((value) => value.startsWith("-")).length,
  };
}

export function validateArgs(input: string): string | null {
  const tokens = tokenizeArgs(input);
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    if (!BOOLEAN_FLAGS.has(current.value)) continue;
    const next = tokens[i + 1];
    if (!next) continue;
    if (next.quoted || !next.value.startsWith("-")) {
      return `\`${current.value}\` no lleva valor. Escribe solo \`${current.value}\`, o quítalo.`;
    }
  }
  return null;
}

/**
 * Compone lo que se pasará al proceso. En modo argumentos la app solo pone
 * el modelo y el endpoint; todo lo demás sale del texto del usuario.
 */
export function composeFlags(
  config: ServerConfig,
  modelPath: string | null,
  mmproj: string | null,
  draftPath: string | null,
): string[] {
  const tokens = tokenizeArgs(config.extraArgs);
  const values = tokens.map((token) => token.value);
  const flags: string[] = [];

  if (modelPath && !hasFlag(values, ["-m", "--model"])) {
    flags.push("-m", modelPath);
  }
  if (mmproj && !hasFlag(values, ["--mmproj", "-mm"])) {
    flags.push("--mmproj", mmproj);
  }
  if (draftPath && !hasFlag(values, ["--spec-draft-model", "-md"])) {
    flags.push("--spec-draft-model", draftPath);
  }
  if (!hasFlag(values, ["--host"])) flags.push("--host", config.host);
  if (!hasFlag(values, ["--port"])) flags.push("--port", String(config.port));

  return [...flags, ...values];
}

export function appendArgs(current: string, addition: string): string {
  const trimmed = current.trimEnd();
  return trimmed ? `${trimmed} ${addition}` : addition;
}

/**
 * Fija una flag con valor, reemplazando cualquier alias que ya estuviera.
 * `value === null` la elimina. Se usa en los ajustes rápidos: el usuario
 * elige «GPU» y la app escribe `-ngl`, sin obligarle a conocer la sintaxis.
 */
export function upsertFlag(
  current: string,
  aliases: string[],
  canonical: string,
  value: string | null,
): string {
  const tokens = tokenizeArgs(current).map((token) => token.value);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const match = aliases.find(
      (alias) => token === alias || token.startsWith(`${alias}=`),
    );
    if (!match) {
      out.push(token);
      continue;
    }
    if (token === match && looksLikeValue(tokens[i + 1])) i++;
  }
  if (value !== null) out.push(canonical, value);
  return commandLine(out);
}
