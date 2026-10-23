import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import ArgumentLibrary from "../components/ArgumentLibrary";
import ExecutionPanel from "../components/ExecutionPanel";
import { Section } from "../components/ui";
import { formatGb } from "../lib/format";
import { readArgs, tokenizeArgs, validateArgs } from "../lib/args";
import type { AppConfig, MemoryEstimate, ServerConfig, ServerStatus } from "../types";

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
  serverBusy: boolean;
}) {
  const [estimate, setEstimate] = useState<MemoryEstimate | null>(null);

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

  const ctx = parsed?.ctxSize && parsed.ctxSize > 0 ? parsed.ctxSize : 4096;
  const parallel = parsed?.parallel && parsed.parallel > 0 ? parsed.parallel : 1;
  const ubatch = parsed?.ubatch && parsed.ubatch > 0 ? parsed.ubatch : 512;
  const cacheK = parsed?.cacheK ?? "f16";
  const cacheV = parsed?.cacheV ?? "f16";
  const gpuLayers = parsed?.gpuLayers ?? null;

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
          ctx,
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
  }, [selectedModel, ctx, parallel, cacheK, cacheV, ubatch, gpuLayers]);

  if (!config || !sc) {
    return (
      <Section title="Cargando">
        <p className="py-6 text-center text-body text-ink-400">Cargando…</p>
      </Section>
    );
  }

  const gpuShareGb = estimate
    ? estimate.weightsGpuGb + estimate.kvCacheGb + estimate.computeBufferGb
    : 0;
  const runsOnGpu = estimate ? estimate.vramRequestedGb > 0 : false;
  const memoryLabel = selectedModel
    ? estimate
      ? `${formatGb(runsOnGpu ? gpuShareGb : estimate.totalGb)} ${runsOnGpu ? "en GPU" : "en RAM"}`
      : "Calculando…"
    : null;

  return (
    <div className="space-y-4">
      <ExecutionPanel
        config={config}
        server={server}
        selectedModel={selectedModel}
        selectedMmproj={selectedMmproj}
        selectedDraft={selectedDraft}
        args={sc.extraArgs}
        argsError={argsError}
        tokens={tokenizeArgs(sc.extraArgs).length}
        memoryLabel={memoryLabel}
        onArgsChange={(extraArgs) => update({ extraArgs, rawMode: true })}
        onSelect={onSelect}
        onConfigChange={onConfigChange}
        onPickModel={onPickModel}
        onStart={onStart}
        onStop={onStop}
        serverBusy={serverBusy}
      />

      <ArgumentLibrary
        args={sc.extraArgs}
        onChange={(extraArgs) => update({ extraArgs, rawMode: true })}
      />
    </div>
  );
}
