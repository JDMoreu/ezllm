import { useEffect, useState } from "react";
import { FolderOpen, KeyRound } from "lucide-react";

import { Button } from "../components/ui";
import { basename, dirname } from "../lib/format";
import { t, type Language } from "../lib/i18n";

/**
 * Ajustes como sección, no como diálogo: carpetas, idioma y token de GitHub.
 * Nada de aquí pertenece a la tarea diaria, así que vive en su propio espacio.
 */
export default function SettingsView({
  modelsDir,
  llamaDir,
  configPath,
  language,
  githubToken,
  onChangeLanguage,
  onChangeToken,
  onPickModels,
  onPickLlama,
  onOpenModels,
  onOpenLlama,
  onOpenConfig,
}: {
  modelsDir: string;
  llamaDir: string;
  configPath: string;
  language: Language;
  githubToken: string;
  onChangeLanguage: (language: Language) => void;
  onChangeToken: (token: string) => void;
  onPickModels: () => void;
  onPickLlama: () => void;
  onOpenModels: () => void;
  onOpenLlama: () => void;
  onOpenConfig: () => void;
}) {
  const [token, setToken] = useState(githubToken);
  useEffect(() => setToken(githubToken), [githubToken]);

  const rows = [
    {
      label: t("Modelos"),
      value: modelsDir,
      open: onOpenModels,
      pick: onPickModels,
    },
    {
      label: t("Binarios"),
      value: llamaDir,
      open: onOpenLlama,
      pick: onPickLlama,
    },
    {
      label: t("Config"),
      value: configPath,
      open: onOpenConfig,
      pick: null,
    },
  ];

  return (
    <div className="max-w-3xl">
      <header className="mb-4">
        <h2 className="text-title font-semibold tracking-tight text-ink-100">
          {t("Ajustes")}
        </h2>
        <p className="mt-1 text-meta text-ink-500">
          {t("Carpetas que la app lee y escribe. Nada se sube a la nube.")}
        </p>
      </header>

      <div className="space-y-5">
        <section aria-labelledby="settings-paths">
          <h3 id="settings-paths" className="text-label font-medium text-ink-300">
            {t("Carpetas")}
          </h3>
          <ul className="mt-2 divide-y divide-base-800 rounded-card border border-base-800">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-[4.5rem] shrink-0 text-meta text-ink-500">
                  {row.label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label text-ink-200" title={row.value}>
                    {row.value ? basename(row.value) : t("Sin asignar")}
                  </p>
                  {row.value && dirname(row.value) !== row.value && (
                    <p className="truncate text-meta text-ink-500" title={row.value}>
                      {dirname(row.value)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<FolderOpen size={12} />}
                    onClick={row.open}
                    disabled={!row.value}
                    title={t("Abrir carpeta")}
                  >
                    {t("Abrir")}
                  </Button>
                  {row.pick && (
                    <Button size="sm" variant="ghost" onClick={row.pick}>
                      {t("Cambiar")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="settings-language">
          <h3 id="settings-language" className="text-label font-medium text-ink-300">
            {t("Idioma")}
          </h3>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-card border border-base-800 px-3 py-2.5">
            <p className="text-meta text-ink-500">
              {t("Cambia la interfaz y el formato de fechas y números.")}
            </p>
            <div className="language-switch" role="group" aria-label={t("Idioma")}>
              <button
                type="button"
                onClick={() => onChangeLanguage("es")}
                className={language === "es" ? "language-switch-on" : undefined}
                aria-pressed={language === "es"}
              >
                Español
              </button>
              <button
                type="button"
                onClick={() => onChangeLanguage("en")}
                className={language === "en" ? "language-switch-on" : undefined}
                aria-pressed={language === "en"}
              >
                English
              </button>
            </div>
          </div>
        </section>

        <section aria-labelledby="settings-github">
          <h3 id="settings-github" className="text-label font-medium text-ink-300">
            {t("GitHub")}
          </h3>
          <div className="mt-2 rounded-card border border-base-800 px-3 py-2.5">
            <label
              htmlFor="github-token"
              className="flex items-center gap-1.5 text-label font-medium text-ink-200"
            >
              <KeyRound size={13} className="text-ink-500" aria-hidden />
              {t("Token de GitHub (opcional)")}
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="github-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onChangeToken(token.trim());
                }}
                placeholder="ghp_…"
                autoComplete="off"
                spellCheck={false}
                className="field mono min-w-0 flex-1"
              />
              <Button
                size="sm"
                variant="quiet"
                onClick={() => onChangeToken(token.trim())}
                disabled={token.trim() === githubToken.trim()}
              >
                {t("Guardar token")}
              </Button>
            </div>
            <p className="mt-1 text-meta leading-relaxed text-ink-500">
              {t(
                "Motor consulta a GitHub las versiones de llama.cpp. Sin token, GitHub permite 60 peticiones por hora desde tu IP; con un token, 5000. No necesita permisos y se guarda solo en este equipo.",
              )}
            </p>
          </div>
        </section>

        <p className="border-t border-base-800 pt-3 text-meta leading-relaxed text-ink-500">
          {t("La configuración se guarda en")}{" "}
          <span className="mono text-ink-400">{configPath || "config.json"}</span>.{" "}
          {t("Los modelos y los binarios viven en las carpetas de arriba.")}
        </p>
      </div>
    </div>
  );
}
