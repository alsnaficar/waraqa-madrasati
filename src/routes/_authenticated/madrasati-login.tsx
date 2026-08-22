import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Info, School } from "lucide-react";
import { Button } from "@/shared/ui/button";

const MADRASATI_LOGIN_URL =
  "https://schools.madrasati.sa/Auth/SignIn";

export const Route = createFileRoute("/_authenticated/madrasati-login")({
  component: MadrasatiLoginRoute,
});

function MadrasatiLoginRoute() {
  const navigate = useNavigate();

  function openMadrasati() {
    window.open(
      MADRASATI_LOGIN_URL,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-dvh bg-background px-4 py-8 sm:px-6"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <School className="h-6 w-6 text-primary" />
            </div>

            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">
                تسجيل الدخول إلى مدرستي
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                سيتم فتح صفحة تسجيل الدخول الرسمية لمنصة مدرستي في
                متصفحك.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                <div className="space-y-2 text-sm leading-6">
                  <p className="font-semibold">
                    تسجيل الدخول يتم مباشرة في مدرستي
                  </p>

                  <p className="text-muted-foreground">
                    لن تمر كلمة المرور أو رمز التحقق عبر ورقة.
                    أدخل بياناتك فقط في صفحة مدرستي الرسمية.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="h-12 w-full font-bold"
              onClick={openMadrasati}
            >
              <ExternalLink className="h-5 w-5" />
              فتح تسجيل الدخول إلى مدرستي
            </Button>

            <p className="text-center text-xs leading-5 text-muted-foreground">
              ستفتح مدرستي في تبويب جديد.
            </p>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 w-full"
              onClick={() => void navigate({ to: "/dashboard" })}
            >
              العودة إلى ورقة
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
