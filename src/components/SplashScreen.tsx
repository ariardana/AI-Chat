"use client";

import { RefreshCw, Settings, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface SplashScreenProps {
  providerName?: string;
  failed?: boolean;
  errorText?: string | null;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

const loadingSteps = ["Memuat pengaturan", "Mengambil daftar model", "Menyiapkan chat"];

export function SplashScreen({
  providerName = "AI",
  failed = false,
  errorText,
  onRetry,
  onOpenSettings,
}: SplashScreenProps) {
  const [showSlowHint, setShowSlowHint] = useState(false);
  const providerInitial = providerName.trim().slice(0, 1).toUpperCase() || "AI";

  useEffect(() => {
    if (failed) return;

    const timeout = window.setTimeout(() => setShowSlowHint(true), 5_000);
    return () => window.clearTimeout(timeout);
  }, [failed]);

  return (
    <main
      className="relative grid h-dvh min-h-dvh w-full place-items-center overflow-hidden bg-[#05070b] px-4 text-white"
      style={{
        paddingTop: "max(20px, env(safe-area-inset-top))",
        paddingBottom: "max(20px, env(safe-area-inset-bottom))",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 24%, rgba(52, 211, 153, 0.16), transparent 34%), radial-gradient(circle at 22% 82%, rgba(56, 189, 248, 0.08), transparent 30%), radial-gradient(circle at 86% 72%, rgba(168, 85, 247, 0.08), transparent 28%), #05070b",
        }}
      />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/10" />

      <section className="splash-fade-in relative z-10 flex w-full max-w-[440px] flex-col items-center text-center">
        <div className="relative grid h-24 w-24 place-items-center">
          <div className="splash-ring absolute inset-0 rounded-full" />
          <div className="splash-logo-pulse grid h-16 w-16 place-items-center rounded-2xl border border-white/12 bg-white/[0.06] shadow-[0_16px_60px_rgba(0,0,0,0.36)]">
            <Sparkles size={24} className="text-emerald-200" />
          </div>
          <div className="absolute -right-1 bottom-3 grid h-7 min-w-7 place-items-center rounded-full border border-white/15 bg-[#10151d] px-2 text-[10px] font-semibold text-emerald-100 shadow-lg">
            {providerInitial}
          </div>
        </div>

        <div className="mt-5">
          <h1 className="text-[1.68rem] font-semibold leading-tight tracking-normal text-white sm:text-[1.9rem]">
            Mini Open WebUI
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">Menyiapkan workspace AI...</p>
        </div>

        <ol className="mt-6 grid w-full gap-2.5 text-left">
          {loadingSteps.map((step, index) => (
            <li
              key={step}
              className="splash-step flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 text-xs text-slate-300"
              style={{ animationDelay: `${index * 180}ms` }}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] text-emerald-100">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">{step}</span>
              <span className="loading-dot text-emerald-300" />
            </li>
          ))}
        </ol>

        <div className="splash-preview mt-6 w-full overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.035] p-3 text-left shadow-[0_20px_80px_rgba(0,0,0,0.22)]">
          <div className="flex h-8 items-center gap-2 border-b border-white/[0.07] pb-3">
            <span className="h-5 w-5 rounded-md bg-white/[0.08]" />
            <span className="splash-skeleton h-2.5 w-24 rounded-full" />
            <span className="ml-auto h-5 w-5 rounded-md bg-white/[0.08]" />
          </div>
          <div className="space-y-3 py-4">
            <div className="flex gap-2">
              <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-300/15" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="splash-skeleton h-2.5 w-11/12 rounded-full" />
                <div className="splash-skeleton h-2.5 w-7/12 rounded-full" />
              </div>
            </div>
            <div className="ml-auto w-3/4 space-y-2 rounded-lg bg-white/[0.055] p-3">
              <div className="splash-skeleton h-2.5 w-full rounded-full" />
              <div className="splash-skeleton h-2.5 w-2/3 rounded-full" />
            </div>
          </div>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/15 px-3">
            <span className="splash-skeleton h-2.5 flex-1 rounded-full" />
            <span className="h-6 w-6 rounded-md bg-emerald-300/20" />
          </div>
        </div>

        {showSlowHint && !failed ? (
          <p className="mt-4 max-w-sm text-balance text-xs leading-5 text-slate-400">
            Masih menyiapkan, periksa koneksi/API key jika terlalu lama.
          </p>
        ) : null}

        {failed ? (
          <div className="mt-5 w-full">
            <p className="mx-auto max-w-sm text-balance text-xs leading-5 text-rose-100/85">
              {errorText || "Inisialisasi belum berhasil."}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={onRetry}
                className="soft-focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 active:translate-y-0"
              >
                <RefreshCw size={16} />
                Coba lagi
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="soft-focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.09] active:translate-y-0"
              >
                <Settings size={16} />
                Buka pengaturan
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
