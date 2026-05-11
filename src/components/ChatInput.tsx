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
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
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
    <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 sm:px-5 sm:pb-4">
      {showDisabledNotice ? (
        <div
          className="mx-auto mb-2 max-w-5xl rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning-text)] shadow-sm"
        >
          {disabledReason}
        </div>
      ) : null}
      <form
        className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div
          className="soft-focus-ring flex items-end gap-2 rounded-xl border border-transparent bg-transparent px-1 py-1"
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
            className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[14px] leading-6 text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
          {generating ? (
            <button
              type="button"
              title={stopTitle}
              onClick={onStop}
              className="soft-focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--danger)] bg-[var(--danger)] text-[var(--danger-contrast)] transition duration-150 hover:scale-[1.02] active:scale-95"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              title={sendTitle}
              disabled={!canSend}
              className="soft-focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-contrast)] transition duration-150 hover:scale-[1.02] hover:bg-[var(--primary-strong)] active:scale-95 disabled:translate-y-0 disabled:scale-100 disabled:bg-[var(--surface-elevated)] disabled:text-[var(--muted)]"
            >
              {showDisabledNotice ? <Loader2 size={16} /> : <Send size={16} />}
            </button>
          )}
        </div>
      </form>
      <p className="mx-auto mt-2 max-w-5xl text-center text-[10px] leading-4 text-[var(--muted)]">
        Created by Ari
      </p>
    </div>
  );
});
