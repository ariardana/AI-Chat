"use client";

import { ChevronDown } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface ScrollToBottomButtonProps {
  visible: boolean;
  hasNewMessages: boolean;
  language: "en" | "id";
  onClick: () => void;
}

export const ScrollToBottomButton = memo(function ScrollToBottomButton({
  visible,
  hasNewMessages,
  language,
  onClick,
}: ScrollToBottomButtonProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      title={language === "id" ? "Scroll ke bawah" : "Scroll to bottom"}
      onClick={onClick}
      className={cn(
        "soft-focus-ring absolute bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] right-4 z-20",
        "flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[var(--border)]",
        "bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] px-3 text-[var(--text)] shadow-[0_14px_36px_rgb(0_0_0/0.24)] backdrop-blur-md",
        "transition duration-150 hover:-translate-y-0.5 hover:bg-[var(--surface-elevated)] active:translate-y-0 active:scale-95",
      )}
    >
      {hasNewMessages ? (
        <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary-contrast)]">
          {language === "id" ? "Pesan baru" : "New messages"}
        </span>
      ) : null}
      <ChevronDown size={18} />
    </button>
  );
});
