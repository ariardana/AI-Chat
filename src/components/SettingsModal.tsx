"use client";

import {
  AlertTriangle,
  Bot,
  Cloud,
  FileDown,
  FileUp,
  Globe2,
  Info,
  Keyboard,
  MessageSquare,
  Monitor,
  Moon,
  RotateCcw,
  Settings,
  Shield,
  Sun,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ModelManager } from "@/components/ModelManager";
import { ModelPicker } from "@/components/ModelPicker";
import type { ModelAvailability, ModelCapabilities, ProviderSettings } from "@/lib/types";

interface SettingsModalProps {
  open: boolean;
  initialSection?: SettingsSection;
  settings: ProviderSettings;
  fetchingModels: boolean;
  serverKeyAvailable: boolean;
  customKeyAvailable: boolean;
  modelAvailability: Record<string, ModelAvailability>;
  modelCapabilities: Record<string, ModelCapabilities>;
  checkingModels: Record<string, boolean>;
  importError: string | null;
  onClose: () => void;
  onSettingsChange: (settings: ProviderSettings) => void;
  onFetchModels: () => Promise<void>;
  onActiveModelChange: (model: string) => void;
  onCheckModel: (model: string) => void;
  onCustomApiKeySave: (apiKey: string) => Promise<void>;
  onCustomApiKeyClear: () => Promise<void>;
  onExport: () => void;
  onImportText: (text: string) => void;
}

type SettingsSection = "general" | "model" | "provider" | "appearance" | "chat" | "shortcuts" | "privacy" | "about";

const fieldClass =
  "soft-focus-ring h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none";
const cardClass =
  "w-full max-w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 sm:p-4";
const iconButtonClass =
  "soft-focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <Icon size={15} className="shrink-0 text-[var(--muted)]" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text)]">{title}</div>
        <div className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</div>
      </div>
      <div
        className={[
          "relative h-5 w-9 shrink-0 rounded-full border transition",
          checked
            ? "border-[var(--primary)] bg-[var(--primary)]"
            : "border-[var(--border)] bg-[var(--surface)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--surface)] shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

export function SettingsModal({
  open,
  initialSection,
  settings,
  fetchingModels,
  serverKeyAvailable,
  customKeyAvailable,
  modelAvailability,
  modelCapabilities,
  checkingModels,
  importError,
  onClose,
  onSettingsChange,
  onFetchModels,
  onActiveModelChange,
  onCheckModel,
  onCustomApiKeySave,
  onCustomApiKeyClear,
  onExport,
  onImportText,
}: SettingsModalProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const isIndonesian = settings.language === "id";
  const maskedApiKey = customKeyAvailable || serverKeyAvailable
      ? "nvapi-************"
      : "";
  const t = {
    settings: isIndonesian ? "Pengaturan" : "Settings",
    subtitle: isIndonesian ? "Kelola preferensi aplikasi" : "Manage app preferences",
    close: isIndonesian ? "Tutup pengaturan" : "Close settings",
    apiWarning: isIndonesian
      ? "Konfigurasi NVIDIA_API_KEY di server atau tambahkan custom API key untuk browser ini."
      : "Configure NVIDIA_API_KEY on the server or add a custom API key for this browser.",
    keyStatus: isIndonesian ? "Key aktif" : "Active key",
    serverKey: isIndonesian ? "Server env key" : "Server env key",
    customKey: isIndonesian ? "Custom key lokal" : "Local custom key",
    noKey: isIndonesian ? "Belum ada key" : "No key configured",
    saveKey: isIndonesian ? "Pakai key" : "Use key",
    clearKey: isIndonesian ? "Hapus custom key" : "Clear custom key",
    general: isIndonesian ? "Umum" : "General",
    model: "Model",
    provider: "Provider",
    appearance: isIndonesian ? "Tampilan" : "Appearance",
    chat: "Chat",
    shortcuts: isIndonesian ? "Pintasan" : "Shortcuts",
    privacy: isIndonesian ? "Data & Privasi" : "Data & Privacy",
    about: isIndonesian ? "Tentang" : "About",
    profile: "Profil",
    identity: isIndonesian ? "Kelola identitas Anda" : "Manage your identity",
    providerName: isIndonesian ? "Nama provider" : "Provider name",
    baseUrl: "Base URL",
    apiKey: "API key",
    activeModel: isIndonesian ? "Model aktif" : "Active model",
    language: isIndonesian ? "Bahasa" : "Language",
    regional: isIndonesian ? "Bahasa & Regional" : "Language & Regional",
    theme: isIndonesian ? "Tema" : "Theme",
    dark: isIndonesian ? "Gelap" : "Dark",
    light: isIndonesian ? "Terang" : "Light",
    system: "System",
    compact: "Kompak",
    compactDesc: isIndonesian ? "Gunakan ukuran antarmuka yang lebih rapat" : "Use denser interface spacing",
    temperature: "Temperature",
    maxTokens: "Max tokens",
    systemPrompt: "System prompt",
    exportJson: isIndonesian ? "Ekspor Pengaturan" : "Export Settings",
    importJson: isIndonesian ? "Impor Pengaturan" : "Import Settings",
    reset: isIndonesian ? "Reset ke Default" : "Reset to Default",
    cancel: isIndonesian ? "Batal" : "Cancel",
    saveChanges: isIndonesian ? "Simpan Perubahan" : "Save Changes",
    local: "Lokal",
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Contextual settings actions intentionally select a tab as the modal opens.
    if (open && initialSection) setActiveSection(initialSection);
  }, [initialSection, open]);

  if (!open) return null;

  function update<K extends keyof ProviderSettings>(key: K, value: ProviderSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  async function saveApiKey() {
    const key = apiKeyDraft.trim();
    if (!key) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      await onCustomApiKeySave(key);
      setApiKeyDraft("");
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Failed to save API key.");
    } finally {
      setSavingKey(false);
    }
  }

  async function clearApiKey() {
    setSavingKey(true);
    setKeyError(null);
    try {
      await onCustomApiKeyClear();
      setApiKeyDraft("");
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : "Failed to clear API key.");
    } finally {
      setSavingKey(false);
    }
  }

  const navItems: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
    { id: "general", label: t.general, icon: Settings },
    { id: "model", label: t.model, icon: Bot },
    { id: "provider", label: t.provider, icon: Cloud },
    { id: "appearance", label: t.appearance, icon: Monitor },
    { id: "chat", label: t.chat, icon: MessageSquare },
    { id: "shortcuts", label: t.shortcuts, icon: Keyboard },
    { id: "privacy", label: t.privacy, icon: Shield },
    { id: "about", label: t.about, icon: Info },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-[var(--backdrop)] p-0 sm:items-center sm:p-4 sm:backdrop-blur-sm">
      <div className="flex h-dvh max-h-dvh w-full max-w-full overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-5xl sm:rounded-2xl">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-3 md:flex">
          <div className="mb-4 flex items-center gap-3 px-2 py-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-elevated)] text-[var(--text)]">
              <Settings size={17} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--text)]">{t.settings}</div>
              <div className="truncate text-[11px] text-[var(--muted)]">{t.subtitle}</div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={[
                    "soft-focus-ring flex h-10 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm transition",
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs">
            <div className="text-[var(--muted)]">Info Aplikasi</div>
            <div className="mt-2 flex items-center gap-2 text-[var(--text)]">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
              Mini Open WebUI
            </div>
            <div className="mt-3 text-[var(--muted)]">Versi</div>
            <div className="text-[var(--text)]">1.0.0</div>
            <div className="mt-3 text-[var(--muted)]">Mode</div>
            <div className="inline-flex rounded-md bg-[var(--primary-soft)] px-2 py-1 text-[var(--primary)]">
              {t.local}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:h-14 sm:px-6">
            <div className="min-w-0">
              <div className="text-base font-semibold text-[var(--text)] sm:text-lg">
                {navItems.find((item) => item.id === activeSection)?.label ?? t.settings}
              </div>
              <div className="text-xs text-[var(--muted)] md:hidden">{t.subtitle}</div>
            </div>
            <button type="button" title={t.close} onClick={onClose} className={iconButtonClass}>
              <X size={17} />
            </button>
          </header>

          <div className="flex max-w-full snap-x gap-1.5 overflow-x-auto overflow-y-hidden border-b border-[var(--border)] px-3 py-2 md:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={[
                    "soft-focus-ring inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-lg border px-2.5 text-[11px]",
                    active
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--muted)]",
                  ].join(" ")}
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-6">
            {!customKeyAvailable && !serverKeyAvailable && activeSection !== "about" ? (
              <div className="mb-4 flex gap-3 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning-text)]">
                <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                <span>{t.apiWarning}</span>
              </div>
            ) : null}

            {activeSection === "general" ? (
              <div className="space-y-3 sm:space-y-4">
                <div className={cardClass}>
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-[var(--text)]">{t.profile}</div>
                    <div className="text-xs text-[var(--muted)]">{t.identity}</div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--primary),var(--primary-strong))] text-2xl font-semibold text-[var(--primary-contrast)]">
                      {settings.providerName.slice(0, 1).toUpperCase() || "N"}
                    </div>
                    <label className="min-w-0 flex-1 space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.providerName}</span>
                      <input
                        value={settings.providerName}
                        onChange={(event) => update("providerName", event.target.value)}
                        className={fieldClass}
                      />
                    </label>
                  </div>
                </div>

                <div className={cardClass}>
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-[var(--text)]">{t.regional}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {isIndonesian ? "Atur bahasa dan preferensi regional" : "Set language and regional preferences"}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.language}</span>
                      <select
                        value={settings.language}
                        onChange={(event) => update("language", event.target.value === "id" ? "id" : "en")}
                        className={fieldClass}
                      >
                        <option value="en">English</option>
                        <option value="id">Bahasa Indonesia</option>
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">Zona Waktu</span>
                      <select value="gmt7" onChange={() => undefined} className={fieldClass}>
                        <option value="gmt7">(GMT+07:00) Jakarta</option>
                      </select>
                    </label>
                  </div>
                </div>

                <AppearanceSettings settings={settings} update={update} labels={t} />
                <ChatPreferenceCard isIndonesian={isIndonesian} />
                <DataActions
                  labels={t}
                  importError={importError}
                  fileRef={fileRef}
                  onExport={onExport}
                  onImportText={onImportText}
                />
              </div>
            ) : null}

            {activeSection === "model" ? (
              <div className="space-y-3">
                <div className={cardClass}>
                  <ModelPicker
                    models={settings.models}
                    activeModel={settings.activeModel}
                    providerName={settings.providerName}
                    availability={modelAvailability}
                    capabilities={modelCapabilities}
                    checkingModels={checkingModels}
                    language={settings.language}
                    onSelectModel={onActiveModelChange}
                    onCheckModel={onCheckModel}
                  />
                </div>
                <div className={cardClass}>
                  <ModelManager
                    models={settings.models}
                    activeModel={settings.activeModel}
                    fetchingModels={fetchingModels}
                    onModelsChange={(models) => {
                      const clean = models.map((model) => model.trim()).filter(Boolean);
                      update("models", Array.from(new Set(clean)));
                    }}
                    onActiveModelChange={(model) => update("activeModel", model)}
                    onFetchModels={onFetchModels}
                    language={settings.language}
                  />
                </div>
              </div>
            ) : null}

            {activeSection === "provider" ? (
              <div className="space-y-3 sm:space-y-4">
                <div className={cardClass}>
                  <div className="mb-4 text-sm font-semibold text-[var(--text)]">Provider</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.providerName}</span>
                      <input
                        value={settings.providerName}
                        onChange={(event) => update("providerName", event.target.value)}
                        className={fieldClass}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.baseUrl}</span>
                      <input
                        value={settings.baseUrl}
                        onChange={(event) => update("baseUrl", event.target.value)}
                        className={`${fieldClass} font-mono text-xs`}
                      />
                    </label>
                    <label className="space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.apiKey}</span>
                      <div className="space-y-2">
                        <input
                          value={apiKeyDraft}
                          type="password"
                          autoComplete="off"
                          placeholder={
                            customKeyAvailable
                              ? "Using local custom key"
                              : serverKeyAvailable
                                ? "Using NVIDIA_API_KEY from server"
                              : "nvapi-..."
                          }
                          onChange={(event) => setApiKeyDraft(event.target.value)}
                          className={`${fieldClass} min-w-0 flex-1 font-mono text-xs`}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!apiKeyDraft.trim() || savingKey}
                            onClick={saveApiKey}
                            className="soft-focus-ring h-9 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingKey ? "..." : t.saveKey}
                          </button>
                          {customKeyAvailable ? (
                            <button
                              type="button"
                              disabled={savingKey}
                              onClick={clearApiKey}
                              className="soft-focus-ring h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t.clearKey}
                            </button>
                          ) : null}
                        </div>
                        <div className="flex min-h-7 flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)]">
                          <span>{t.keyStatus}:</span>
                          <span className="font-medium text-[var(--text)]">
                            {customKeyAvailable ? t.customKey : serverKeyAvailable ? t.serverKey : t.noKey}
                          </span>
                          {maskedApiKey ? (
                            <span className="font-mono text-[var(--muted-strong)]">{maskedApiKey}</span>
                          ) : null}
                        </div>
                        {keyError ? (
                          <div className="rounded-lg border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-xs text-[var(--danger-contrast)]">
                            {keyError}
                          </div>
                        ) : null}
                      </div>
                    </label>
                    <div className="space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.activeModel}</span>
                      <ModelPicker
                        models={settings.models}
                        activeModel={settings.activeModel}
                        providerName={settings.providerName}
                        availability={modelAvailability}
                        capabilities={modelCapabilities}
                        checkingModels={checkingModels}
                        language={settings.language}
                        onSelectModel={onActiveModelChange}
                        onCheckModel={onCheckModel}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "appearance" ? <AppearanceSettings settings={settings} update={update} labels={t} /> : null}

            {activeSection === "chat" ? (
              <div className="space-y-3 sm:space-y-4">
                <ChatPreferenceCard isIndonesian={isIndonesian} />
                <div className={cardClass}>
                  <div className="mb-4 text-sm font-semibold text-[var(--text)]">Generation</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.temperature}</span>
                      <input
                        value={settings.temperature}
                        min={0}
                        max={2}
                        step={0.1}
                        type="number"
                        onChange={(event) => update("temperature", Number(event.target.value))}
                        className={fieldClass}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.maxTokens}</span>
                      <input
                        value={settings.maxTokens}
                        min={1}
                        step={1}
                        type="number"
                        onChange={(event) => update("maxTokens", Number(event.target.value))}
                        className={fieldClass}
                      />
                    </label>
                    <label className="space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-[var(--muted)]">{t.systemPrompt}</span>
                      <textarea
                        value={settings.systemPrompt}
                        rows={5}
                        onChange={(event) => update("systemPrompt", event.target.value)}
                        className="soft-focus-ring w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm leading-6 text-[var(--text)] outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "shortcuts" ? (
              <div className={cardClass}>
                <div className="mb-4 text-sm font-semibold text-[var(--text)]">{t.shortcuts}</div>
                {[
                  ["Enter", isIndonesian ? "Kirim pesan" : "Send message"],
                  ["Shift + Enter", isIndonesian ? "Baris baru" : "New line"],
                  ["Esc", isIndonesian ? "Tutup dialog" : "Close dialog"],
                ].map(([keys, label]) => (
                  <div key={keys} className="flex items-center justify-between border-t border-[var(--border)] py-3 first:border-t-0">
                    <span className="text-sm text-[var(--text)]">{label}</span>
                    <kbd className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--muted)]">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            ) : null}

            {activeSection === "privacy" ? (
              <DataActions
                labels={t}
                importError={importError}
                fileRef={fileRef}
                onExport={onExport}
                onImportText={onImportText}
              />
            ) : null}

            {activeSection === "about" ? (
              <div className={cardClass}>
                <div className="mb-3 text-sm font-semibold text-[var(--text)]">Mini Open WebUI</div>
                <div className="space-y-2 text-sm text-[var(--muted)]">
                  <div>Versi 1.0.0</div>
                  <div>{isIndonesian ? "Mode penyimpanan lokal browser." : "Browser-local storage mode."}</div>
                  <div>{isIndonesian ? "Kompatibel dengan API OpenAI-compatible." : "Compatible with OpenAI-compatible APIs."}</div>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="sticky bottom-0 z-20 grid shrink-0 grid-cols-3 gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:flex sm:items-center sm:justify-between sm:px-6 sm:py-3">
            <button
              type="button"
              className="soft-focus-ring inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--text)] hover:bg-[var(--surface-hover)] sm:h-9 sm:px-3 sm:text-xs"
            >
              <RotateCcw size={14} className="shrink-0" />
              <span className="truncate">{t.reset}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="soft-focus-ring h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--text)] hover:bg-[var(--surface-hover)] sm:h-9 sm:px-4 sm:text-xs"
            >
              <span className="block truncate">{t.cancel}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="soft-focus-ring h-10 min-w-0 rounded-lg bg-[var(--primary)] px-2 text-[11px] font-semibold text-[var(--primary-contrast)] hover:bg-[var(--primary-strong)] sm:h-9 sm:px-4 sm:text-xs"
            >
              <span className="block truncate">{t.saveChanges}</span>
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function AppearanceSettings({
  settings,
  update,
  labels,
}: {
  settings: ProviderSettings;
  update: <K extends keyof ProviderSettings>(key: K, value: ProviderSettings[K]) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className={cardClass}>
      <div className="mb-4">
        <div className="text-sm font-semibold text-[var(--text)]">{labels.appearance}</div>
        <div className="text-xs text-[var(--muted)]">Sesuaikan tampilan aplikasi</div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { value: "light", label: labels.light, icon: Sun },
          { value: "dark", label: labels.dark, icon: Moon },
          { value: "system", label: labels.system, icon: Monitor },
        ].map((item) => {
          const Icon = item.icon;
          const active = settings.theme === item.value || (item.value === "system" && false);
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                if (item.value !== "system") update("theme", item.value as ProviderSettings["theme"]);
              }}
              className={[
                "soft-focus-ring flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] transition sm:h-16 sm:text-xs",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]",
              ].join(" ")}
            >
              <Icon size={18} />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <ToggleRow icon={Monitor} title={labels.compact} description={labels.compactDesc} checked={false} />
      </div>
    </div>
  );
}

function ChatPreferenceCard({ isIndonesian }: { isIndonesian: boolean }) {
  return (
    <div className={cardClass}>
      <div className="mb-4">
        <div className="text-sm font-semibold text-[var(--text)]">Chat</div>
        <div className="text-xs text-[var(--muted)]">
          {isIndonesian ? "Pengaturan pengalaman chat Anda" : "Tune your chat experience"}
        </div>
      </div>
      <ToggleRow
        icon={MessageSquare}
        title={isIndonesian ? "Simpan riwayat chat secara otomatis" : "Automatically save chat history"}
        description={isIndonesian ? "Chat akan otomatis disimpan ke perangkat" : "Chats are saved locally on this device"}
        checked
      />
      <ToggleRow
        icon={Globe2}
        title={isIndonesian ? "Tampilkan waktu pada pesan" : "Show message timestamps"}
        description={isIndonesian ? "Menampilkan waktu di bawah setiap pesan" : "Display time under each message"}
        checked
      />
      <ToggleRow
        icon={Monitor}
        title={isIndonesian ? "Gunakan Markdown" : "Use Markdown"}
        description={isIndonesian ? "Aktifkan dukungan format Markdown" : "Enable Markdown formatting"}
        checked
      />
      <ToggleRow
        icon={Bot}
        title={isIndonesian ? "Getaran saat respons selesai" : "Haptic response complete"}
        description={isIndonesian ? "Berikan getaran ringan saat AI selesai merespons" : "Vibrate lightly when the response completes"}
        checked={false}
      />
    </div>
  );
}

function DataActions({
  labels,
  importError,
  fileRef,
  onExport,
  onImportText,
}: {
  labels: Record<string, string>;
  importError: string | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onImportText: (text: string) => void;
}) {
  return (
    <div className={cardClass}>
      <div className="mb-4">
        <div className="text-sm font-semibold text-[var(--text)]">Lainnya</div>
        <div className="text-xs text-[var(--muted)]">Pengaturan tambahan</div>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          className="soft-focus-ring flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--danger)] hover:bg-[var(--surface-hover)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <Trash2 size={15} />
            <span className="truncate">Hapus semua chat</span>
          </span>
          <span className="shrink-0 rounded-md border border-[var(--danger)] px-2 py-1 text-xs">Hapus</span>
        </button>
        <button
          type="button"
          onClick={onExport}
          className="soft-focus-ring flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <FileDown size={15} />
            <span className="truncate">{labels.exportJson}</span>
          </span>
          <span className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs">Ekspor</span>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="soft-focus-ring flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <FileUp size={15} />
            <span className="truncate">{labels.importJson}</span>
          </span>
          <span className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs">Impor</span>
        </button>
      </div>
      {importError ? (
        <div className="mt-3 rounded-lg border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-sm text-[var(--danger-contrast)]">
          {importError}
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          onImportText(await file.text());
        }}
      />
    </div>
  );
}
