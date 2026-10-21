import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Copy,
  FolderOpen,
  Layers,
  Play,
  Plus,
  Save,
  Trash2,
  Video,
  Zap,
} from "lucide-react";

import { api } from "../lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  useToast,
} from "../components/ui";
import { basename, formatNumber } from "../lib/format";
import type { AppConfig, ModelProfile, ServerConfig } from "../types";

/** Configuración por defecto de un perfil nuevo. */
function emptyProfile(name: string, base: ServerConfig): ModelProfile {
  return {
    id: "",
    name,
    modelPath: null,
    mmprojPath: null,
    draftPath: null,
    server: { ...base },
    notes: "",
    createdAt: 0,
  };
}

export default function ProfilesView({
  config,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  onConfigChange,
  onApply,
}: {
  config: AppConfig | null;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  onConfigChange: (c: AppConfig) => void;
  onApply: (c: AppConfig, p: ModelProfile) => void;
}) {
  const toast = useToast();
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [editing, setEditing] = useState<ModelProfile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch (e) {
      toast.push(`No se pudieron cargar los perfiles: ${String(e)}`, "danger");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = useCallback(() => {
    if (!config) return;
    const name = `Perfil ${profiles.length + 1}`;
    setEditing(
      emptyProfile(name, config.server),
    );
  }, [config, profiles.length]);

  const startEdit = useCallback(
    (p: ModelProfile) => {
      setEditing({
        ...p,
        server: { ...p.server },
      });
    },
    [],
  );

  const save = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.push("El perfil necesita un nombre", "danger");
      return;
    }
    try {
      await api.saveProfile(editing);
      toast.push(`Perfil «${editing.name}» guardado`, "success");
      setEditing(null);
      await load();
    } catch (e) {
      toast.push(`No se pudo guardar: ${String(e)}`, "danger");
    }
  }, [editing, load, toast]);

  const apply = useCallback(
    async (p: ModelProfile) => {
      try {
        const [cfg] = await api.applyProfile(p.id);
        onConfigChange(cfg);
        onApply(cfg, p);
        toast.push(`Perfil «${p.name}» aplicado`, "success");
        await load();
      } catch (e) {
        toast.push(`No se pudo aplicar: ${String(e)}`, "danger");
      }
    },
    [onApply, onConfigChange, load, toast],
  );

  const duplicate = useCallback(
    async (p: ModelProfile) => {
      try {
        const copy = await api.duplicateProfile(p.id, `${p.name} (copia)`);
        toast.push(`Perfil «${copy.name}» creado`, "success");
        await load();
      } catch (e) {
        toast.push(`No se pudo duplicar: ${String(e)}`, "danger");
      }
    },
    [load, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteProfile(id);
        toast.push("Perfil eliminado", "info");
        await load();
      } catch (e) {
        toast.push(`No se pudo eliminar: ${String(e)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [load, toast],
  );

  const activeId = config?.activeProfileId ?? null;

  const sorted = useMemo(
    () => [...profiles].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [profiles],
  );

  if (!config) {
    return (
      <Card>
        <p className="py-6 text-center text-xs text-ink-400">Cargando perfiles…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Perfiles</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Guarda un modelo con su configuración y sus banderas como un perfil.
            Así no tienes que reconfigurarlo cada vez: aplicas el perfil y
            arrancas. Puedes tener varios y alternar entre ellos.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={14} />} onClick={startNew}>
          Nuevo perfil
        </Button>
      </header>

      {sorted.length === 0 && !editing && (
        <Card>
          <EmptyState
            icon={<Layers size={20} />}
            title="Todavía no hay perfiles"
            description="Crea uno con el modelo que uses y su configuración. Luego basta con aplicarlo para arrancar con todo listo."
            action={
              <Button variant="primary" icon={<Plus size={13} />} onClick={startNew}>
                Crear el primero
              </Button>
            }
          />
        </Card>
      )}

      {/* --- Lista --- */}
      {sorted.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              active={p.id === activeId}
              onApply={() => apply(p)}
              onEdit={() => startEdit(p)}
              onDuplicate={() => duplicate(p)}
              onDelete={() => setPendingDelete(p.id)}
            />
          ))}
        </div>
      )}

      {/* --- Editor --- */}
      {editing && (
        <ProfileEditor
          profile={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
          currentModel={selectedModel}
          currentMmproj={selectedMmproj}
          currentDraft={selectedDraft}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar perfil"
        message="Se borra el perfil guardado. Los modelos y la configuración actual no se tocan."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ProfileCard({
  profile,
  active,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  profile: ModelProfile;
  active: boolean;
  onApply: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const s = profile.server;
  return (
    <section
      className={clsx(
        "card p-4 transition-colors duration-200",
        active && "border-accent-500/45",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-xs font-semibold text-ink-100">
              {profile.name}
            </h3>
            {active && <span className="chip chip-accent">Activo</span>}
          </div>
          <p className="mono mt-1 truncate text-[0.6875rem] text-ink-500">
            {profile.modelPath
              ? basename(profile.modelPath)
              : "Sin modelo asignado"}
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            onClick={onDuplicate}
            className="btn-quiet cursor-pointer rounded p-1.5 text-ink-500 hover:text-ink-100"
            title="Duplicar"
            aria-label="Duplicar perfil"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={onDelete}
            className="btn-quiet cursor-pointer rounded p-1.5 text-ink-500 hover:text-danger-400"
            title="Eliminar"
            aria-label="Eliminar perfil"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.6875rem]">
        {(
          [
            ["Contexto", formatNumber(s.ctxSize)],
            ["Capas GPU", s.nGpuLayers === null ? "auto" : String(s.nGpuLayers)],
            ["Paralelo", String(s.nParallel)],
            ["Flash attn", s.flashAttn],
            ["Puerto", String(s.port)],
            ["Caché", s.cacheTypeK],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-ink-500">{k}</dt>
            <dd className="mono truncate text-ink-300">{v}</dd>
          </div>
        ))}
      </dl>

      {profile.modelPath && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="chip chip-accent">
            <Layers size={10} />
            Modelo
          </span>
          {profile.mmprojPath && (
            <span className="chip chip-violet">
              <Video size={10} />
              Proyector
            </span>
          )}
          {profile.draftPath && (
            <span className="chip">
              <Zap size={10} />
              MTP
            </span>
          )}
        </div>
      )}

      {profile.notes && (
        <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-ink-500">
          {profile.notes}
        </p>
      )}

      {profile.server.extraArgs?.trim() && (
        <p className="mono mt-2 truncate rounded bg-base-950 px-2 py-1 text-[0.625rem] text-accent-300">
          {profile.server.extraArgs.trim()}
        </p>
      )}

      <div className="mt-3.5 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={<Play size={12} />}
          onClick={onApply}
          className="flex-1"
        >
          Aplicar
        </Button>
        <Button size="sm" onClick={onEdit}>
          Editar
        </Button>
      </div>
    </section>
  );
}

function ProfileEditor({
  profile,
  onChange,
  onSave,
  onCancel,
  currentModel,
  currentMmproj,
  currentDraft,
}: {
  profile: ModelProfile;
  onChange: (p: ModelProfile) => void;
  onSave: () => void;
  onCancel: () => void;
  currentModel: string | null;
  currentMmproj: string | null;
  currentDraft: string | null;
}) {
  const s = profile.server;
  const setServer = (patch: Partial<ServerConfig>) =>
    onChange({ ...profile, server: { ...s, ...patch } });

  return (
    <Card
      title={profile.id ? "Editar perfil" : "Nuevo perfil"}
      subtitle="Elige los modelos y guarda la configuración con la que se will arrancar."
      actions={
        <>
          <Button variant="quiet" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Save size={13} />} onClick={onSave}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del perfil">
            <input
              className="field"
              value={profile.name}
              placeholder="Qwen3 8B en la GPU"
              onChange={(e) => onChange({ ...profile, name: e.target.value })}
            />
          </Field>
          <Field label="Notas">
            <input
              className="field"
              value={profile.notes}
              placeholder="Para el servidor del trabajo"
              onChange={(e) => onChange({ ...profile, notes: e.target.value })}
            />
          </Field>
        </div>

        {/* --- Modelos --- */}
        <div className="space-y-3 rounded-lg border border-base-750 p-3">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">
            Modelos
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ModelSlot
              label="Modelo principal"
              value={profile.modelPath}
              current={currentModel}
              onChange={(v) => onChange({ ...profile, modelPath: v })}
            />
            <ModelSlot
              label="Proyector (mmproj)"
              value={profile.mmprojPath}
              current={currentMmproj}
              onChange={(v) => onChange({ ...profile, mmprojPath: v })}
            />
            <ModelSlot
              label="MTP / draft"
              value={profile.draftPath}
              current={currentDraft}
              onChange={(v) => onChange({ ...profile, draftPath: v })}
            />
          </div>
          <p className="text-[0.6875rem] text-ink-500">
            Si dejas un campo vacío, el perfil usará lo que esté seleccionado
            en ese momento.
          </p>
        </div>

        {/* --- Configuración --- */}
        <div className="space-y-3 rounded-lg border border-base-750 p-3">
          <p className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">
            Configuración del servidor
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Contexto">
              <input
                type="number"
                className="field mono tabular-nums"
                value={s.ctxSize}
                onChange={(e) => setServer({ ctxSize: Number(e.target.value) })}
              />
            </Field>
            <Field label="Capas GPU">
              <input
                type="number"
                className="field mono tabular-nums"
                value={s.nGpuLayers ?? ""}
                placeholder="auto"
                onChange={(e) =>
                  setServer({
                    nGpuLayers: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Paralelo">
              <input
                type="number"
                className="field mono tabular-nums"
                value={s.nParallel}
                onChange={(e) => setServer({ nParallel: Number(e.target.value) })}
              />
            </Field>
            <Field label="Puerto">
              <input
                type="number"
                className="field mono tabular-nums"
                value={s.port}
                onChange={(e) => setServer({ port: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Dispositivo GPU" hint="Vulkan0, CUDA0, o varias separadas por comas.">
              <input
                className="field mono"
                value={s.device ?? ""}
                placeholder="Vulkan0"
                onChange={(e) => setServer({ device: e.target.value || null })}
              />
            </Field>
            <Field label="Flash Attention">
              <select
                className="field"
                value={s.flashAttn}
                onChange={(e) => setServer({ flashAttn: e.target.value })}
              >
                <option value="auto">Automático</option>
                <option value="on">Activado</option>
                <option value="off">Desactivado</option>
              </select>
            </Field>
          </div>
          <Field
            label="Flags avanzados"
            hint="Comandos extra de llama-server para este perfil."
          >
            <input
              className="field mono text-xs"
              value={s.extraArgs}
              placeholder="--temp 0.7 --top-p 0.9"
              onChange={(e) => setServer({ extraArgs: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

function ModelSlot({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: string | null;
  current: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        <input
          className="field mono text-[0.6875rem]"
          value={value ?? ""}
          placeholder="Sin asignar"
          onChange={(e) => onChange(e.target.value || null)}
        />
        {current && current !== value && (
          <button
            onClick={() => onChange(current)}
            className="btn-quiet flex w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[0.625rem] text-ink-500 hover:text-accent-400"
            title={current}
          >
            <FolderOpen size={10} />
            Usar el seleccionado
          </button>
        )}
      </div>
    </Field>
  );
}
