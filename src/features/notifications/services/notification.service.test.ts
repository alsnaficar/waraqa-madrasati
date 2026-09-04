import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseUserContext } from "@/platform/database/supabase/context";
import { NotificationService } from "./notification.service.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

function matchesEq(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => row[column] === value);
}

function matchesIs(row: Row, isFilters: Record<string, unknown>): boolean {
  return Object.entries(isFilters).every(([column, value]) => {
    if (value === null) return row[column] === null || row[column] === undefined;
    return row[column] === value;
  });
}

function createMockClient(tables: { notifications: Row[] }) {
  const client = {
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        isFilters: Record<string, unknown>;
        op: "select" | "update" | "insert" | null;
        patch: Record<string, unknown>;
        order: { column: string; ascending: boolean } | null;
        range: { from: number; to: number } | null;
        countExact: boolean;
        headOnly: boolean;
      } = {
        filters: {},
        isFilters: {},
        op: null,
        patch: {},
        order: null,
        range: null,
        countExact: false,
        headOnly: false,
      };

      const filterRows = (rows: Row[]): Row[] => {
        let result = [...rows];
        for (const [column, value] of Object.entries(state.filters)) {
          result = result.filter((row) => row[column] === value);
        }
        for (const [column, value] of Object.entries(state.isFilters)) {
          if (value === null) {
            result = result.filter(
              (row) => row[column] === null || row[column] === undefined,
            );
          } else {
            result = result.filter((row) => row[column] === value);
          }
        }
        return result;
      };

      const getRows = (): Row[] => {
        let rows = filterRows(tables[table as keyof typeof tables] ?? []);
        if (state.order) {
          rows.sort((a, b) => {
            const av = a[state.order!.column];
            const bv = b[state.order!.column];
            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return state.order!.ascending ? -1 : 1;
            return state.order!.ascending ? 1 : -1;
          });
        }
        return rows;
      };

      const chain = {
        select(_columns?: string, opts?: { count?: string; head?: boolean }) {
          if (state.op !== "update" && state.op !== "insert") {
            state.op = "select";
          }
          if (opts?.count === "exact") state.countExact = true;
          if (opts?.head === true) state.headOnly = true;
          return chain;
        },
        insert(patch: Record<string, unknown>) {
          state.op = "insert";
          state.patch = patch;
          return chain;
        },
        update(patch: Record<string, unknown>) {
          state.op = "update";
          state.patch = patch;
          return chain;
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value;
          return chain;
        },
        is(column: string, value: unknown) {
          state.isFilters[column] = value;
          return chain;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          state.order = { column, ascending: opts?.ascending !== false };
          return chain;
        },
        range(from: number, to: number) {
          state.range = { from, to };
          return chain;
        },
        async maybeSingle() {
          if (state.op === "update") {
            const target = tables[table as keyof typeof tables] ?? [];
            const matched = filterRows(target);
            const current = matched[0];
            if (!current) return { data: null, error: null, count: null };
            Object.assign(current, state.patch);
            return { data: { ...current }, error: null, count: null };
          }
          if (state.op === "insert") {
            const target = tables[table as keyof typeof tables] ?? [];
            const newRow: Row = {
              id: `notif-${target.length + 1}`,
              created_at: "2026-09-04T12:00:00Z",
              read_at: null,
              ...(state.patch as Row),
            };
            target.push(newRow);
            return { data: { ...newRow }, error: null, count: null };
          }
          const rows = getRows();
          return { data: rows[0] ?? null, error: null, count: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (state.op === "update") {
            const target = tables[table as keyof typeof tables] ?? [];
            const matched = filterRows(target);
            for (const row of matched) {
              Object.assign(row, state.patch);
            }
            return Promise.resolve({
              data: null,
              error: null,
              count: matched.length,
            }).then(resolve, reject);
          }

          const allRows = getRows();
          const total = allRows.length;
          let paged = allRows;
          if (state.range) {
            paged = allRows.slice(state.range.from, state.range.to + 1);
          }
          if (state.headOnly) {
            return Promise.resolve({
              data: null,
              error: null,
              count: total,
            }).then(resolve, reject);
          }
          return Promise.resolve({
            data: paged,
            error: null,
            count: state.countExact ? total : null,
          }).then(resolve, reject);
        },
      };

      return chain;
    },
  };

  return client as never;
}

function authFor(
  tables: { notifications: Row[] },
  userId = USER_A,
): SupabaseUserContext {
  return { client: createMockClient(tables), userId };
}

function notifRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "n1",
    user_id: USER_A,
    title: "اختبار",
    body: null,
    read_at: null,
    created_at: "2026-09-04T00:00:00Z",
    ...overrides,
  };
}

describe("NotificationService", () => {
  it("lists notifications for the authenticated user only", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "n1", user_id: USER_A }),
        notifRow({ id: "n2", user_id: USER_B }),
      ],
    };

    const result = await NotificationService.list(0, authFor(tables));
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0]?.id, "n1");
    assert.equal(result.total, 1);
  });

  it("orders newest first by created_at", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "old", created_at: "2026-09-01T00:00:00Z" }),
        notifRow({ id: "new", created_at: "2026-09-04T00:00:00Z" }),
        notifRow({ id: "mid", created_at: "2026-09-02T00:00:00Z" }),
      ],
    };

    const result = await NotificationService.list(0, authFor(tables));
    assert.equal(result.notifications[0]?.id, "new");
    assert.equal(result.notifications[1]?.id, "mid");
    assert.equal(result.notifications[2]?.id, "old");
  });

  it("paginates with page parameter", async () => {
    const notifs = Array.from({ length: 5 }, (_, i) =>
      notifRow({ id: `n${i}`, created_at: `2026-09-0${i + 1}T00:00:00Z` }),
    );
    const tables = { notifications: notifs };

    const page0 = await NotificationService.list(0, authFor(tables));
    assert.equal(page0.notifications.length, 5);
    assert.equal(page0.total, 5);
  });

  it("returns unread count alongside list", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "unread1", read_at: null }),
        notifRow({ id: "unread2", read_at: null }),
        notifRow({ id: "read1", read_at: "2026-09-04T00:00:00Z" }),
      ],
    };

    const result = await NotificationService.list(0, authFor(tables));
    assert.equal(result.unreadCount, 2);
  });

  it("unreadCount returns standalone count", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "u1", read_at: null }),
        notifRow({ id: "u2", read_at: null }),
        notifRow({ id: "r1", read_at: "2026-09-04T00:00:00Z" }),
      ],
    };

    const count = await NotificationService.unreadCount(authFor(tables));
    assert.equal(count, 2);
  });

  it("marks a single notification as read", async () => {
    const tables = {
      notifications: [notifRow({ id: "n1", read_at: null })],
    };

    const updated = await NotificationService.markAsRead("n1", authFor(tables));
    assert.ok(updated);
    assert.ok(updated.readAt);
    assert.equal(updated.id, "n1");
    assert.equal(tables.notifications[0]?.read_at, updated.readAt);
  });

  it("does not mark an already-read notification", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "n1", read_at: "2026-09-04T00:00:00Z" }),
      ],
    };

    const result = await NotificationService.markAsRead("n1", authFor(tables));
    assert.equal(result, null);
    assert.equal(
      tables.notifications[0]?.read_at,
      "2026-09-04T00:00:00Z",
    );
  });

  it("does not allow marking another user's notification", async () => {
    const tables = {
      notifications: [notifRow({ id: "n1", user_id: USER_B })],
    };

    const result = await NotificationService.markAsRead("n1", authFor(tables));
    assert.equal(result, null);
  });

  it("returns null for non-existent notification", async () => {
    const tables = { notifications: [] as Row[] };

    const result = await NotificationService.markAsRead("missing", authFor(tables));
    assert.equal(result, null);
  });

  it("marks all unread notifications as read", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "u1", read_at: null }),
        notifRow({ id: "u2", read_at: null }),
        notifRow({ id: "r1", read_at: "2026-09-04T00:00:00Z" }),
      ],
    };

    const count = await NotificationService.markAllAsRead(authFor(tables));
    assert.equal(count, 2);
    assert.ok(tables.notifications[0]?.read_at);
    assert.ok(tables.notifications[1]?.read_at);
    assert.equal(tables.notifications[2]?.read_at, "2026-09-04T00:00:00Z");
  });

  it("only marks the authenticated user's notifications", async () => {
    const tables = {
      notifications: [
        notifRow({ id: "mine", user_id: USER_A, read_at: null }),
        notifRow({ id: "theirs", user_id: USER_B, read_at: null }),
      ],
    };

    const count = await NotificationService.markAllAsRead(authFor(tables));
    assert.equal(count, 1);
    assert.ok(tables.notifications[0]?.read_at);
    assert.equal(tables.notifications[1]?.read_at, null);
  });

  it("returns empty result for unauthenticated context", async () => {
    const ctx: SupabaseUserContext = {
      client: createMockClient({ notifications: [notifRow()] }),
      userId: "00000000-0000-0000-0000-000000000000",
    };

    const result = await NotificationService.list(0, ctx);
    assert.equal(result.notifications.length, 0);
    assert.equal(result.total, 0);
    assert.equal(result.unreadCount, 0);
  });

  it("creates a notification for the authenticated user", async () => {
    const tables = { notifications: [] as Row[] };

    const created = await NotificationService.create(
      { title: "تم توليد ورقة عمل", body: "للدرس: درس الجلسة" },
      authFor(tables),
    );

    assert.ok(created);
    assert.equal(created.id, "notif-1");
    assert.equal(created.userId, USER_A);
    assert.equal(created.title, "تم توليد ورقة عمل");
    assert.equal(created.body, "للدرس: درس الجلسة");
    assert.equal(created.readAt, null);
    assert.ok(created.createdAt);
    assert.equal(tables.notifications.length, 1);
    assert.equal(tables.notifications[0]?.user_id, USER_A);
    assert.equal(tables.notifications[0]?.title, "تم توليد ورقة عمل");
    assert.equal(tables.notifications[0]?.body, "للدرس: درس الجلسة");
  });

  it("defaults body to null when omitted", async () => {
    const tables = { notifications: [] as Row[] };

    const created = await NotificationService.create(
      { title: "تم توليد خطة الدرس" },
      authFor(tables),
    );

    assert.ok(created);
    assert.equal(created.body, null);
    assert.equal(tables.notifications[0]?.body, null);
  });

  it("derives the recipient from the auth context, never from input", async () => {
    const tables = { notifications: [] as Row[] };
    const maliciousInput = {
      title: "تم توليد اختبار",
      body: "للدرس: درس الجلسة",
    };

    const created = await NotificationService.create(
      maliciousInput,
      authFor(tables, USER_B),
    );

    assert.ok(created);
    assert.equal(created.userId, USER_B);
    assert.equal(tables.notifications[0]?.user_id, USER_B);
  });

  it("maps row fields to domain types correctly", async () => {
    const tables = {
      notifications: [
        notifRow({
          id: "n1",
          user_id: USER_A,
          title: "عنوان",
          body: "نص الإشعار",
          read_at: "2026-09-04T12:00:00Z",
          created_at: "2026-09-04T00:00:00Z",
        }),
      ],
    };

    const result = await NotificationService.list(0, authFor(tables));
    const n = result.notifications[0]!;
    assert.equal(n.id, "n1");
    assert.equal(n.userId, USER_A);
    assert.equal(n.title, "عنوان");
    assert.equal(n.body, "نص الإشعار");
    assert.equal(n.readAt, "2026-09-04T12:00:00Z");
    assert.equal(n.createdAt, "2026-09-04T00:00:00Z");
  });
});
