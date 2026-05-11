"use client";

import { File as FileIcon, FileCode2, FileText, Image, Loader2, Paperclip, Send, Square, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageAttachmentKind } from "@/lib/types";
import { formatBytes, makeId } from "@/lib/utils";

const TEXT_PREVIEW_LIMIT = 18_000;
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "log"]);
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);

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

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function getAttachmentKind(file: File): MessageAttachmentKind {
  const extension = fileExtension(file.name);
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || extension === "pdf") return "pdf";
  if (CODE_EXTENSIONS.has(extension)) return "code";
  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) return "text";
  return "file";
}

function attachmentIcon(kind: MessageAttachmentKind) {
  if (kind === "image") return Image;
  if (kind === "pdf" || kind === "text") return FileText;
  if (kind === "code") return FileCode2;
  return FileIcon;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [value]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  const hasDraft = Boolean(value.trim() || attachments.length);
  const canSend = !generating && !disabledReason && hasDraft && !readingFiles;
  const placeholder =
    language === "id"
      ? "Ketik pesan... (Enter untuk kirim, Shift+Enter untuk baris baru)"
      : "Message... (Enter to send, Shift+Enter for newline)";
  const stopTitle = language === "id" ? "Hentikan pembuatan jawaban" : "Stop generating";
  const sendTitle = language === "id" ? "Kirim pesan" : "Send message";
  const uploadTitle = language === "id" ? "Tambah file" : "Add file";
  const showDisabledNotice = Boolean(disabledReason);
  const accept = [
    "image/*",
    "application/pdf",
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".log",
    ".json",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".html",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".php",
    ".rb",
    ".swift",
    ".kt",
    ".sql",
    ".sh",
    ".yaml",
    ".yml",
    ".toml",
    ".xml",
  ].join(",");

  const readFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setReadingFiles(true);

    try {
      const nextAttachments = await Promise.all(
        Array.from(files).map(async (file) => {
          const kind = getAttachmentKind(file);
          const attachment: ComposerAttachment = {
            id: makeId(),
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            kind,
            previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
          };

          if (kind === "text" || kind === "code") {
            const text = await file.text();
            attachment.textPreview = text.slice(0, TEXT_PREVIEW_LIMIT);
            attachment.truncated = text.length > TEXT_PREVIEW_LIMIT;
          }

          return attachment;
        }),
      );

      setAttachments((current) => [...current, ...nextAttachments]);
    } finally {
      setReadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  }, []);

  const attachmentPreview = useMemo(() => attachments.slice(0, 6), [attachments]);

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend(attachments);
    clearAttachments();
  }, [attachments, canSend, clearAttachments, onSend]);

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
        {attachmentPreview.length ? (
          <div className="mb-2 grid max-h-40 gap-2 overflow-y-auto overflow-x-hidden px-1 sm:grid-cols-2">
            {attachmentPreview.map((attachment) => {
              const Icon = attachmentIcon(attachment.kind);
              return (
                <div
                  key={attachment.id}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2"
                >
                  {attachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Object URLs are local previews, not optimized remote assets.
                    <img
                      src={attachment.previewUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                      <Icon size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-all text-xs font-medium leading-4 text-[var(--text)]">
                      {attachment.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase text-[var(--muted)]">
                      <span>{attachment.kind}</span>
                      <span>·</span>
                      <span>{formatBytes(attachment.size)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    title={language === "id" ? "Hapus file" : "Remove file"}
                    onClick={() => removeAttachment(attachment.id)}
                    className="soft-focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:scale-95"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })}
            {attachments.length > attachmentPreview.length ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                +{attachments.length - attachmentPreview.length} file
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          className="soft-focus-ring flex items-end gap-2 rounded-xl border border-transparent bg-transparent px-1 py-1"
        >
          <button
            type="button"
            title={uploadTitle}
            onClick={() => fileInputRef.current?.click()}
            className="soft-focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:scale-95"
          >
            {readingFiles ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(event) => {
              void readFiles(event.target.files);
            }}
          />
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
