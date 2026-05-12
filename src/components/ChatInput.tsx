"use client";

import { Loader2, Send, Square } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";
import type { MessageAttachmentKind } from "@/lib/types";

export interface ComposerAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  kind: MessageAttachmentKind;
  previewUrl?: string;
  textPreview?: string;
  truncated?: boolean;
}

interface ChatInputProps {
  value: string;
  disabledReason: string | null;
  generating: boolean;
  language: "en" | "id";
  onChange: (value: string) => void;
  onSend: (attachments: ComposerAttachment[]) => void;
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
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [value]);

  const hasDraft = Boolean(value.trim());
  const canSend = !generating && !disabledReason && hasDraft;
  const placeholder =
    language === "id"
      ? "Ketik pesan... (Enter untuk kirim, Shift+Enter untuk baris baru)"
      : "Message... (Enter to send, Shift+Enter for newline)";
  const stopTitle = language === "id" ? "Hentikan pembuatan jawaban" : "Stop generating";
  const sendTitle = language === "id" ? "Kirim pesan" : "Send message";
  const showDisabledNotice = Boolean(disabledReason);

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend([]);
  }, [canSend, onSend]);

  return (
    <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-1 sm:px-5 sm:pb-3 sm:pt-1.5">
      {showDisabledNotice ? (
        <div
          className="mx-auto mb-2 max-w-5xl rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning-text)] shadow-sm"
        >
          {disabledReason}
        </div>
      ) : null}
      <form
        className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-[0_10px_34px_rgb(0_0_0_/_0.18)] sm:p-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className="soft-focus-ring relative min-h-12 rounded-xl border border-transparent bg-transparent"
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
                submit();
              }
            }}
            className="block max-h-[120px] min-h-12 w-full resize-none overflow-y-auto bg-transparent py-3 pl-2.5 pr-12 text-[15px] leading-[1.35] text-[var(--text)] outline-none placeholder:text-[13px] placeholder:text-[var(--muted)] sm:min-h-10 sm:py-2.5 sm:pl-2 sm:pr-11 sm:text-sm sm:leading-5"
          />
          {generating ? (
            <button
              type="button"
              title={stopTitle}
              onClick={onStop}
              className="soft-focus-ring absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl border border-[var(--danger)] bg-[var(--danger)] text-[var(--danger-contrast)] transition duration-150 hover:scale-[1.02] active:scale-95"
            >
              <Square size={17} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              title={sendTitle}
              disabled={!canSend}
              className="soft-focus-ring absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-contrast)] transition duration-150 hover:scale-[1.02] hover:bg-[var(--primary-strong)] active:scale-95 disabled:translate-y-0 disabled:scale-100 disabled:bg-[var(--surface-elevated)] disabled:text-[var(--muted)]"
            >
              {showDisabledNotice ? <Loader2 size={17} /> : <Send size={17} />}
            </button>
          )}
        </div>
      </form>
    </div>
  );
});
