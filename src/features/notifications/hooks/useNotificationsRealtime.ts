import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/platform/database/supabase/client";

/**
 * Subscribes to Supabase Realtime INSERT events on `public.notifications`
 * for the authenticated user and invalidates the notification query cache
 * on each new notification.
 *
 * This hook is side-effect only — it returns nothing. Mount it once in a
 * layout that is always visible when the user is authenticated (e.g. the
 * authenticated layout or the notifications page).
 *
 * - The user_id is obtained from `supabase.auth.getUser()`, never from
 *   component props.
 * - RLS remains the server-side authorization boundary.
 * - The channel is filtered by `user_id=eq.<uuid>` so the client only
 *   receives its own notifications.
 * - On unmount or user change the previous channel is torn down via
 *   `supabase.removeChannel()`.
 */
export function useNotificationsRealtime(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user) return;

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queryClient]);
}