/**
 * Pure scheduling grid calculations.
 *
 * This module intentionally has no Supabase, Google Sheets, calendar resolver,
 * teacher-timetable service, or planner-engine dependencies.
 *
 * It builds the same teaching-date and timetable-slot grid used by the planner.
 */

import type { TimetableSlot } from "./planner-types";

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


export function buildTeachingDates(config: AcademicCalendarConfig): Array<{
  date: string;
  weekNumber: number;
  teachingWeek: number;
  dayOfWeek: number;
  isHoliday: boolean;
  isExamWeek: boolean;
  holidayLabel?: string;
}> {
  const dates: Array<{
    date: string;
    weekNumber: number;
    teachingWeek: number;
    dayOfWeek: number;
    isHoliday: boolean;
    isExamWeek: boolean;
    holidayLabel?: string;
  }> = [];

  const start = new Date(config.semesterStart);
  const end = new Date(config.semesterEnd);
  const current = new Date(start);
  let teachingWeekCounter = 1;

  while (current <= end) {
    const dayOfWeek = current.getDay();
    const isSchoolDay = config.workingDays.includes(dayOfWeek);
    const isoDate = current.toISOString().slice(0, 10);

    const msDiff = current.getTime() - start.getTime();
    const weekNumber =
      Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;

    const isExamWeek = config.examWeeks.includes(weekNumber);
    const holidayHit = config.holidays.find((h) => h.date === isoDate);
    const isHoliday = Boolean(holidayHit);

    if (dayOfWeek === config.workingDays[0] && isSchoolDay) {
      if (!isExamWeek) {
        teachingWeekCounter = weekNumber;
      }
    }

    if (isSchoolDay) {
      dates.push({
        date: isoDate,
        weekNumber,
        teachingWeek: isExamWeek ? 0 : teachingWeekCounter,
        dayOfWeek,
        isHoliday,
        isExamWeek,
        holidayLabel: holidayHit?.label,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function timetableMatchesPlan(
  slot: TimetableSlot,
  activeSubject: string,
  activeGrade: string,
): boolean {
  return (
    (!slot.subject || slot.subject === activeSubject) &&
    (!slot.grade || slot.grade === activeGrade)
  );
}

export function countWeeklyMatchingTimetableSlots(
  timetable: TimetableSlot[],
  activeSubject: string,
  activeGrade: string,
): number {
  return timetable.filter((slot) =>
    timetableMatchesPlan(slot, activeSubject, activeGrade),
  ).length;
}

export interface PlanTeachingSlot {
  date: string;
  weekNumber: number;
  teachingWeek: number;
  dayOfWeek: number;
  period: number;
  className: string;
}

export function buildPlanTeachingSlots(
  schoolDates: ReturnType<typeof buildTeachingDates>,
  timetable: TimetableSlot[],
  activeSubject: string,
  activeGrade: string,
): PlanTeachingSlot[] {
  const teachingSlots: PlanTeachingSlot[] = [];

  for (const day of schoolDates) {
    if (day.isHoliday) continue;

    const slotsForDay = timetable.filter(
      (slot) =>
        slot.dayOfWeek === day.dayOfWeek &&
        timetableMatchesPlan(slot, activeSubject, activeGrade),
    );

    slotsForDay.sort((a, b) => a.period - b.period);

    for (const slot of slotsForDay) {
      teachingSlots.push({
        date: day.date,
        weekNumber: day.weekNumber,
        teachingWeek: day.teachingWeek,
        dayOfWeek: day.dayOfWeek,
        period: slot.period,
        className: slot.className,
      });
    }
  }

  return teachingSlots;
}
