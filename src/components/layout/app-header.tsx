import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/shared/ui/button";
import { BackButton } from "@/shared/components/back-button";
import { Badge } from "@/shared/ui/badge";
import { supabase } from "@/platform/database/supabase/client";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { BrandLogo } from "./brand-logo";

export function AppHeader() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useNotifications();
  const showBack = pathname !== "/dashboard";

  // Presentation only — Admin route/server still enforce authorization.
  const { data: isAdmin } = useQuery({
    queryKey: ["header-is-admin"],
    staleTime: 60_000,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.role === "admin";
    },
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("تعذّر تسجيل الخروج");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-[72px] md:h-[80px] lg:h-[88px] items-center justify-between border-b border-zinc-200/85 dark:border-zinc-800/85 bg-white/80 dark:bg-zinc-950/80 px-6 backdrop-blur-md shadow-sm transform-gpu transition-all duration-200 will-change-[transform,backdrop-filter]">
      <div className="flex items-center gap-4">
        {showBack ? <BackButton showText={false} className="me-1" /> : null}

        {/* Waraqa Official Logo in Header (Icon + Wordmark, size md, perfectly aligned and spaced) */}
        <Link to="/dashboard" className="flex items-center hover:opacity-90 transition-opacity">
          <BrandLogo size="md" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin ? (
          <Button
            variant="outline"
            className="h-11 min-h-[44px] gap-1.5 px-3 text-primary"
            onClick={() => navigate({ to: "/admin" })}
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">لوحة الإدارة</span>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-11 w-11 min-h-[44px] min-w-[44px]"
          aria-label={
            unreadCount > 0 ? `الإشعارات، ${unreadCount} غير مقروء` : "الإشعارات"
          }
          onClick={() => navigate({ to: "/notifications" })}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              aria-hidden="true"
              className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1.5 text-[10px] leading-none"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 min-h-[44px] min-w-[44px]"
          aria-label="تسجيل الخروج"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
