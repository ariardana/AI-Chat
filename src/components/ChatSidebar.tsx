"use client";

import { Bot, ChevronRight, Edit3, Menu, MessageSquare, MessageSquarePlus, Search, Settings, Trash2, X } from "lucide-react";
import { ModelPicker } from "@/components/ModelPicker";
import type { Chat, ModelAvailability, ModelCapabilities, ProviderSettings } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";

interface ChatSidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  settings: ProviderSettings;
  searchQuery: string;
  mobileOpen?: boolean;
  onSearchChange: (value: string) => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onClearChats: () => void;
  onSettings: () => void;
  onCloseMobile?: () => void;
  onActiveModelChange: (model: string) => void;
  modelAvailability: Record<string, ModelAvailability>;
  modelCapabilities: Record<string, ModelCapabilities>;
  checkingModels: Record<string, boolean>;
  onCheckModel: (model: string) => void;
  language: "en" | "id";
}

export function ChatSidebar({
  chats,
  activeChatId,
  settings,
  searchQuery,
  mobileOpen = true,
  onSearchChange,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onClearChats,
  onSettings,
  onCloseMobile,
  onActiveModelChange,
  modelAvailability,
  modelCapabilities,
  checkingModels,
  onCheckModel,
  language,
}: ChatSidebarProps) {
  const t = {
    newChat: language === "id" ? "Chat baru" : "New chat",
    provider: "Provider",
    noModel: language === "id" ? "Tidak ada model" : "No model",
    search: language === "id" ? "Cari chat" : "Search chats",
    deleteChat: language === "id" ? "Hapus chat" : "Delete chat",
    noMatch: language === "id" ? "Tidak ada chat yang cocok." : "No matching chats.",
    noChats: language === "id" ? "Belum ada chat." : "No chats yet.",
    settings: language === "id" ? "Pengaturan" : "Settings",
    clearAll: language === "id" ? "Hapus semua chat" : "Clear All Chats",
    openMenu: language === "id" ? "Buka menu" : "Open menu",
    closeMenu: language === "id" ? "Tutup menu" : "Close menu",
  };
  const normalized = searchQuery.trim().toLowerCase();
  const filteredChats = normalized
    ? chats.filter(
        (chat) =>
          chat.title.toLowerCase().includes(normalized) ||
          chat.messages.some((message) => message.content.toLowerCase().includes(normalized)),
      )
    : chats;

  return (
    <aside
      className={cn(
        "glass-panel flex h-full w-[18rem] max-w-[88vw] shrink-0 flex-col rounded-none border-y-0 border-l-0 text-[var(--foreground)]",
        "fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:h-dvh md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-[var(--border)] px-3">
        <button
          type="button"
          title={t.closeMenu}
          onClick={onCloseMobile}
          className="soft-focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] md:hidden"
        >
          <X size={18} />
        </button>
        <div className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted-strong)] md:grid">
          <Menu size={18} />
        </div>
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--primary)] text-[var(--primary-contrast)]">
          <Bot size={15} />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {settings.providerName || t.provider}
        </div>
        <button
          type="button"
          title={t.newChat}
          onClick={onNewChat}
          className="soft-focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <Edit3 size={16} />
        </button>
      </div>

      <div className="space-y-2 border-b border-[var(--border)] p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="soft-focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--surface-hover)]"
        >
          <MessageSquarePlus size={15} />
          {t.newChat}
        </button>
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t.search}
            className="soft-focus-ring h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] pl-9 pr-3 text-xs text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {filteredChats.length ? (
          filteredChats.map((chat) => (
            <div key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  onSelectChat(chat.id);
                  onCloseMobile?.();
                }}
                className={cn(
                  "soft-focus-ring mb-1 flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2.5 text-left text-xs transition",
                  activeChatId === chat.id
                    ? "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
              >
                <MessageSquare size={14} className="shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{chat.title}</span>
                  <span className="block truncate text-[10px] leading-5 text-[var(--muted)]">
                    {shortDate(chat.updatedAt)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                title={t.deleteChat}
                onClick={() => onDeleteChat(chat.id)}
                className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] group-hover:grid"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        ) : (
          <div className="px-3 py-8 text-center text-xs text-[var(--muted)]">
            {searchQuery ? t.noMatch : t.noChats}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-[var(--border)] p-3">
        <ModelPicker
          models={settings.models}
          activeModel={settings.activeModel}
          providerName={settings.providerName}
          availability={modelAvailability}
          capabilities={modelCapabilities}
          checkingModels={checkingModels}
          compact
          language={language}
          onSelectModel={onActiveModelChange}
          onCheckModel={onCheckModel}
        />
        <button
          type="button"
          onClick={onSettings}
          className="soft-focus-ring flex h-9 w-full items-center gap-2 rounded-lg border border-transparent px-2.5 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <Settings size={15} />
          {t.settings}
        </button>
        <button
          type="button"
          onClick={onClearChats}
          disabled={!chats.length}
          className="soft-focus-ring flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-xs text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--danger)] disabled:opacity-45"
        >
          <Trash2 size={14} />
          {t.clearAll}
        </button>
        <div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-full border border-[var(--primary)] text-xs font-semibold text-[var(--primary)]">
            N
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{settings.providerName || t.provider}</div>
            <div className="text-[10px] text-[var(--muted)]">Pro</div>
          </div>
          <ChevronRight size={14} className="text-[var(--muted)]" />
        </div>
      </div>
    </aside>
  );
}

export function MobileMenuButton({
  onClick,
  language,
}: {
  onClick: () => void;
  language: "en" | "id";
}) {
  return (
    <button
      type="button"
      title={language === "id" ? "Buka menu" : "Open menu"}
      onClick={onClick}
      className="soft-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted)] leading-none transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:scale-95 md:hidden"
    >
      <Menu size={18} />
    </button>
  );
}
