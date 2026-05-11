"use client";

import { AlertTriangle, Check, ChevronDown, FlaskConical, Search, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { getModelCapabilities, getModelCategory, getModelContextLength, getModelProvider } from "@/lib/model-info";
import type { ModelAvailability, ModelCapabilities } from "@/lib/types";
import { cn } from "@/lib/utils";

type ModelFilter = "all" | "thinking" | "coding" | "fast" | "vision";
const MODEL_PAGE_SIZE = 30;

interface ModelPickerProps {
  models: string[];
  activeModel: string;
  providerName: string;
  availability: Record<string, ModelAvailability>;
  capabilities: Record<string, ModelCapabilities>;
  checkingModels: Record<string, boolean>;
  language: "en" | "id";
  compact?: boolean;
  onSelectModel: (model: string) => void;
  onCheckModel: (model: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const STATUS_STYLES = {
  available: "bg-emerald-500/12 text-emerald-400 border-emerald-500/30",
  unavailable: "bg-rose-500/12 text-rose-400 border-rose-500/30",
  unstable: "bg-amber-500/12 text-amber-300 border-amber-500/30",
  unknown: "bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--border)]",
};

const CAPABILITY_STYLES = {
  thinking: "border-violet-400/35 bg-violet-500/12 text-violet-300",
  fast: "border-amber-400/35 bg-amber-500/12 text-amber-300",
  coding: "border-sky-400/35 bg-sky-500/12 text-sky-300",
  vision: "border-fuchsia-400/35 bg-fuchsia-500/12 text-fuchsia-300",
  longContext: "border-emerald-400/35 bg-emerald-500/12 text-emerald-300",
  recommended: "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
  unknown: "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
};

function isStale(availability?: ModelAvailability) {
  if (!availability?.checkedAt) return true;
  return Date.now() - new Date(availability.checkedAt).getTime() > 24 * 60 * 60 * 1000;
}

export const ModelPicker = memo(function ModelPicker({
  models,
  activeModel,
  providerName,
  availability,
  capabilities,
  checkingModels,
  language,
  compact = false,
  onSelectModel,
  onCheckModel,
  onOpenChange,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ModelFilter>("all");
  const [visibleCount, setVisibleCount] = useState(MODEL_PAGE_SIZE);
  const [pendingUnavailable, setPendingUnavailable] = useState<string | null>(null);
  const isIndonesian = language === "id";
  const t = {
    model: isIndonesian ? "Model aktif" : "Active model",
    search: isIndonesian ? "Cari model" : "Search models",
    all: isIndonesian ? "Semua" : "All",
    available: isIndonesian ? "Bisa digunakan" : "Available",
    unavailable: isIndonesian ? "Tidak tersedia" : "Unavailable",
    unstable: isIndonesian ? "Tidak stabil" : "Unstable",
    unknown: isIndonesian ? "Belum dicek" : "Unchecked",
    codingFilter: "Coding",
    thinkingFilter: "Thinking",
    fastFilter: "Fast",
    visionFilter: "Vision",
    fast: isIndonesian ? "⚡ Cepat" : "⚡ Fast",
    thinking: "🧠 Thinking",
    coding: "💻 Coding",
    vision: "👁 Vision",
    longContext: isIndonesian ? "📚 Konteks panjang" : "📚 Long Context",
    recommended: "⭐ Recommended",
    unknownCapability: "Unknown",
    test: isIndonesian ? "Tes" : "Test",
    testing: isIndonesian ? "..." : "...",
    context: "Context",
    noModel: isIndonesian ? "Tidak ada model" : "No model",
    close: isIndonesian ? "Tutup model picker" : "Close model picker",
    warning: isIndonesian
      ? "Model ini kemungkinan tidak bisa digunakan di akun/provider ini."
      : "This model likely cannot be used with this account/provider.",
    keep: isIndonesian ? "Tetap pilih" : "Select anyway",
    chooseOther: isIndonesian ? "Pilih lain" : "Choose other",
    empty: isIndonesian ? "Tidak ada model yang cocok." : "No matching models.",
    loadMore: isIndonesian ? "Muat lagi" : "Load more",
  };

  const filteredModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return models.filter((model) => {
      const modelCapabilities = getModelCapabilities(model, capabilities[model]);
      if (normalized && !model.toLowerCase().includes(normalized) && !getModelProvider(model).toLowerCase().includes(normalized)) {
        return false;
      }
      if (filter === "thinking") return Boolean(modelCapabilities.thinking);
      if (filter === "coding") return Boolean(modelCapabilities.coding);
      if (filter === "fast") return Boolean(modelCapabilities.fast);
      if (filter === "vision") return Boolean(modelCapabilities.vision);
      return true;
    });
  }, [capabilities, filter, models, query]);

  const visibleModels = filteredModels.slice(0, visibleCount);
  const hasMoreModels = visibleModels.length < filteredModels.length;
  const activeAvailability = availability[activeModel]?.status ?? "unknown";
  const statusLabel = activeAvailability === "available"
    ? t.available
    : activeAvailability === "unavailable"
      ? t.unavailable
      : activeAvailability === "unstable"
        ? t.unstable
        : t.unknown;

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    setVisibleCount(MODEL_PAGE_SIZE);
  }, [filter, open, query]);

  useEffect(() => {
    if (!open) return;
    for (const model of visibleModels.slice(0, 6)) {
      if (checkingModels[model]) continue;
      if (getModelCategory(model) === "embedding") continue;
      if (isStale(availability[model])) onCheckModel(model);
    }
  }, [availability, checkingModels, onCheckModel, open, visibleModels]);

  function chooseModel(model: string) {
    if ((availability[model]?.status ?? "unknown") === "unavailable") {
      setPendingUnavailable(model);
      return;
    }
    onSelectModel(model);
    setOpen(false);
  }

  function confirmUnavailableModel() {
    if (!pendingUnavailable) return;
    onSelectModel(pendingUnavailable);
    setPendingUnavailable(null);
    setOpen(false);
  }

  function showMoreModels() {
    setVisibleCount((current) => Math.min(current + MODEL_PAGE_SIZE, filteredModels.length));
  }

  function handleModelListScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!hasMoreModels) return;
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < 320) showMoreModels();
  }

  const filters: Array<{ id: ModelFilter; label: string }> = [
    { id: "all", label: t.all },
    { id: "thinking", label: t.thinkingFilter },
    { id: "coding", label: t.codingFilter },
    { id: "fast", label: t.fastFilter },
    { id: "vision", label: t.visionFilter },
  ];

  function capabilityBadges(model: string) {
    const modelCapabilities = getModelCapabilities(model, capabilities[model]);
    const badges = [
      modelCapabilities.thinking
        ? {
            key: "thinking",
            label: t.thinking,
            title: isIndonesian ? "Model mendukung reasoning/thinking" : "Model supports reasoning/thinking",
          }
        : null,
      modelCapabilities.fast
        ? {
            key: "fast",
            label: t.fast,
            title: isIndonesian ? "Model cepat untuk respons interaktif" : "Fast model for interactive responses",
          }
        : null,
      modelCapabilities.coding
        ? {
            key: "coding",
            label: t.coding,
            title: isIndonesian ? "Model kuat untuk coding" : "Strong model for coding",
          }
        : null,
      modelCapabilities.vision
        ? {
            key: "vision",
            label: t.vision,
            title: isIndonesian ? "Model mendukung input visual" : "Model supports vision input",
          }
        : null,
      modelCapabilities.longContext
        ? {
            key: "longContext",
            label: t.longContext,
            title: isIndonesian ? "Model mendukung konteks panjang" : "Model supports long context",
          }
        : null,
      modelCapabilities.recommended
        ? {
            key: "recommended",
            label: t.recommended,
            title: isIndonesian ? "Model rekomendasi untuk aplikasi ini" : "Recommended model for this app",
          }
        : null,
    ].filter(Boolean) as Array<{ key: keyof typeof CAPABILITY_STYLES; label: string; title: string }>;

    return badges.length
      ? badges
      : [{ key: "unknown" as const, label: t.unknownCapability, title: isIndonesian ? "Capability model belum diketahui" : "Model capability is unknown" }];
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "soft-focus-ring flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] text-left transition hover:bg-[var(--surface-hover)]",
          compact ? "px-3 py-2" : "px-3 py-3",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-medium uppercase text-[var(--muted)]">{t.model}</span>
          <span className="mt-1 block truncate font-mono text-[11px] text-[var(--muted-strong)]">
            {activeModel || t.noModel}
          </span>
          <span className={cn("mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[activeAvailability])}>
            {statusLabel}
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-x-hidden bg-[var(--backdrop)] p-0 sm:items-center sm:p-4 sm:backdrop-blur-sm">
          <button
            type="button"
            aria-label={t.close}
            onClick={() => setOpen(false)}
            className="absolute inset-0"
          />
          <section className="animate-soft-enter fixed inset-x-0 bottom-0 flex h-[85dvh] max-h-[85dvh] w-full max-w-full flex-col overflow-hidden overflow-x-hidden rounded-t-3xl border border-b-0 border-x-0 border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl sm:relative sm:inset-auto sm:h-auto sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-2xl sm:border">
            <header className="sticky top-0 z-10 shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 pb-3 pt-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t.model}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{providerName || getModelProvider(activeModel)}</div>
                </div>
                <button
                  type="button"
                  title={t.close}
                  onClick={() => setOpen(false)}
                  className="soft-focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="sticky top-0 z-10 mt-4 bg-[var(--surface)]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.search}
                  className="soft-focus-ring h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] pl-9 pr-3 text-sm outline-none placeholder:text-[var(--muted)]"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 overflow-x-hidden pb-1">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      "soft-focus-ring h-7 shrink-0 rounded-lg border px-2.5 text-[11px] font-semibold transition",
                      filter === item.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </header>

            <div
              onScroll={handleModelListScroll}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-4"
            >
              {filteredModels.length ? (
                <div className="grid max-w-full gap-2 overflow-x-hidden">
                  {visibleModels.map((model) => {
                    const selected = model === activeModel;
                    const category = getModelCategory(model);
                    const provider = getModelProvider(model);
                    const context = getModelContextLength(model);
                    const status = availability[model]?.status ?? "unknown";
                    const label = status === "available"
                      ? t.available
                      : status === "unavailable"
                        ? t.unavailable
                        : status === "unstable"
                          ? t.unstable
                          : t.unknown;

                    return (
                      <div
                        key={model}
                        className={cn(
                          "max-w-full overflow-hidden rounded-lg border bg-[var(--surface-elevated)] p-3 transition",
                          selected ? "border-[var(--primary)] shadow-[var(--shadow-glow)]" : "border-[var(--border)]",
                        )}
                      >
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                          <button
                            type="button"
                            onClick={() => chooseModel(model)}
                            className="soft-focus-ring min-w-0 flex-1 text-left"
                          >
                            <div className="flex min-w-0 items-start gap-2">
                              <div className="min-w-0 max-w-full overflow-hidden break-all font-mono text-xs font-semibold leading-5 text-[var(--text)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                {model}
                              </div>
                              {selected ? <Check size={15} className="shrink-0 text-[var(--primary)]" /> : null}
                            </div>
                            <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 overflow-hidden">
                              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--muted)]">
                                {provider}
                              </span>
                              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--muted-strong)]">
                                {category}
                              </span>
                              <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", STATUS_STYLES[status])}>
                                {label}
                              </span>
                              {context ? (
                                <span className="text-[10px] text-[var(--muted)]">
                                  {t.context}: {context}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 overflow-hidden">
                              {capabilityBadges(model).map((badge) => (
                                <span
                                  key={badge.key}
                                  title={badge.title}
                                  className={cn(
                                    "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                                    CAPABILITY_STYLES[badge.key],
                                  )}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCheckModel(model)}
                            disabled={checkingModels[model] || category === "embedding"}
                            className="soft-focus-ring inline-flex h-7 shrink-0 items-center gap-1 self-end rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-hover)] disabled:opacity-50 sm:self-start"
                          >
                            <FlaskConical size={12} />
                            {checkingModels[model] ? t.testing : t.test}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {hasMoreModels ? (
                    <button
                      type="button"
                      onClick={showMoreModels}
                      className="soft-focus-ring mt-1 h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    >
                      {t.loadMore} ({visibleModels.length}/{filteredModels.length})
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                  {t.empty}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {pendingUnavailable ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[var(--backdrop)] p-4">
          <div className="mx-auto w-[calc(100vw-32px)] max-w-[420px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--text)]">{t.unavailable}</div>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)] sm:text-sm sm:leading-6">{t.warning}</p>
                <div className="mt-3 max-w-full overflow-hidden break-all rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--muted-strong)]">
                  {pendingUnavailable}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingUnavailable(null)}
                className="soft-focus-ring h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--text)] sm:w-auto"
              >
                {t.chooseOther}
              </button>
              <button
                type="button"
                onClick={confirmUnavailableModel}
                className="soft-focus-ring h-11 w-full rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-contrast)] sm:w-auto"
              >
                {t.keep}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});
