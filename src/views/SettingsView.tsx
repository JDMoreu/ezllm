import { useEffect, useState } from "react";
import { FileCog, FolderOpen, HardDrive, Info, KeyRound, Languages, type LucideIcon } from "lucide-react";

import { Input } from "../components/ui-kit/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui-kit/select";
import { Button, Section } from "../components/ui";
import Hint from "../components/Hint";
import { t, type Language } from "../lib/i18n";

/**
 * Ajustes como sección, no como diálogo: carpetas, idioma y token de GitHub.
 * Usa el mismo `Section` que Motor y Ejecutar, con filas etiqueta → valor →
 * acciones, para que las tres vistas se lean con la misma gramática.
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
  const tokenChanged = token.trim() !== githubToken.trim();

  const rows: {
    icon: LucideIcon;
    label: string;
    value: string;
    open: () => void;
    pick: (() => void) | null;
  }[] = [
    { icon: FolderOpen, label: t("Modelos"), value: modelsDir, open: onOpenModels, pick: onPickModels },
    { icon: HardDrive, label: t("Binarios"), value: llamaDir, open: onOpenLlama, pick: onPickLlama },
    { icon: FileCog, label: t("Config"), value: configPath, open: onOpenConfig, pick: null },
  ];

  // Misma fila que «Versiones instaladas» en Motor: icono, título con su
  // dato debajo y acciones a la derecha. Sin columna de etiqueta fija, que
  // dejaba un hueco a la izquierda del valor.
  return (
    <div className="space-y-5">
      <Section title={t("Carpetas")} bodyClassName="p-0">
        <ul className="divide-y divide-base-800">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.label} className="settings-row">
                <Icon size={15} className="settings-row-icon" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="settings-row-title">{row.label}</p>
                  <p className="settings-row-sub mono" title={row.value}>
                    {row.value || t("Sin asignar")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<FolderOpen size={13} />}
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
            );
          })}
        </ul>
      </Section>

      <Section title={t("General")} bodyClassName="p-0">
        <div className="divide-y divide-base-800">
          <div className="settings-row">
            <Languages size={15} className="settings-row-icon" aria-hidden />
            <div className="min-w-0 flex-1">
              <p id="settings-language" className="settings-row-title">
                {t("Idioma")}
              </p>
            </div>
            <Select
              value={language}
              onValueChange={(value) => {
                if (value === "es" || value === "en") onChangeLanguage(value);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-80"
                aria-labelledby="settings-language"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end" sideOffset={0}>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="settings-row">
            <KeyRound size={15} className="settings-row-icon" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="settings-row-title flex items-center gap-1">
                <label htmlFor="github-token">{t("Token de GitHub")}</label>
                <Hint
                  label={t(
                    "Motor consulta a GitHub las versiones de llama.cpp. Sin token, GitHub permite 60 peticiones por hora desde tu IP; con un token, 5000. No necesita permisos y se guarda solo en este equipo.",
                  )}
                >
                  <button
                    type="button"
                    className="sidebar-help"
                    aria-label={t("Acerca del token de GitHub")}
                  >
                    <Info aria-hidden />
                  </button>
                </Hint>
              </p>
              <p className="settings-row-sub">
                {githubToken ? t("Guardado en este equipo") : t("Sin token")}
              </p>
            </div>
            <div className="flex w-80 shrink-0 items-center gap-1.5">
              <Input
                id="github-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && tokenChanged) onChangeToken(token.trim());
                }}
                placeholder="ghp_…"
                autoComplete="off"
                spellCheck={false}
                className="mono h-8 min-w-0 flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChangeToken(token.trim())}
                disabled={!tokenChanged}
              >
                {t("Guardar")}
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
