/**
 * Shared planner types and sentinel constants.
 *
 * Kept independent from planner-engine so planner services can
 * depend on the shared contract without creating circular imports.
 */

export type OverrideType = "skip" | "swap" | "move" | "insert";

export interface ScheduleOverride {
  id: string;
  type: OverrideType;
  lessonId?: string;
  lessonIdA?: string;
  lessonIdB?: string;
  targetDate?: string;
  targetPeriod?: number;
  customTitle?: string;
  customUnit?: string;
  periodsCount?: number;
}

export interface PlanSyncScope {
  planId: string;
  versionId: string;
  subject: string;
}

export interface TimetableSlot {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  period: number; // 1-based period number
  className: string; // e.g., "5-أ" or "1/أ"
  subject?: string;
  grade?: string;
}

export interface CalculatedLessonEntry {
  id: string; // unique ID
  academicYear: string;
  semester: string;
  weekNumber: number; // overall academic week
  teachingWeek: number; // week excluding holidays/exams
  suggestedDate: string; // YYYY-MM-DD
  dayOfWeek: number;
  period: number;
  unit: string;
  lessonId: string | null; // null for custom inserts
  lessonTitle: string;
  lessonOrder: number;
  periodsCount: number;
  remainingPeriods: number;
  status: "Upcoming" | "Current" | "Completed" | "Skipped";
  className: string;
  subject: string;
  /** General objectives — sourced from curriculum_lessons, not duplicated. */
  objectives: string;
  /** Teaching resources / activities from curriculum notes JSON. */
  teachingResources: string;
  /** Assessment methods from curriculum notes JSON. */
  assessmentMethods: string;
  /** Free-form curriculum notes carried into the plan row. */
  planNotes: string;
  /**
   * Distribution snapshot that generated this operational row.
   * Null for legacy curriculum-generated plans. Persisted in planner_entries.notes.
   */
  distributionSnapshotId?: string | null;
}

export const CONFIG_ACADEMIC_CALENDAR_DATE = "1970-01-01";
export const CONFIG_SCHEDULE_OVERRIDES_DATE = "1970-01-02";
