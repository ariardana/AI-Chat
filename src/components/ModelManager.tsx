"use client";

import { Check, DownloadCloud, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ModelManagerProps {
  models: string[];
  activeModel: string;
  fetchingModels: boolean;
  onModelsChange: (models: string[]) => void;
  onActiveModelChange: (model: string) => void;
  onFetchModels: () => Promise<void>;
  language: "en" | "id";
}

const MODEL_PAGE_SIZE = 30;

export function ModelManager({
  models,
  activeModel,
  fetchingModels,
  onModelsChange,
  onActiveModelChange,
  onFetchModels,
  language,
}: ModelManagerProps) {
  const [newModel, setNewModel] = useState("");
  const [visibleCount, setVisibleCount] = useState(MODEL_PAGE_SIZE);
  const t = {
    models: language === "id" ? "Model" : "Models",
    fetching: language === "id" ? "Mengambil" : "Fetching",
    fetch: language === "id" ? "Ambil" : "Fetch",
    addModel: language === "id" ? "Tambah model" : "Add model",
    add: language === "id" ? "Tambah" : "Add",
    empty: language === "id" ? "Belum ada model. Tambahkan di atas." : "No models yet. Add one above.",
    select: language === "id" ? "Pilih model" : "Select model",
    remove: language === "id" ? "Hapus model" : "Remove model",
    active: language === "id" ? "Aktif" : "Active",
    loadMore: language === "id" ? "Muat lagi" : "Load more",
  };
  const visibleModels = models.slice(0, visibleCount);
  const hasMoreModels = visibleModels.length < models.length;

  function addModel() {
    const model = newModel.trim();
    if (!model || models.includes(model)) return;
    const next = [...models, model];
    onModelsChange(next);
    onActiveModelChange(model);
    setNewModel("");
  }

  function updateModel(index: number, value: string) {
    const clean = value.trim();
    const next = models.map((model, current) => (current === index ? value : model));
    onModelsChange(next);
    if (models[index] === activeModel && clean) onActiveModelChange(clean);
  }

  function removeModel(model: string) {
    const next = models.filter((item) => item !== model);
    onModelsChange(next);
    if (activeModel === model) onActiveModelChange(next[0] ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          <Sparkles size={14} className="text-[var(--primary)]" />
          {t.models}
        </label>
        <button
          type="button"
          onClick={onFetchModels}
          disabled={fetchingModels}
          className="soft-focus-ring inline-flex h-9 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface-hover)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <DownloadCloud size={14} />
          {fetchingModels ? t.fetching : t.fetch}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={newModel}
          onChange={(event) => setNewModel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addModel();
            }
          }}
          placeholder="provider/model-name"
          className="soft-focus-ring min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
        />
        <button
          type="button"
          title={t.addModel}
          onClick={addModel}
          className="soft-focus-ring inline-flex h-11 shrink-0 items-center gap-1 rounded-2xl premium-gradient px-4 py-2 text-sm font-semibold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-strong)] active:translate-y-0"
        >
          <Plus size={16} />
          {t.add}
        </button>
      </div>

      <div
        className="grid max-h-72 gap-2 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 sm:grid-cols-2"
      >
        {models.length === 0 ? (
          <div className="px-3 py-3 text-sm text-[var(--muted)] sm:col-span-2">{t.empty}</div>
        ) : null}
        {visibleModels.map((model, index) => (
          <div
            key={`${model}-${index}`}
            className={cn(
              "group rounded-2xl border p-3 text-sm transition",
              activeModel === model.trim()
                ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-sm"
                : "border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)]",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                title={t.select}
                onClick={() => onActiveModelChange(model.trim())}
                className={cn(
                  "soft-focus-ring inline-flex h-8 items-center gap-2 rounded-xl border px-2.5 text-xs font-medium transition",
                  activeModel === model.trim()
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
              >
                <Check size={13} className={activeModel === model.trim() ? "opacity-100" : "opacity-35"} />
                {activeModel === model.trim() ? t.active : t.select}
              </button>
              <button
                type="button"
                title={t.remove}
                onClick={() => removeModel(model)}
                className="soft-focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[var(--muted)] opacity-100 transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              value={model}
              onChange={(event) => updateModel(index, event.target.value)}
              onBlur={(event) => updateModel(index, event.target.value.trim())}
              className="soft-focus-ring w-full rounded-xl border border-transparent bg-transparent px-2 py-1.5 font-mono text-xs text-[var(--text)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--surface)]"
            />
          </div>
        ))}
        {hasMoreModels ? (
          <button
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(current + MODEL_PAGE_SIZE, models.length))}
            className="soft-focus-ring rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-semibold text-[var(--muted-strong)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] sm:col-span-2"
          >
            {t.loadMore} ({visibleModels.length}/{models.length})
          </button>
        ) : null}
      </div>
    </div>
  );
}
