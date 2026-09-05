import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Copy, Link2, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import type { PairingStatus } from "@/features/madrasati/types";
import {
  madrasatiPairingStatus,
  startMadrasatiPairing,
  revokeMadrasatiPairing,
} from "@/platform/integration/connectors/madrasati/madrasati-pairing.functions";

const PAIRING_POLL_INTERVAL_MS = 3000;
const PAIRING_COUNTDOWN_INTERVAL_MS = 1000;
const PAIRING_TTL_SECONDS = 120;

type PairingPhase =
  | { name: "loading" }
  | { name: "idle"; notice?: string }
  | { name: "starting" }
  | { name: "pending"; token: string; expiresAt: string }
  | { name: "paired"; pairing: PairingStatus }
  | { name: "error"; message: string };

function formatDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MadrasatiPairingCard() {
  const pairingStatusFn = useServerFn(madrasatiPairingStatus);
  const startPairingFn = useServerFn(startMadrasatiPairing);
  const revokePairingFn = useServerFn(revokeMadrasatiPairing);

  const [phase, setPhase] = useState<PairingPhase>({ name: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { pairing } = await pairingStatusFn();
        if (!active) return;
        applyPairingResult(pairing, setPhase);
      } catch {
        if (active) setPhase({ name: "idle" });
      }
    })();
    return () => {
      active = false;
    };
  }, [pairingStatusFn]);

  useEffect(() => {
    if (phase.name !== "pending") return undefined;
    const id = window.setInterval(() => setNow(Date.now()), PAIRING_COUNTDOWN_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase.name]);

  useEffect(() => {
    if (phase.name !== "pending") return undefined;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const { pairing } = await pairingStatusFn();
          applyPairingResult(pairing, setPhase);
        } catch {
          // keep polling; transient failures are non-fatal
        }
      })();
    }, PAIRING_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [phase.name, pairingStatusFn]);

  async function handleStart() {
    if (phase.name === "starting") return;
    setPhase({ name: "starting" });
    try {
      const result = await startPairingFn({ data: { ttlSeconds: PAIRING_TTL_SECONDS } });
      setNow(Date.now());
      setPhase({ name: "pending", token: result.token, expiresAt: result.expiresAt });
    } catch {
      setPhase({ name: "error", message: "تعذر بدء عملية الربط. حاول مرة أخرى." });
    }
  }

  async function handleRevoke() {
    if (revoking) return;
    setRevoking(true);
    try {
      await revokePairingFn({ data: {} });
      toast.success("تم إلغاء الاقتران");
      const { pairing } = await pairingStatusFn();
      applyPairingResult(pairing, setPhase);
    } catch {
      toast.error("تعذر إلغاء الربط. حاول مرة أخرى.");
    } finally {
      setRevoking(false);
    }
  }

  async function handleRetry() {
    setPhase({ name: "loading" });
    try {
      const { pairing } = await pairingStatusFn();
      applyPairingResult(pairing, setPhase);
    } catch {
      setPhase({ name: "error", message: "تعذر التحقق من حالة الربط." });
    }
  }

  async function handleCopyToken() {
    if (phase.name !== "pending") return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phase.token);
      } else {
        const area = document.createElement("textarea");
        area.value = phase.token;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      toast.success("تم نسخ رمز الاقتران");
    } catch {
      toast.error("تعذر النسخ تلقائيًا — حدّد الرمز وانسخه يدويًا");
    }
  }

  const remainingSeconds =
    phase.name === "pending"
      ? Math.max(0, Math.floor((new Date(phase.expiresAt).getTime() - now) / 1000))
      : 0;
  const remainingMinutes = Math.floor(remainingSeconds / 60);
  const remainingSecondPart = remainingSeconds % 60;

  return (
    <Card id="madrasati-pairing" className="shadow-sm border-indigo-100 bg-indigo-50/40">
      <CardContent className="p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0" />
                ربط إضافة المتصفح
              </h3>
              <p className="text-xs text-indigo-900/80 mt-1 leading-relaxed">
                اربط إضافة "ورقة مدرستي" في متصفحك بحسابك لاستقبال بيانات منصة مدرستي تلقائيًا.
              </p>
            </div>
          </div>

          {phase.name === "loading" ? (
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900/80">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              جارٍ التحقق من حالة الاقتران…
            </div>
          ) : null}

          {phase.name === "idle" ? (
            <div className="flex flex-col gap-3">
              {phase.notice ? (
                <p className="rounded-lg border border-indigo-200 bg-indigo-100/60 px-3 py-2.5 text-xs leading-relaxed text-indigo-900">
                  {phase.notice}
                </p>
              ) : null}
              <p className="text-xs leading-relaxed text-indigo-900/80">لا يوجد اقتران نشط</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  className="h-11 w-full sm:w-auto font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => {
                    void handleStart();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  بدء ربط إضافة المتصفح
                </Button>
              </div>
            </div>
          ) : null}

          {phase.name === "starting" ? (
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900/80">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              جارٍ إنشاء رمز الاقتران…
            </div>
          ) : null}

          {phase.name === "pending" ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-700 mb-2">رمز الاقتران (مرة واحدة)</p>
                <code
                  dir="ltr"
                  className="block select-all break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-900"
                >
                  {phase.token}
                </code>
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    ينتهي خلال {remainingMinutes}:{String(remainingSecondPart).padStart(2, "0")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full sm:w-auto text-xs font-bold gap-2 border-indigo-200 bg-white"
                    onClick={() => {
                      void handleCopyToken();
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    نسخ الرمز
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-indigo-900/80">
                يُستخدم الرمز مرة واحدة لربط إضافة المتصفح بحسابك. انتظر حتى تكتمل العملية، ولا
                تشاركه مع أي جهة أخرى.
              </p>
              {remainingSeconds === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-100/60 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                  انتهت صلاحية الرمز — أعد بدء الاقتران لإنشاء رمز جديد.
                </p>
              ) : null}
            </div>
          ) : null}

          {phase.name === "paired" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-900">
                    تم ربط إضافة المتصفح بحسابك
                  </p>
                  {formatDateTime(phase.pairing.pairedAt) ? (
                    <p className="mt-0.5 text-[11px] text-emerald-800/80">
                      تاريخ الربط: {formatDateTime(phase.pairing.pairedAt)}
                    </p>
                  ) : null}
                  {formatDateTime(phase.pairing.lastVerifiedAt) ? (
                    <p className="mt-0.5 text-[11px] text-emerald-800/80">
                      آخر تحقق: {formatDateTime(phase.pairing.lastVerifiedAt)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full sm:w-auto text-xs font-bold gap-2 border-red-200 bg-white text-red-600"
                  disabled={revoking}
                  onClick={() => {
                    void handleRevoke();
                  }}
                >
                  {revoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  إلغاء الاقتران
                </Button>
              </div>
            </div>
          ) : null}

          {phase.name === "error" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50/70 px-3 py-2.5">
                <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <p className="text-xs leading-relaxed text-red-800">{phase.message}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full sm:w-auto text-xs font-bold gap-2 border-indigo-200 bg-white"
                  onClick={() => {
                    void handleRetry();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  إعادة المحاولة
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function applyPairingResult(
  pairing: PairingStatus | null,
  setPhase: (phase: PairingPhase) => void,
): void {
  if (!pairing) {
    setPhase({ name: "idle" });
    return;
  }
  if (pairing.state === "paired") {
    setPhase({ name: "paired", pairing });
    return;
  }
  if (pairing.state === "expired") {
    setPhase({ name: "idle", notice: "انتهت صلاحية رمز الاقتران" });
    return;
  }
  if (pairing.state === "revoked") {
    setPhase({ name: "idle", notice: "تم إلغاء الاقتران" });
    return;
  }
  setPhase({ name: "idle", notice: "بانتظار ربط إضافة المتصفح — أعد البدء لإنشاء رمز جديد" });
}