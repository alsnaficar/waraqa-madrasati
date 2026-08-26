/**
 * Adapter between the official resolved academic calendar and planner config.
 *
 * This module owns planner-facing calendar configuration only.
 * Official calendar resolution remains in resolve-calendar.ts.
 *
 * No planner-engine dependency is allowed here.
 */
import type {
  CalendarAcademicYear,
  CalendarTerm,
} from "./calendar.service.ts";
import {
  resolveCalendar,
  resolveCalendarForPlan,
  type ResolvedCalendar,
} from "./resolve-calendar.ts";
import type { SupabaseUserContext } from "@/platform/database/supabase/context";

export interface AcademicCalendarConfig {
  academicYear: string;
  semesterId: string;
  semesterStart: string;
  semesterEnd: string;
  teachingWeeksCount: number;
  periodsPerDay: number;
  workingDays: number[];
  holidays: Array<{ date: string; label: string }>;
  examWeeks: number[];
}

export const PLANNER_CALENDAR_REQUIRED_MESSAGE =
  "لا يمكن توليد خطة الفصل بدون تقويم دراسي رسمي صالح.";

export function resolvePlannerCalendarConfig(
  year: CalendarAcademicYear | null,
  term: CalendarTerm | null,
): AcademicCalendarConfig {
  if (year && term?.startDate && term.endDate) {
    return {
      academicYear: year.label,
      semesterId: term.id,
      semesterStart: term.startDate,
      semesterEnd: term.endDate,
      teachingWeeksCount: 15,
      periodsPerDay: 7,
      workingDays: [0, 1, 2, 3, 4],
      holidays: [],
      examWeeks: [],
    };
  }

  throw new Error(PLANNER_CALENDAR_REQUIRED_MESSAGE);
}

function expandIsoDateRange(start: string, end: string): string[] {
  const dates: string[] = [];

  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  if (
    Number.isNaN(cursor.getTime()) ||
    Number.isNaN(last.getTime()) ||
    start > end
  ) {
    return dates;
  }

  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Maps the official resolved calendar onto planner config.
 *
 * Holidays, cancelled days, and exam ranges skip teaching dates.
 * Effective semester bounds include variant term overrides.
 */
export function mapResolvedCalendarToPlannerConfig(
  calendar: ResolvedCalendar,
): AcademicCalendarConfig {
  const config = resolvePlannerCalendarConfig(
    {
      id: calendar.year.id,
      label: calendar.year.label,
      startDate: calendar.year.startDate,
      endDate: calendar.year.endDate,
      isActive: calendar.year.isActive,
    },
    {
      id: calendar.semester.id,
      label: calendar.semester.label,
      startDate: calendar.effectiveSemesterStart,
      endDate: calendar.effectiveSemesterEnd,
      orderIndex: calendar.semester.orderIndex,
    },
  );

  const holidays = new Map<string, string>();

  for (const item of calendar.holidays) {
    holidays.set(item.date, item.label);
  }

  for (const date of calendar.cancelledDays) {
    if (!holidays.has(date)) {
      holidays.set(date, "");
    }
  }

  for (const range of calendar.examRanges) {
    for (const date of expandIsoDateRange(
      range.startDate,
      range.endDate,
    )) {
      if (!holidays.has(date)) {
        holidays.set(date, range.label);
      }
    }
  }

  return {
    ...config,
    holidays: [...holidays.entries()].map(([date, label]) => ({
      date,
      label,
    })),
  };
}

export async function loadCalendarConfig(
  context?: SupabaseUserContext,
  plan?: {
    academic_year_id?: string | null;
    semester_id?: string | null;
    calendar_variant_id?: string | null;
  } | null,
): Promise<AcademicCalendarConfig> {
  const calendar = plan
    ? await resolveCalendarForPlan(plan, context)
    : await resolveCalendar({}, context);

  return mapResolvedCalendarToPlannerConfig(calendar);
}
