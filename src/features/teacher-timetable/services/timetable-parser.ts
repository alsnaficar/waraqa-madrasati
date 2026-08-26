/**
 * Pure parser for the legacy timetable stored on profiles.classes.
 *
 * No Supabase, planner-engine, Madrasati service, or calendar dependencies.
 */
export interface ParsedTimetableSlot {
  dayOfWeek: number;
  period: number;
  className: string;
}

export function parseProfileTimetable(
  classes: unknown,
): ParsedTimetableSlot[] {
  if (!classes || typeof classes !== "object") return [];

  const slots = (classes as { timetable?: unknown }).timetable;
  if (!Array.isArray(slots)) return [];

  return slots.flatMap((slot) => {
    if (!slot || typeof slot !== "object") return [];

    const { dayOfWeek, period, className } =
      slot as Record<string, unknown>;

    if (
      typeof dayOfWeek !== "number" ||
      typeof period !== "number"
    ) {
      return [];
    }

    return [
      {
        dayOfWeek,
        period,
        className: typeof className === "string" ? className : "",
      },
    ];
  });
}
