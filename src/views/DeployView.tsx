import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Cpu, Download } from "lucide-react";

import { api } from "../lib/api";
import ArgumentLibrary from "../components/ArgumentLibrary";
import ExecutionPanel, { type MemoryReading } from "../components/ExecutionPanel";
import { Button, Section } from "../components/ui";
import { readArgs, upsertFlag, validateArgs } from "../lib/args";
import { fitOf, percentOf, recommendedContext } from "../lib/fit";
import { formatGb } from "../lib/format";
import type {
  AppConfig,
  MemoryEstimate,
  ServerConfig,
  ServerStatus,
} from "../types";

type Workspace = "run" | "models" | "runtime";

/** Contexto de referencia cuando el modelo aún no está medido. */
const PROBE_CTX = 4096;

export default function DeployView({
  config,
  server,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  onSelect,
  onConfigChange,
  onPickModel,
  onStart,
  onStop,
  onRestart,
  onOpenChat,
  chatAvailable,
  onNavigate,
  hasRuntime,
  hasModel,
  vramTotalMib,
  ramAvailableGb,
  serverBusy,
}: {
  config: AppConfig | null;
  server: ServerStatus | null;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  onSelect: (model: string | null, mmproj: string | null, draft: string | null) => void;
  onConfigChange: (c: AppConfig) => void;
  onPickModel: (slot: "primary" | "mmproj" | "draft") => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenChat: () => void;
  chatAvailable: boolean;
  onNavigate: (tab: Workspace) => void;
  hasRuntime: boolean;
  hasModel: boolean;
  vramTotalMib: number;
  ramAvailableGb: number;
  serverBusy: boolean;
}) {
  const [probe, setProbe] = useState<MemoryEstimate | null>(null);
  const [probeFor, setProbeFor] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MemoryEstimate | null>(null);
  // Modelo para el que ya se decidió el contexto automático: si el usuario lo
  // borra, no se vuelve a escribir solo.
  const autoCtxFor = useRef<string | null>(null);

  const sc = config?.server;

  const update = useCallback(
    (patch: Partial<ServerConfig>) => {
      if (!config) return;
      onConfigChange({
        ...config,
        server: { ...config.server, ...patch },
      });
    },
    [config, onConfigChange],
  );

  // Las configuraciones anteriores a este cambio se migran en el backend.
  // Este efecto cubre el caso de una config nueva con el modo apagado.
  useEffect(() => {
    if (sc && !sc.rawMode) update({ rawMode: true });
  }, [sc, update]);

  const parsed = useMemo(() => (sc ? readArgs(sc) : null), [sc]);
  const argsError = useMemo(() => validateArgs(sc?.extraArgs ?? ""), [sc?.extraArgs]);

  const ctxFlag = parsed?.ctxSize && parsed.ctxSize > 0 ? parsed.ctxSize : null;
  const gpuLayers = parsed?.gpuLayers ?? null;
  const parallel = parsed?.parallel && parsed.parallel > 0 ? parsed.parallel : 1;
  const ubatch = parsed?.ubatch && parsed.ubatch > 0 ? parsed.ubatch : 512;
  const cacheK = parsed?.cacheK ?? "f16";
  const cacheV = parsed?.cacheV ?? "f16";

  // Forma del modelo y coste por token: no dependen del contexto elegido.
  useEffect(() => {
    if (!selectedModel) {
      setProbe(null);
      setProbeFor(null);
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const est = await api.estimateMemory(
          selectedModel,
          PROBE_CTX,
          parallel,
          cacheK,
          cacheV,
          ubatch,
          gpuLayers,
        );
        if (alive) {
          setProbe(est);
          setProbeFor(selectedModel);
        }
      } catch {
        if (alive) {
          setProbe(null);
          setProbeFor(null);
        }
      }
    }, 240);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [selectedModel, parallel, cacheK, cacheV, ubatch, gpuLayers]);

  const vramTotalGb = vramTotalMib / 1024;
  const cpuOnly = gpuLayers === 0;
  const automatic = gpuLayers === null || gpuLayers === -1;
  // Sin GPU dedicada, o con -ngl 0, la capacidad que importa es la RAM.
  const capacityGb = cpuOnly || vramTotalGb <= 0 ? ramAvailableGb : vramTotalGb;

  // Sin -c, llama.cpp usa el contexto de entrenamiento y lo reduce si no cabe;
  // nunca lo sube. La memoria se mide con ese techo, no con la VRAM.
  const ctxShown = ctxFlag ?? (probe && probe.ctxTrain > 0 ? probe.ctxTrain : PROBE_CTX);

  // Al cargar un modelo sin contexto explícito, se escribe el mayor contexto
  // que cabe con margen en la VRAM (o en la RAM si no hay GPU o se fuerza CPU).
  // Así el comando dice exactamente con cuánto va a arrancar.
  useEffect(() => {
    if (!sc || !selectedModel || !probe || probeFor !== selectedModel) return;
    if (autoCtxFor.current === selectedModel) return;
    autoCtxFor.current = selectedModel;
    if (ctxFlag !== null) return;
    const fixedGb =
      (cpuOnly
        ? probe.weightsCpuGb + probe.computeHostMib / 1024
        : probe.weightsGpuGb + probe.computeGpuMib / 1024) + probe.kvSwaGb;
    const kvPerTokenGb = probe.ctxPadded > 0 ? probe.kvDenseGb / probe.ctxPadded : 0;
    const recommended = recommendedContext({
      capacityGb,
      fixedGb,
      kvPerTokenGb,
      maxCtx: probe.ctxTrain > 0 ? probe.ctxTrain : null,
    });
    if (recommended === null) return;
    update({
      extraArgs: upsertFlag(sc.extraArgs, ["-c", "--ctx-size"], "-c", String(recommended)),
      rawMode: true,
    });
  }, [sc, selectedModel, probe, probeFor, ctxFlag, capacityGb, cpuOnly, update]);

  useEffect(() => {
    if (!selectedModel) {
      setEstimate(null);
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const est = await api.estimateMemory(
          selectedModel,
          ctxShown,
          parallel,
          cacheK,
          cacheV,
          ubatch,
          gpuLayers,
        );
        if (alive) setEstimate(est);
      } catch {
        if (alive) setEstimate(null);
      }
    }, 240);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [selectedModel, ctxShown, parallel, cacheK, cacheV, ubatch, gpuLayers]);

  // La memoria que se pide a cada memoria, medida contra su capacidad total.
  // Con Automático, llama.cpp reparte capas con la RAM: sin VRAM basta con
  // que quepa entre ambas, y eso se muestra como justo.
  let memory: MemoryReading | null = null;
  if (selectedModel && estimate) {
    const need = cpuOnly ? estimate.totalGb : estimate.vramRequestedGb;
    let tone = fitOf(need, capacityGb);
    if (!cpuOnly && automatic && tone === "no") {
      tone = fitOf(estimate.totalGb, vramTotalGb + ramAvailableGb) === "no" ? "no" : "tight";
    }
    memory = {
      text: formatGb(need),
      tone,
      where: cpuOnly ? "ram" : "gpu",
      detail: capacityGb > 0 ? `${percentOf(need, capacityGb)} % · ${formatGb(capacityGb, 0)}` : "",
    };
  }

  if (!config || !sc) {
    return (
      <Section title="Cargando">
        <p className="py-6 text-center text-body text-ink-400">Cargando…</p>
      </Section>
    );
  }

  const needsSetup = !hasRuntime || !hasModel;

  return (
    <div className="space-y-4">
      {needsSetup && !server?.running && (
        <Readiness hasRuntime={hasRuntime} hasModel={hasModel} onNavigate={onNavigate} />
      )}

      <ExecutionPanel
        config={config}
        server={server}
        selectedModel={selectedModel}
        selectedMmproj={selectedMmproj}
        selectedDraft={selectedDraft}
        args={sc.extraArgs}
        argsError={argsError}
        memory={memory}
        onArgsChange={(extraArgs) => update({ extraArgs, rawMode: true })}
        onSelect={onSelect}
        onPickModel={onPickModel}
        onStart={onStart}
        onStop={onStop}
        onRestart={onRestart}
        onOpenChat={onOpenChat}
        chatAvailable={chatAvailable}
        onNavigate={onNavigate}
        hasRuntime={hasRuntime}
        hasModel={hasModel}
        serverBusy={serverBusy}
      />

      <ArgumentLibrary
        args={sc.extraArgs}
        onChange={(extraArgs) => update({ extraArgs, rawMode: true })}
      />
    </div>
  );
}

function Readiness({
  hasRuntime,
  hasModel,
  onNavigate,
}: {
  hasRuntime: boolean;
  hasModel: boolean;
  onNavigate: (tab: Workspace) => void;
}) {
  return (
    <section
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-accent-500/25 bg-accent-500/[0.04] px-4 py-3"
      aria-label="Puesta en marcha"
    >
      <div className="flex items-center gap-2">
        <Step done={hasRuntime} n={1} title="Motor" hint={hasRuntime ? "Instalado" : "Sin instalar"} />
        <span className="h-px w-5 bg-base-700" aria-hidden />
        <Step done={hasModel} n={2} title="Modelo" hint={hasModel ? "Elegido" : "Sin elegir"} />
        <span className="h-px w-5 bg-base-700" aria-hidden />
        <Step done={false} n={3} title="Servidor" hint="Pendiente" />
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!hasRuntime && (
          <Button
            size="sm"
            variant="primary"
            icon={<Cpu size={12} />}
            onClick={() => onNavigate("runtime")}
          >
            Instalar motor
          </Button>
        )}
        {!hasModel && (
          <Button
            size="sm"
            variant="primary"
            icon={<Download size={12} />}
            onClick={() => onNavigate("models")}
          >
            Buscar modelo
          </Button>
        )}
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  hint,
  done,
}: {
  n: number;
  title: string;
  hint: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-meta font-semibold",
          done
            ? "border-ok-500/40 bg-ok-500/15 text-ok-400"
            : "border-base-600 bg-base-850 text-ink-400",
        )}
        aria-hidden
      >
        {done ? <Check size={11} /> : n}
      </span>
      <div className="leading-tight">
        <p className="text-label font-medium text-ink-200">{title}</p>
        <p className="text-meta text-ink-500">{hint}</p>
      </div>
    </div>
  );
}
