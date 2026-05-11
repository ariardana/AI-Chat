"use client";

import { AlertTriangle, Bot, Check, CheckCheck, ChevronDown, Copy, Edit3, File as FileIcon, FileCode2, FileText, Image, RefreshCcw, RotateCcw, Save, Settings, Shuffle, X } from "lucide-react";
import { memo, useEffect, useMemo, useState, type ComponentType, type CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseThinkTags } from "@/lib/reasoning";
import type { Message, MessageAttachmentKind } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
  generating: boolean;
  isLastAssistant: boolean;
  language: "en" | "id";
  onEdit: (messageId: string, content: string) => void;
  onRegenerate: () => void;
  onChangeModel: () => void;
  onOpenSettings: () => void;
}

function CopyButton({
  value,
  title = "Copy",
}: {
  value: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      title={title}
      onClick={copy}
      className={cn(
        "soft-focus-ring grid h-8 w-8 place-items-center rounded-lg border border-transparent text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] active:translate-y-0",
      )}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

type HighlighterProps = {
  children: string;
  language: string;
  style: Record<string, unknown>;
  customStyle: CSSProperties;
  codeTagProps?: {
    style?: CSSProperties;
  };
  PreTag: "pre";
};

function CodeBlock({
  className,
  children,
  enableHighlight,
  uiLanguage,
}: {
  className?: string;
  children: string;
  enableHighlight: boolean;
  uiLanguage: "en" | "id";
}) {
  const [Highlighter, setHighlighter] = useState<ComponentType<HighlighterProps> | null>(null);
  const [style, setStyle] = useState<Record<string, unknown> | null>(null);
  const codeLanguage = /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";

  useEffect(() => {
    if (!enableHighlight) return;

    let mounted = true;

    Promise.all([
      import("react-syntax-highlighter").then(
        (mod) => mod.Prism as unknown as ComponentType<HighlighterProps>,
      ),
      import("react-syntax-highlighter/dist/cjs/styles/prism").then(
        (mod) => (mod.oneDark ?? mod.nord ?? mod.vscDarkPlus ?? {}) as Record<string, unknown>,
      ),
    ])
      .then(([Component, theme]) => {
        if (!mounted) return;
        setHighlighter(() => Component);
        setStyle(theme);
      })
      .catch(() => {
        if (!mounted) return;
        setHighlighter(null);
        setStyle(null);
      });

    return () => {
      mounted = false;
    };
  }, [enableHighlight]);

  const cleanCode = children.replace(/\n$/, "");

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-bg)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--code-border)] bg-[var(--code-header)] px-3 text-xs text-[var(--muted)] sm:px-4">
        <span className="font-mono uppercase">{codeLanguage}</span>
        <CopyButton
          value={cleanCode}
          title={uiLanguage === "id" ? "Salin kode" : "Copy code"}
        />
      </div>
      {enableHighlight && Highlighter && style ? (
        <Highlighter
          language={codeLanguage}
          style={style}
          customStyle={{
            margin: 0,
            background: "transparent",
            color: "var(--code-text)",
            overflowX: "auto",
            padding: "1rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.86rem",
            lineHeight: 1.75,
            WebkitOverflowScrolling: "touch",
          }}
          codeTagProps={{
            style: {
              background: "transparent",
              fontFamily: "var(--font-mono)",
            },
          }}
          PreTag="pre"
        >
          {cleanCode}
        </Highlighter>
      ) : (
        <pre className="overflow-x-auto bg-transparent p-4 font-mono text-[13px] leading-7 text-[var(--code-text)]">
          <code>{cleanCode}</code>
        </pre>
      )}
    </div>
  );
}

const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  components,
}: {
  content: string;
  components: Components;
}) {
  return (
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
});

function thinkingDurationSeconds(message: Message) {
  const startedAt = message.thinkingStartedAt ? new Date(message.thinkingStartedAt).getTime() : 0;
  const endedAt = message.thinkingEndedAt ? new Date(message.thinkingEndedAt).getTime() : Date.now();
  if (!startedAt || !Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.max(1, Math.round((endedAt - startedAt) / 1000));
}

function attachmentIcon(kind: MessageAttachmentKind) {
  if (kind === "image") return Image;
  if (kind === "pdf" || kind === "text") return FileText;
  if (kind === "code") return FileCode2;
  return FileIcon;
}

function AttachmentList({
  message,
  user,
}: {
  message: Message;
  user: boolean;
}) {
  if (!message.attachments?.length) return null;

  return (
    <div className={cn("grid gap-2", message.displayContent ? "mt-3" : "")}>
      {message.attachments.map((attachment) => {
        const Icon = attachmentIcon(attachment.kind);
        return (
          <div
            key={attachment.id}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2",
              user
                ? "border-white/20 bg-white/12 text-[var(--primary-contrast)]"
                : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)]",
            )}
          >
            <div
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                user ? "bg-white/14" : "bg-[var(--primary-soft)] text-[var(--primary)]",
              )}
            >
              <Icon size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 break-all text-xs font-medium leading-4">
                {attachment.name}
              </div>
              <div className={cn("mt-0.5 text-[10px] uppercase", user ? "opacity-75" : "text-[var(--muted)]")}>
                {attachment.kind} · {formatBytes(attachment.size)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReasoningPanel({
  message,
  reasoning,
  streaming,
  language,
}: {
  message: Message;
  reasoning: string;
  streaming: boolean;
  language: "en" | "id";
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? streaming;
  const seconds = thinkingDurationSeconds(message);

  return (
    <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]/70">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        className="soft-focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--muted)]"
      >
        <ChevronDown
          size={15}
          className={cn("shrink-0 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
        />
        <span>
          {language === "id" ? `Berpikir selama ${seconds} detik` : `Thought for ${seconds} seconds`}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mx-3 mb-3 border-l border-[var(--border)] pl-3 text-xs leading-6 text-[var(--muted)]">
            <div className="whitespace-pre-wrap break-words">{reasoning}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  generating,
  isLastAssistant,
  language,
  onEdit,
  onRegenerate,
  onChangeModel,
  onOpenSettings,
}: ChatMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.displayContent ?? message.content);

  const isUser = message.role === "user";
  const isStreamingAssistant = generating && isLastAssistant && !isUser;
  const parsedThinking = useMemo(
    () => (isUser ? { reasoning: "", answer: message.displayContent ?? message.content, hasThinking: false } : parseThinkTags(message.content)),
    [isUser, message.content, message.displayContent],
  );
  const visibleContent = isUser ? (message.displayContent ?? message.content) : parsedThinking.answer;
  const time = useMemo(
    () =>
      new Date(message.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [message.createdAt],
  );
  const markdownComponents = useMemo<Components>(
    () => ({
      a(props) {
        const { href, children, ...rest } = props;
        return (
          <a {...rest} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
          </a>
        );
      },
      code(props) {
        const { className, children, ...rest } = props;
        const text = String(children ?? "");
        const isBlock = className?.includes("language-") || text.includes("\n");

        if (isBlock) {
          return (
            <CodeBlock
              className={className}
              enableHighlight={!isStreamingAssistant}
              uiLanguage={language}
            >
              {text}
            </CodeBlock>
          );
        }

        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
    }),
    [isStreamingAssistant, language],
  );
  const t = useMemo(
    () => ({
      you: language === "id" ? "Anda" : "You",
      assistant: "Assistant",
      edit: language === "id" ? "Edit pesan" : "Edit message",
      copy: language === "id" ? "Salin pesan" : "Copy message",
      regenerate: language === "id" ? "Buat ulang" : "Regenerate",
      cancel: language === "id" ? "Batal" : "Cancel",
      save: language === "id" ? "Simpan dan buat ulang" : "Save and regenerate",
      error: language === "id" ? "Respons gagal" : "Response failed",
      errorTitle: language === "id" ? "Model tidak merespons" : "Model is not responding",
      errorMessage: language === "id"
        ? "Model mungkin overload, tidak tersedia, atau akun/provider tidak mendukung model ini."
        : "The model may be overloaded, unavailable, or unsupported by this account/provider.",
      changeModel: language === "id" ? "Ganti Model" : "Change Model",
      retry: language === "id" ? "Retry" : "Retry",
      openSettings: language === "id" ? "Buka Pengaturan" : "Open Settings",
      suggestion: language === "id" ? "Coba gunakan model lain seperti:" : "Try another model such as:",
      slow: language === "id"
        ? "Model sedang merespons lebih lama dari biasanya..."
        : "The model is taking longer than usual to respond...",
      warning: language === "id"
        ? "Respons terlalu lama. Model mungkin sibuk atau overload."
        : "The response is taking too long. The model may be busy or overloaded.",
      waiting: language === "id" ? "Masih menunggu respons model..." : "Still waiting for the model response...",
      stopped: language === "id" ? "Respons dihentikan" : "Response stopped",
    }),
    [language],
  );
  const suggestions = [
    "qwen/qwen3-coder-480b-a35",
    "moonshotai/kimi-k2.6",
    "nvidia/nemotron-3-super-120b-a12b",
  ];
  const statusText = message.requestStatus === "slow"
    ? t.slow
    : message.requestStatus === "waiting"
      ? t.waiting
      : message.requestStatus === "stopped"
        ? t.stopped
        : "";

  if (message.error && !message.content) {
    return (
      <article className="animate-soft-enter flex justify-start px-1 sm:px-3">
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--danger)]/35 bg-[var(--surface)] text-sm text-[var(--text)] shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-[var(--danger)]">
              <AlertTriangle size={17} />
              {t.errorTitle}
            </div>
          </div>
          <div className="space-y-4 p-4">
            <p className="leading-6 text-[var(--muted-strong)]">{t.errorMessage}</p>
            {message.errorMeta?.shouldSuggestModel ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-3">
                <div className="mb-2 text-xs font-semibold text-[var(--text)]">{t.suggestion}</div>
                <ul className="space-y-1.5 font-mono text-xs text-[var(--muted-strong)]">
                  {suggestions.map((model) => (
                    <li key={model}>{model}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onChangeModel}
                className="soft-focus-ring inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-contrast)] transition hover:bg-[var(--primary-strong)] active:translate-y-0"
              >
                <Shuffle size={14} />
                {t.changeModel}
              </button>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={generating}
                className="soft-focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <RefreshCcw size={14} />
                {t.retry}
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="soft-focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-hover)]"
              >
                <Settings size={14} />
                {t.openSettings}
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group animate-soft-enter flex w-full gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "mt-1 hidden h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-semibold sm:grid",
          isUser
            ? "hidden"
            : "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
          isUser && "order-2",
        )}
      >
        <Bot size={15} />
      </div>

      <div className={cn("min-w-0", isUser ? "max-w-[88%] sm:max-w-[68%]" : "max-w-full flex-1")}>
        <div className={cn("mb-1 flex items-center gap-2 text-[10px] text-[var(--muted)]", isUser && "justify-end")}>
          {!isUser ? <div className="font-medium">{t.assistant}</div> : null}
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
            {isUser ? (
              <button
                type="button"
                title={t.edit}
                disabled={generating}
                onClick={() => {
                  setDraft(message.displayContent ?? message.content);
                  setEditing(true);
                }}
                className={cn(
                  "soft-focus-ring grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] disabled:opacity-40",
                  "hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
              >
                <Edit3 size={14} />
              </button>
            ) : (
              <>
                <CopyButton value={visibleContent || message.content} title={t.copy} />
                {isLastAssistant ? (
                  <button
                    type="button"
                    title={t.regenerate}
                    disabled={generating}
                    onClick={onRegenerate}
                    className={cn(
                      "soft-focus-ring grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] disabled:opacity-40",
                      "hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                    )}
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={cn(
                "soft-focus-ring min-h-28 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm leading-6 text-[var(--text)] outline-none",
              )}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                title={t.cancel}
                onClick={() => {
                  setDraft(message.displayContent ?? message.content);
                  setEditing(false);
                }}
                className={cn(
                  "soft-focus-ring grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)]",
                  "hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                )}
              >
                <X size={16} />
              </button>
              <button
                type="button"
                title={t.save}
                onClick={() => {
                  const next = draft.trim();
                  if (!next) return;
                  setEditing(false);
                  onEdit(message.id, next);
                }}
                className="soft-focus-ring grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] transition hover:bg-[var(--primary-strong)] active:translate-y-0"
              >
                <Save size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm shadow-sm sm:px-4 sm:py-3.5",
              isUser
                ? "border-transparent bg-[linear-gradient(135deg,var(--primary),var(--primary-strong))] text-[var(--primary-contrast)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
            )}
          >
            {message.content ? (
              <>
                {!isUser && parsedThinking.hasThinking ? (
                  <ReasoningPanel
                    message={message}
                    reasoning={parsedThinking.reasoning}
                    streaming={isStreamingAssistant}
                    language={language}
                  />
                ) : null}
                {visibleContent.trim() ? (
                  <div className="markdown text-[14px]">
                    <MarkdownRenderer content={visibleContent} components={markdownComponents} />
                  </div>
                ) : null}
                {isUser ? <AttachmentList message={message} user={isUser} /> : null}
              </>
            ) : message.error ? null : message.requestStatus === "stopped" ? (
              <div className="text-xs leading-5 text-[var(--muted)]">{statusText}</div>
            ) : (
              <>
                <div className="typing-indicator flex h-6 items-center text-[var(--muted)]">
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                </div>
                {message.requestStatus === "warning" ? (
                  <div className="mt-3 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs font-medium leading-5 text-[var(--warning-text)]">
                    {t.warning}
                  </div>
                ) : statusText ? (
                  <div className="mt-2 text-xs leading-5 text-[var(--muted)]">{statusText}</div>
                ) : null}
              </>
            )}
            {message.error ? (
              <div className="mt-4 rounded-lg border border-[var(--danger)]/35 bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text)]">
                <div className="mb-1 flex items-center gap-2 font-medium text-[var(--danger)]">
                  <AlertTriangle size={16} />
                  {t.errorTitle}
                </div>
                <div className="leading-6 text-[var(--muted-strong)]">{t.errorMessage}</div>
              </div>
            ) : null}
            {message.content && !message.error && isStreamingAssistant && message.requestStatus === "warning" ? (
              <div className="mt-3 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs font-medium leading-5 text-[var(--warning-text)]">
                {t.warning}
              </div>
            ) : message.content && !message.error && isStreamingAssistant && statusText ? (
              <div className="mt-2 text-xs leading-5 text-[var(--muted)]">{statusText}</div>
            ) : message.content && !message.error && message.requestStatus === "stopped" ? (
              <div className="mt-2 text-xs leading-5 text-[var(--muted)]">{statusText}</div>
            ) : null}
            <div className={cn("mt-1 flex items-center gap-1 text-[10px]", isUser ? "justify-end text-[var(--primary-contrast)] opacity-75" : "text-[var(--muted)]")}>
              <span>{time}</span>
              {isUser ? <CheckCheck size={12} /> : null}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}, areChatMessagesEqual);

function areChatMessagesEqual(previous: ChatMessageProps, next: ChatMessageProps) {
  const generatingAffectsMessage =
    previous.isLastAssistant ||
    next.isLastAssistant ||
    previous.message.role === "user" ||
    next.message.role === "user";

  return (
    previous.message === next.message &&
    (!generatingAffectsMessage || previous.generating === next.generating) &&
    previous.isLastAssistant === next.isLastAssistant &&
    previous.language === next.language
  );
}
