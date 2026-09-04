import { useState } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import { EmptyState } from "@/shared/components/empty-state";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

import type { Notification } from "../services/notification.service";
import { useNotifications } from "../hooks/useNotifications";
import { useNotificationsRealtime } from "../hooks/useNotificationsRealtime";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function NotificationsPageContent() {
  const [page, setPage] = useState(0);

  useNotificationsRealtime();

  const {
    items,
    total,
    unreadCount,
    loading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications(page);

  const hasUnread = unreadCount > 0;
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-w-0 space-y-4" dir="rtl">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">الإشعارات</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                آخر التحديثات والتنبيهات.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasUnread ? (
              <Badge variant="secondary" className="min-h-11 px-3 text-sm">
                {unreadCount} غير مقروء
              </Badge>
            ) : null}
            {hasUnread ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
              >
                <CheckCheck className="h-4 w-4" />
                قراءة الكل
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-1"
              onClick={() => refresh()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : error ? (
        <EmptyState
          icon={Bell}
          title="حدث خطأ"
          description={error instanceof Error ? error.message : "حاول مرة أخرى."}
          action={
            <Button type="button" className="min-h-11" onClick={() => refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="لا توجد إشعارات"
          description="ستظهر تنبيهاتك هنا فور توفرها."
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                onMarkAsRead={() => markAsRead.mutate(item.id)}
                isMarking={markAsRead.isPending}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <nav aria-label="ترقيم الصفحات" className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <span className="min-w-[4rem] text-center text-sm text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function NotificationCard({
  item,
  onMarkAsRead,
  isMarking,
}: {
  item: Notification;
  onMarkAsRead: () => void;
  isMarking: boolean;
}) {
  const isUnread = item.readAt === null;

  return (
    <Card
      className={`min-w-0 overflow-hidden ${
        isUnread ? "border-r-2 border-r-primary" : "opacity-75"
      }`}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isUnread ? (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />
              ) : null}
              <h2
                className={`text-base ${
                  isUnread ? "font-bold" : "font-medium"
                }`}
              >
                {item.title}
              </h2>
            </div>
            {item.body ? (
              <p className="text-sm text-muted-foreground">{item.body}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {formatDate(item.createdAt)}
            </p>
          </div>
        </div>

        {isUnread ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full gap-1 sm:w-auto"
            onClick={onMarkAsRead}
            disabled={isMarking}
          >
            <CheckCheck className="h-4 w-4" />
            تم القراءة
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
