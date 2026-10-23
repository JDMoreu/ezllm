import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, ListFilter, Plus, Search, X } from "lucide-react";

import { api } from "../lib/api";
import { commandLine, flagValue, hasFlag, looksLikeValue, tokenizeArgs } from "../lib/args";
import { t } from "../lib/i18n";
import {
  ARG_CATEGORY_LABEL,
  CATEGORY_ORDER,
  FALLBACK_OPTIONS,
  SUGGESTED_KEYS,
  categoryFor,
  metadataFor,
  type ArgCategory,
} from "../lib/argCatalog";
import type { ArgHelp, ArgOption } from "../types";
import { Button } from "./ui";

type Filter = ArgCategory | "Todas";

export default function ArgumentLibrary({
  args,
  onChange,
}: {
  args: string;
  onChange: (value: string) => void;
}) {
  const [help, setHelp] = useState<ArgHelp | null>(null);
  const [helpError, setHelpError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Sugeridos");
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(60);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .serverHelp()
      .then((catalog) => {
        if (alive) setHelp(catalog);
      })
      .catch((error) => {
        if (alive) setHelpError(String(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setLimit(60);
  }, [query, filter]);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  const options = help?.options.length ? help.options : FALLBACK_OPTIONS;
  const values = useMemo(() => tokenizeArgs(args).map((token) => token.value), [args]);
  const active = useMemo(
    () => options.filter((option) => isActive(values, option)),
    [options, values],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = options;
    if (needle) {
      list = list.filter((option) => {
        const meta = metadataFor(option);
        return (
          option.key.toLowerCase().includes(needle) ||
          option.flags.some((flag) => flag.toLowerCase().includes(needle)) ||
          meta.title.toLowerCase().includes(needle) ||
          meta.description.toLowerCase().includes(needle) ||
          option.description.toLowerCase().includes(needle)
        );
      });
    } else if (filter === "Sugeridos") {
      const rank = new Map(SUGGESTED_KEYS.map((key, index) => [key, index]));
      list = list
        .filter((option) => rank.has(option.key))
        .sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
    } else if (filter !== "Todas") {
      list = list.filter((option) => categoryFor(option) === filter);
    }
    return list;
  }, [options, query, filter]);

  const counts = useMemo(() => {
    const map = new Map<ArgCategory, number>();
    for (const option of options) {
      const category = categoryFor(option);
      map.set(category, (map.get(category) ?? 0) + 1);
    }
    return map;
  }, [options]);

  const categories = useMemo(() => {
    const list: Filter[] = ["Sugeridos", "Todas", ...CATEGORY_ORDER.slice(1)];
    return list
      .map((category) => ({
        category,
        label:
          category === "Sugeridos" || category === "Todas"
            ? category
            : ARG_CATEGORY_LABEL[category],
        count:
          category === "Sugeridos"
            ? options.filter((option) => SUGGESTED_KEYS.includes(option.key)).length
            : category === "Todas"
              ? options.length
              : (counts.get(category) ?? 0),
      }))
      .filter((item) => item.category === "Sugeridos" || item.category === "Todas" || item.count > 0);
  }, [options, counts]);

  const currentCategory = categories.find((item) => item.category === filter) ?? categories[0];
  const visible = filtered.slice(0, limit);

  function startEdit(option: ArgOption) {
    setEditing(option.key);
    const fallback = option.key === "ctx-size" ? "" : (option.defaultValue ?? "");
    setDraftValue(flagValue(values, option.flags) ?? fallback);
  }

  function apply(option: ArgOption, value: string) {
    const without = removeOption(values, option);
    if (value.trim()) {
      onChange(commandLine([...without, option.canonical, value.trim()]));
    } else if (option.valueHint?.startsWith("[")) {
      onChange(commandLine([...without, option.canonical]));
    } else {
      return;
    }
    setEditing(null);
  }

  function remove(option: ArgOption) {
    onChange(commandLine(removeOption(values, option)));
    setEditing(null);
  }

  return (
    <section className="arg-library" aria-labelledby="arg-library-title">
      <header className="arg-library-head">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="arg-library-title" className="text-title font-semibold tracking-tight text-ink-100">
              {t("Biblioteca de argumentos")}
            </h2>
            {active.length > 0 && (
              <span className="arg-active-count">
                <span aria-hidden />
                {active.length} {t("en uso")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-label text-ink-500">
            {loading
              ? t("Leyendo el catálogo del runtime…")
              : help
                ? `${options.length} ${t("flags del runtime instalado")}`
                : `${options.length} ${t("argumentos esenciales · no se pudo leer el runtime")}`}
          </p>
        </div>

        <div className="arg-tools">
          <label className="arg-search">
            <Search size={14} aria-hidden />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value) setFilter("Todas");
              }}
              placeholder={t("Buscar un argumento…")}
              aria-label="Buscar argumentos de llama.cpp"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="arg-search-clear"
                aria-label="Limpiar búsqueda"
              >
                <X size={12} />
              </button>
            )}
          </label>

          <div className="arg-filter" ref={filterRef}>
            <button
              type="button"
              className={clsx("arg-filter-btn", filterOpen && "arg-filter-btn-open")}
              onClick={() => setFilterOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              aria-label={`${t("Categoría")}: ${t(currentCategory?.label ?? "Sugeridos")}`}
            >
              <ListFilter size={13} aria-hidden />
              <span className="arg-filter-name">{t(currentCategory?.label ?? "Sugeridos")}</span>
              <span className="arg-filter-count">{currentCategory?.count ?? 0}</span>
              <ChevronDown
                size={13}
                className={clsx("arg-filter-chevron", filterOpen && "arg-filter-chevron-open")}
                aria-hidden
              />
            </button>

            {filterOpen && (
              <div className="arg-filter-menu">
                <p className="arg-filter-title">{t("Categoría")}</p>
                <div role="listbox" aria-label="Categorías de argumentos">
                  {categories.map((item) => {
                    const selected = filter === item.category;
                    return (
                      <button
                        key={item.category}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={clsx("arg-filter-option", selected && "arg-filter-option-on")}
                        onClick={() => {
                          setFilter(item.category);
                          setQuery("");
                          setFilterOpen(false);
                          setLimit(60);
                        }}
                      >
                        <span className="arg-filter-check">
                          {selected && <Check size={11} />}
                        </span>
                        <span className="arg-filter-option-name">{t(item.label)}</span>
                        <span className="arg-filter-option-count">{item.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {helpError && (
        <p className="arg-note">
          {t("El catálogo completo necesita un runtime instalado. Mientras tanto se muestran las flags esenciales.")}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="arg-empty">{t("No hay argumentos que coincidan con esa búsqueda.")}</p>
      ) : (
        <ul className="arg-list">
          {visible.map((option) => {
            const meta = metadataFor(option);
            const isOn = isActive(values, option);
            const currentValue = flagValue(values, option.flags);
            const isEditing = editing === option.key;
            const choices = choicesFor(option.valueHint);
            const quickValues = quickValuesFor(option);

            return (
              <li key={option.key} className={clsx("arg-row", isOn && "arg-row-on")}>
                <div className="arg-row-main">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="arg-flag">{option.canonical}</code>
                      <span className="text-label font-medium text-ink-200">{meta.title}</span>
                      {isOn && (
                        <span className="arg-active-value">
                          <Check size={10} />
                          {currentValue ?? "activo"}
                        </span>
                      )}
                    </div>
                    <p className="arg-description" title={option.description}>
                      {meta.description}
                    </p>
                    {option.valueHint && (
                      <p className="arg-value-hint">
                        {t("Valor:")}{" "}
                        <span className="mono">
                          {option.key === "ctx-size" ? "tokens" : option.valueHint}
                        </span>
                        {option.defaultValue && option.key !== "ctx-size" && (
                          <>
                            {" "}· {t("por defecto")} <span className="mono">{option.defaultValue}</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <div
                    className={clsx(
                      "arg-row-actions",
                      isEditing && "arg-row-actions-editing",
                    )}
                  >
                    {isEditing ? (
                      <div className="arg-inline-editor">
                        {choices.length > 0 ? (
                          choices.map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => setDraftValue(choice)}
                              className={clsx(
                                "arg-choice",
                                draftValue === choice && "arg-choice-on",
                              )}
                            >
                              {choice}
                            </button>
                          ))
                        ) : (
                          <>
                            <input
                              autoFocus
                              value={draftValue}
                              onChange={(event) => setDraftValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") apply(option, draftValue);
                                if (event.key === "Escape") setEditing(null);
                              }}
                              className="field mono arg-inline-input"
                              placeholder={
                                option.key === "ctx-size"
                                  ? "32768"
                                  : (option.valueHint ?? "")
                              }
                              inputMode={option.key === "ctx-size" ? "numeric" : undefined}
                              aria-label={`Valor para ${option.canonical}`}
                            />
                            {quickValues.map((value) => (
                              <button
                                key={value}
                                type="button"
                                className="arg-inline-preset"
                                onClick={() => setDraftValue(value)}
                                title={`${value} tokens`}
                              >
                                {compactTokens(value)}
                              </button>
                            ))}
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => apply(option, draftValue)}
                          disabled={!draftValue.trim() && !option.valueHint?.startsWith("[")}
                        >
                          {isOn ? t("Aplicar") : t("Añadir")}
                        </Button>
                        <button
                          type="button"
                          className="arg-inline-cancel"
                          onClick={() => setEditing(null)}
                          aria-label="Cancelar"
                          title="Cancelar"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        {isOn && option.valueHint !== null && (
                          <Button size="sm" variant="quiet" onClick={() => startEdit(option)}>
                            {t("Editar")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={isOn ? "quiet" : "ghost"}
                          icon={isOn ? <X size={12} /> : <Plus size={12} />}
                          onClick={() => {
                            if (isOn) remove(option);
                            else if (option.valueHint !== null) startEdit(option);
                            else apply(option, "");
                          }}
                        >
                          {isOn ? t("Quitar") : t("Añadir")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > visible.length && (
        <button
          type="button"
          onClick={() => setLimit((value) => value + 80)}
          className="arg-more"
        >
          {t("Mostrar")} {Math.min(80, filtered.length - visible.length)} {t("más de")} {filtered.length}
        </button>
      )}
    </section>
  );
}

function isActive(values: string[], option: ArgOption): boolean {
  return option.valueHint === null
    ? hasFlag(values, option.flags)
    : flagValue(values, option.flags) !== null;
}

function removeOption(values: string[], option: ArgOption): string[] {
  const out: string[] = [];
  const aliases = new Set(option.flags);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const name = [...aliases].find(
      (alias) => value === alias || value.startsWith(`${alias}=`),
    );
    if (!name) {
      out.push(value);
      continue;
    }
    if (value === name && option.valueHint !== null && looksLikeValue(values[i + 1])) {
      i++;
    }
  }
  return out;
}

function choicesFor(hint: string | null): string[] {
  if (!hint) return [];
  const match = hint.match(/^[<[{](.+)[>\]}]$/);
  if (!match) return [];
  return match[1]
    .split(/[|,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function quickValuesFor(option: ArgOption): string[] {
  return option.key === "ctx-size" ? ["32768", "131072", "204800"] : [];
}

function compactTokens(value: string): string {
  const tokens = Number(value);
  if (!Number.isFinite(tokens) || tokens <= 0) return value;
  return `${Math.round(tokens / 1024)}k`;
}
