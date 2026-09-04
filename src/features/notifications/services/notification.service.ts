import {
  resolveUserContext,
  type SupabaseUserContext,
} from "@/platform/database/supabase/context";
import type { Database } from "@/platform/database/supabase/types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}

const PAGE_SIZE = 20;

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Authenticated-user notification service.
 *
 * Every query is scoped to the authenticated user via SupabaseUserContext.
 * The user_id is never accepted from client input.
 */
export class NotificationService {
  /**
   * List notifications for the authenticated user, newest first.
   * Returns paginated results with total count and unread count.
   */
  static async list(
    page = 0,
    context?: SupabaseUserContext,
  ): Promise<NotificationListResult> {
    const resolved = await resolveUserContext(context);
    if (!resolved) {
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await resolved.client
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", resolved.userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const { count: unreadCount, error: unreadError } = await resolved.client
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", resolved.userId)
      .is("read_at", null);

    if (unreadError) throw unreadError;

    return {
      notifications: (data ?? []).map(toNotification),
      total: count ?? 0,
      unreadCount: unreadCount ?? 0,
    };
  }

  /**
   * Count of unread notifications for the authenticated user.
   */
  static async unreadCount(
    context?: SupabaseUserContext,
  ): Promise<number> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return 0;

    const { count, error } = await resolved.client
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", resolved.userId)
      .is("read_at", null);

    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Mark a single notification as read. Only succeeds if the notification
   * belongs to the authenticated user.
   *
   * @returns The updated notification, or null if not found or not owned.
   */
  static async markAsRead(
    id: string,
    context?: SupabaseUserContext,
  ): Promise<Notification | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", resolved.userId)
      .is("read_at", null)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toNotification(data) : null;
  }

  /**
   * Mark all of the authenticated user's unread notifications as read.
   *
   * @returns The number of notifications that were marked.
   */
  static async markAllAsRead(
    context?: SupabaseUserContext,
  ): Promise<number> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return 0;

    const unread = await this.unreadCount(resolved);
    if (unread === 0) return 0;

    const { error } = await resolved.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", resolved.userId)
      .is("read_at", null);

    if (error) throw error;
    return unread;
  }

  /**
   * Create a notification for the authenticated user.
   *
   * The recipient is always the authenticated user resolved from the auth
   * context — user_id is never accepted from client input. RLS
   * (`auth.uid() = user_id`) remains the write boundary, so self-recipient
   * writes through this service succeed while cross-user writes are still
   * rejected server-side.
   *
   * @returns The created notification, or null if unauthenticated.
   */
  static async create(
    params: { title: string; body?: string | null },
    context?: SupabaseUserContext,
  ): Promise<Notification | null> {
    const resolved = await resolveUserContext(context);
    if (!resolved) return null;

    const { data, error } = await resolved.client
      .from("notifications")
      .insert({
        user_id: resolved.userId,
        title: params.title,
        body: params.body ?? null,
      })
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data ? toNotification(data) : null;
  }
}
