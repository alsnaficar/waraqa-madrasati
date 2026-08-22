import { createFileRoute, Link } from "@tanstack/react-router";
import { School, Info, CheckCircle2, Loader2 } from "lucide-react";

import { useMadrasatiAuthenticationStatus } from "@/platform/integration/connectors/madrasati/use-madrasati-authentication-status";
import { MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE } from "@/platform/integration/connectors/madrasati/madrasati-status";
import { Card, CardContent } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

export const Route = createFileRoute("/connect-school")({
  component: ConnectSchoolPage,
});

function ConnectSchoolPage() {
  const statusQuery = useMadrasatiAuthenticationStatus();

  const connected =
    statusQuery.data?.hasSession === true &&
    statusQuery.data?.authenticationState === "authenticated";

  return (
    <div className="container mx-auto max-w-3xl p-4 sm:p-6">
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <School className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">مزامنة منصة مدرستي</h1>
              <p className="mt-1 text-muted-foreground">حالة جلسة مدرستي الحالية في الخادم.</p>
            </div>
          </div>

          {statusQuery.isPending ? (
            <div className="flex items-center gap-2 rounded-lg border p-4">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="font-medium">جارٍ التحقق من جلسة مدرستي</p>
            </div>
          ) : connected ? (
            <div className="space-y-4 rounded-lg border border-green-200 bg-green-50/70 p-4 dark:border-green-900/40 dark:bg-green-950/20">
              <p className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                مدرستي مرتبطة
              </p>

              <p className="text-sm leading-relaxed text-muted-foreground">
                توجد جلسة متصفح مدرستي مصادق عليها على الخادم، ويمكن استخدام جلسة المتصفح الحالية
                للتحقق من استخراج البيانات.
              </p>

              <Button asChild className="min-h-[44px] w-full font-bold">
                <Link to="/settings">تحقق من استخراج مدرستي</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="flex items-center gap-2 font-medium">
                <Info className="h-4 w-4 shrink-0" />
                حالة الربط
              </p>

              <p className="font-medium text-amber-900 dark:text-amber-300">
                {MADRASATI_BROWSER_SYNC_NOT_READY_MESSAGE}
              </p>

              <p className="text-xs leading-relaxed text-muted-foreground">
                لا توجد حالياً جلسة مدرستي مصادق عليها لهذا المستخدم. سجّل الدخول إلى مدرستي من خلال
                المسار المخصص، ثم ستظهر جلسة المتصفح هنا تلقائياً.
              </p>

              <Button asChild variant="outline" className="h-11 w-full font-bold">
                <Link to="/madrasati-login">تسجيل الدخول إلى مدرستي</Link>
              </Button>
            </div>
          )}

          <Button asChild variant="outline" className="h-11 w-full font-bold">
            <Link to="/settings">العودة إلى الإعدادات</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
