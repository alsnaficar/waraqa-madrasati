/**
 * Planner schedule override persistence.
 *
 * Handles both legacy null-plan override rows and plan-scoped rows.
 * This module intentionally does not depend on planner-engine.
 */

import {
  CONFIG_SCHEDULE_OVERRIDES_DATE,
  type PlanSyncScope,
  type ScheduleOverride,
} from "./planner-types.ts";
import { resolveUserContext, type SupabaseUserContext } from "@/platform/database/supabase/context";

function createPlannerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function assertPlanSyncScope(
  scope: PlanSyncScope | undefined | null,
): PlanSyncScope {
  if (!scope?.planId || !scope.versionId || !scope.subject) {
    throw new Error(
      "مزامنة الجدول تتطلب نطاق خطة فصل صالحاً (planId و versionId و subject).",
    );
  }
  return scope;
}

function parseOverrideNotes(
  notes: string | null | undefined,
): ScheduleOverride[] {
  if (!notes) return [];

  try {
    const parsed = JSON.parse(notes) as ScheduleOverride[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Loads schedule overrides with plan/legacy compatibility.
 *
 * - Prefer plan-scoped OVERRIDES row when planId is provided.
 * - Always merge readable null-plan legacy overrides.
 * - Plan-scoped entries win on conflicting override keys.
 * - Legacy rows are never deleted here.
 */
export async function loadUserOverrides(
  planId?: string,
  context?: SupabaseUserContext,
): Promise<ScheduleOverride[]> {
  try {
    const resolved = await resolveUserContext(context);
    if (!resolved) return [];

    const { data: legacyRow } = await resolved.client
      .from("planner_entries")
      .select("notes")
      .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
      .eq("user_id", resolved.userId)
      .eq("subject", "OVERRIDES")
      .is("semester_plan_id", null)
      .maybeSingle();

    const legacy = parseOverrideNotes(legacyRow?.notes);

    if (!planId) {
      return legacy;
    }

    const { data: planRow } = await resolved.client
      .from("planner_entries")
      .select("notes")
      .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
      .eq("user_id", resolved.userId)
      .eq("subject", "OVERRIDES")
      .eq("semester_plan_id", planId)
      .maybeSingle();

    const scoped = parseOverrideNotes(planRow?.notes);

    if (scoped.length === 0) return legacy;
    if (legacy.length === 0) return scoped;

    const byKey = new Map<string, ScheduleOverride>();

    for (const item of legacy) {
      byKey.set(
        item.id ||
          `${item.type}:${item.lessonId ?? ""}:${item.lessonIdA ?? ""}`,
        item,
      );
    }

    for (const item of scoped) {
      byKey.set(
        item.id ||
          `${item.type}:${item.lessonId ?? ""}:${item.lessonIdA ?? ""}`,
        item,
      );
    }

    return [...byKey.values()];
  } catch (err) {
    console.warn("Failed to load overrides:", err);
    return [];
  }
}

/**
 * Saves overrides for a semester plan draft into the plan-scoped
 * sentinel row. Legacy null-plan rows remain untouched.
 */
export async function saveUserOverrides(
  overrides: ScheduleOverride[],
  scope?: PlanSyncScope,
  context?: SupabaseUserContext,
): Promise<void> {
  const resolvedContext = await resolveUserContext(context);
  if (!resolvedContext) throw new Error("Unauthorized");

  const resolved = assertPlanSyncScope(scope);

  const { data: existing } = await resolvedContext.client
    .from("planner_entries")
    .select("id")
    .eq("user_id", resolvedContext.userId)
    .eq("week_start_date", CONFIG_SCHEDULE_OVERRIDES_DATE)
    .eq("subject", "OVERRIDES")
    .eq("semester_plan_id", resolved.planId)
    .maybeSingle();

  const { error } = await resolvedContext.client.from("planner_entries").upsert({
    id: existing?.id ?? createPlannerId(),
    user_id: resolvedContext.userId,
    week_start_date: CONFIG_SCHEDULE_OVERRIDES_DATE,
    day_of_week: 0,
    period: 0,
    subject: "OVERRIDES",
    notes: JSON.stringify(overrides),
    semester_plan_id: resolved.planId,
    semester_plan_version_id: resolved.versionId,
  });

  if (error) throw error;
}
