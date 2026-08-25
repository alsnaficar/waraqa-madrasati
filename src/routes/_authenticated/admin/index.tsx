import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Banknote,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  ShieldCheck,
  UserCog,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SectionHeader } from "@/shared/components/section-header";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

import {
  getAdminDashboardStats,
  type AdminDashboardStats,
} from "@/platform/auth/admin-access.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboardPage,
});

type MetricCard = {
  key: keyof Pick<
    AdminDashboardStats,
    | "users"
    | "teachers"
    | "admins"
    | "subscriptionsActive"
    | "subscriptionsScheduled"
    | "subscriptionsPendingPayment"
    | "subscriptionsExpired"
    | "paymentsPendingReview"
  >;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
};

const METRICS: MetricCard[] = [
  {
    key: "users",
    label: "المستخدمون",
    description: "إجمالي الحسابات",
    icon: Users,
    tone: "text-teal-700 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-300",
  },
  {
    key: "teachers",
    label: "المعلمون",
    description: "حسابات المعلمين",
    icon: GraduationCap,
    tone: "text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300",
  },
  {
    key: "admins",
    label: "المدراء",
    description: "حسابات الإدارة",
    icon: ShieldCheck,
    tone: "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300",
  },
  {
    key: "subscriptionsActive",
    label: "اشتراكات نشطة",
    description: "اشتراكات تعمل حاليًا",
    icon: CheckCircle2,
    tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  {
    key: "subscriptionsScheduled",
    label: "اشتراكات مجدولة",
    description: "تبدأ في فترة لاحقة",
    icon: Clock3,
    tone: "text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
  {
    key: "subscriptionsPendingPayment",
    label: "بانتظار الدفع",
    description: "اشتراكات لم يكتمل دفعها",
    icon: WalletCards,
    tone: "text-orange-700 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-300",
  },
  {
    key: "subscriptionsExpired",
    label: "اشتراكات منتهية",
    description: "اشتراكات انتهت مدتها",
    icon: XCircle,
    tone: "text-zinc-700 bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300",
  },
  {
    key: "paymentsPendingReview",
    label: "دفعات للمراجعة",
    description: "تحويلات تنتظر التحقق",
    icon: Banknote,
    tone: "text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300",
  },
];

function formatNumber(value: number): string {
  return value.toLocaleString("ar-SA");
}

function formatSar(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return `${amount.toLocaleString("ar-SA")} ر.س`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "published":
      return "منشور";
    case "draft":
      return "مسودة";
    case "archived":
      return "مؤرشف";
    default:
      return status || "—";
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "published":
      return "default";
    case "draft":
      return "secondary";
    case "archived":
      return "outline";
    default:
      return "secondary";
  }
}

function formatUpdatedAt(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;

    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return iso;
  }
}

function AdminDashboardPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: () => getAdminDashboardStats(),
    staleTime: 30_000,
  });

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <SectionHeader
        title="لوحة تحكم الإدارة"
        description="نظرة تشغيلية شاملة على المستخدمين والاشتراكات والدفعات والمناهج."
        action={
          <Button
            variant="outline"
            className="h-11 min-h-[44px]"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            تحديث
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">جاري تحميل بيانات لوحة الإدارة…</p>
        </div>
      ) : null}

      {isError ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg">تعذّر تحميل البيانات</CardTitle>
            <CardDescription>
              لم نتمكن من جلب مؤشرات لوحة الإدارة. تأكد من صلاحياتك كمدير نظام ثم أعد المحاولة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="h-11 min-h-[44px]" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((metric) => {
              const Icon = metric.icon;

              return (
                <Card key={metric.key} className="min-w-0 shadow-sm">
                  <CardContent className="flex min-w-0 items-center gap-3 p-4">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${metric.tone}`}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm text-muted-foreground">{metric.label}</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">
                        {formatNumber(data[metric.key])}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{metric.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-3">
            <Card className="min-w-0 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Banknote className="h-5 w-5 text-primary" aria-hidden />
                  مركز الدفعات
                </CardTitle>
                <CardDescription>
                  ملخص التحويلات البنكية التي تحتاج إلى متابعة إدارية.
                </CardDescription>
              </CardHeader>

              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">دفعات بانتظار المراجعة</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatNumber(data.paymentsPendingReview)}
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">قيمة الدفعات المعلقة</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatSar(data.paymentsPendingAmountSar)}
                  </p>
                </div>

                <Button asChild className="h-11 min-h-[44px] gap-2 sm:col-span-2">
                  <Link to="/admin/payments">
                    فتح مراجعة الدفعات
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="min-w-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <WalletCards className="h-5 w-5 text-primary" aria-hidden />
                  حالة الاشتراكات
                </CardTitle>
                <CardDescription>توزيع الاشتراكات حسب حالتها الحالية.</CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                  <span className="text-sm">نشطة</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(data.subscriptionsActive)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-indigo-50 px-3 py-2 dark:bg-indigo-950/30">
                  <span className="text-sm">مجدولة</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(data.subscriptionsScheduled)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-orange-50 px-3 py-2 dark:bg-orange-950/30">
                  <span className="text-sm">بانتظار الدفع</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(data.subscriptionsPendingPayment)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                  <span className="text-sm">منتهية</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(data.subscriptionsExpired)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="min-w-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" aria-hidden />
                  حالة المناهج
                </CardTitle>
                <CardDescription>ملخص ملفات المناهج الرسمية في النظام.</CardDescription>
              </CardHeader>

              <CardContent className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">الإجمالي</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatNumber(data.curriculumTotal)}
                  </p>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">منشورة</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatNumber(data.curriculumPublished)}
                  </p>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">مسودات</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-300">
                    {formatNumber(data.curriculumDraft)}
                  </p>
                </div>

                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">مؤرشفة</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">
                    {formatNumber(data.curriculumArchived)}
                  </p>
                </div>

                <Button asChild variant="outline" className="h-11 min-h-[44px] gap-2 col-span-2">
                  <Link to="/admin/curriculum-management">
                    إدارة المناهج
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="min-w-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden />
                  موارد النظام
                </CardTitle>
                <CardDescription>مؤشرات المحتوى التعليمي المسجل في النظام.</CardDescription>
              </CardHeader>

              <CardContent className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">الواجبات</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatNumber(data.homeworkTotal)}
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">الاختبارات</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formatNumber(data.testsTotal)}
                  </p>
                </div>

                <div className="col-span-2 rounded-xl border border-dashed p-4">
                  <p className="text-sm text-muted-foreground">إجمالي المستخدمين</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{formatNumber(data.users)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" aria-hidden />
                آخر نشاط للمناهج
              </CardTitle>
              <CardDescription>آخر ملفات المناهج التي تم تعديلها حسب وقت التحديث.</CardDescription>
            </CardHeader>

            <CardContent>
              {data.recentCurriculum.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  لا توجد ملفات مناهج بعد.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentCurriculum.map((item) => (
                    <li
                      key={item.id}
                      className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.originalName}</p>

                        <p className="text-xs text-muted-foreground">
                          {[item.subject, item.grade].filter(Boolean).join(" · ") || "بدون تصنيف"}
                          {" · "}
                          {formatUpdatedAt(item.updatedAt)}
                        </p>
                      </div>

                      <Badge variant={statusVariant(item.status)} className="w-fit shrink-0">
                        {statusLabel(item.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden />
                اختصارات الإدارة
              </CardTitle>
              <CardDescription>الوصول السريع إلى الوحدات الإدارية الحالية.</CardDescription>
            </CardHeader>

            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                <Link to="/admin/users">
                  <Users className="h-4 w-4" aria-hidden />
                  إدارة المستخدمين
                </Link>
              </Button>

              <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                <Link to="/admin/payments">
                  <Banknote className="h-4 w-4" aria-hidden />
                  مراجعة الدفعات
                </Link>
              </Button>

              <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                <Link to="/admin/curriculum-management">
                  <BookOpen className="h-4 w-4" aria-hidden />
                  إدارة المناهج
                </Link>
              </Button>

              <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                <Link to="/admin/academic-calendar">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  التقويم الدراسي
                </Link>
              </Button>

              <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                <Link to="/admin/google-sheets">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                  تكامل Google Sheets
                </Link>
              </Button>

              <Button asChild variant="outline" className="h-11 min-h-[44px] justify-start gap-2">
                <Link to="/admin">
                  <LayoutDashboard className="h-4 w-4" aria-hidden />
                  لوحة التحكم
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
