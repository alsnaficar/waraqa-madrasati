import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NotificationService } from "../services/notification.service";

export function notificationsQueryKey(page: number) {
  return ["notifications", page] as const;
}

export function notificationsUnreadQueryKey() {
  return ["notifications", "unread-count"] as const;
}

/**
 * Paginated notifications list + unread count + mark-as-read mutations.
 *
 * Ownership stays inside NotificationService — no user_id argument.
 */
export function useNotifications(page = 0) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: notificationsQueryKey(page),
    staleTime: 30_000,
    queryFn: () => NotificationService.list(page),
  });

  const unreadQuery = useQuery({
    queryKey: notificationsUnreadQueryKey(),
    staleTime: 30_000,
    queryFn: () => NotificationService.unreadCount(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markAsRead = useMutation({
    mutationFn: (id: string) => NotificationService.markAsRead(id),
    onSuccess: invalidate,
  });

  const markAllAsRead = useMutation({
    mutationFn: () => NotificationService.markAllAsRead(),
    onSuccess: invalidate,
  });

  return {
    items: query.data?.notifications ?? [],
    total: query.data?.total ?? 0,
    unreadCount: unreadQuery.data ?? query.data?.unreadCount ?? 0,
    loading: query.isPending,
    error: query.error,
    refresh: invalidate,
    markAsRead,
    markAllAsRead,
  };
}
