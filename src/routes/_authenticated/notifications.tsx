import { createFileRoute } from "@tanstack/react-router";

import { PageShell } from "@/components/layout/page-shell";
import { NotificationsPageContent } from "@/features/notifications/components/notifications-page-content";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "الإشعارات | ورقة" },
      {
        name: "description",
        content: "إشعارات وتنبيهات المعلم في منصة ورقة.",
      },
    ],
  }),
});

function NotificationsPage() {
  return (
    <PageShell>
      <NotificationsPageContent />
    </PageShell>
  );
}
