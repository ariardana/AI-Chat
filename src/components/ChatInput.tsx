"use client";

import { Loader2, Paperclip, Send, ShieldCheck, SlidersHorizontal, SmilePlus, Square } from "lucide-react";
import { memo, useEffect, useRef } from "react";

interface ChatInputProps {
  value: string;
  disabledReason: string | null;
  generating: boolean;
  language: "en" | "id";
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export const ChatInput = memo(function ChatInput({
  value,
  disabledReason,
  generating,
  language,
  onChange,
  onSend,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [value]);

  const canSend = !generating && !disabledReason;
  const helper =
    language === "id"
      ? "Mini Open WebUI · pengaturan & chat tersimpan lokal di browser"
      : "Mini Open WebUI · settings & chats stored locally in your browser";
  const placeholder =
    language === "id"
      ? "Ketik pesan... (Enter untuk kirim, Shift+Enter untuk baris baru)"
      : "Message... (Enter to send, Shift+Enter for newline)";
  const stopTitle = language === "id" ? "Hentikan pembuatan jawaban" : "Stop generating";
  const sendTitle = language === "id" ? "Kirim pesan" : "Send message";
  const emptyReason = language === "id" ? "Ketik pesan untuk mulai." : "Type a message to start.";
  const showDisabledNotice = Boolean(disabledReason && disabledReason !== emptyReason);

  return (
    <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:px-5 sm:pb-4">
      {showDisabledNotice ? (
        <div
          className="mx-auto mb-2 max-w-5xl rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning-text)] shadow-sm"
        >
          {disabledReason}
        </div>
      ) : null}
      <form
        className="mx-auto max-w-5xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) onSend();
        }}
      >
        <div
          className="soft-focus-ring flex items-end gap-2 rounded-lg border border-transparent bg-transparent px-1 py-1 sm:px-2"
        >
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            placeholder={
              showDisabledNotice
                ? (disabledReason ?? placeholder)
                : placeholder
            }
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend) onSend();
              }
            }}
            className="max-h-[180px] min-h-8 flex-1 resize-none bg-transparent px-1 text-[14px] leading-7 text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
          {generating ? (
            <button
              type="button"
              title={stopTitle}
              onClick={onStop}
              className="soft-focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--danger)] bg-[var(--danger)] text-[var(--danger-contrast)] transition duration-150 hover:scale-[1.02] active:translate-y-0"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              title={sendTitle}
              disabled={!canSend}
              className="soft-focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-contrast)] transition duration-150 hover:scale-[1.02] hover:bg-[var(--primary-strong)] active:translate-y-0 disabled:translate-y-0 disabled:scale-100 disabled:bg-[var(--surface-elevated)] disabled:text-[var(--muted)]"
            >
              {showDisabledNotice ? <Loader2 size={16} /> : <Send size={16} />}
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-1">
            {[
              { Icon: Paperclip, label: language === "id" ? "Lampiran" : "Attachment" },
              { Icon: SmilePlus, label: language === "id" ? "Emoji" : "Emoji" },
              { Icon: SlidersHorizontal, label: language === "id" ? "Opsi" : "Options" },
            ].map(({ Icon, label }) => (
              <button
                key={label}
                type="button"
                title={label}
                className="soft-focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          <p className="flex min-w-0 items-center justify-end gap-1.5 truncate text-right text-[10px] text-[var(--muted)]">
            <ShieldCheck size={11} className="shrink-0 text-[var(--primary)]" />
            <span className="truncate">{helper}</span>
          </p>
        </div>
      </form>
    </div>
  );
});
