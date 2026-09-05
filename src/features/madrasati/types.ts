import { z } from "zod";
import type { MadrasatiHomework } from "./browser/madrasati-homework.ts";
import type {
  MadrasatiClass,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "./provider/models.ts";

export interface MadrasatiTeacherProfile {
  teacherName: string;
  schoolName: string;
  schoolId: string;

  academicYear: string;
  semester: string;

  subjects: string[];

  grades: string[];

  classes: string[];
}

export interface MadrasatiTimetableLesson {
  dayOfWeek: number;
  period: number;

  subject: string;

  grade: string;

  className: string;

  classroom?: string;

  startsAt?: string;

  endsAt?: string;
}

/**
 * Madrasati Extension ↔ Waragh contract.
 *
 * Phase 1: types + runtime validation only. No pairing logic, no API,
 * no CORS changes, and no database tables.
 *
 * Security posture (same fail-closed principle as the server-side
 * Madrasati connectors): the contract carries NO secrets — no password,
 * no cookies, no Madrasati session, no access/refresh tokens. Because
 * `MadrasatiSnapshotSchema` is `.strict()`, an accidentally included
 * secret field rejects the whole snapshot instead of leaking silently.
 */

/** Current snapshot contract version. Bump on any breaking shape change. */
export const MADRASATI_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/** Known producers of a `MadrasatiSnapshot`. */
export const MADRASATI_SNAPSHOT_SOURCES = ["madrasati-extension"] as const;
export type MadrasatiSnapshotSource = (typeof MADRASATI_SNAPSHOT_SOURCES)[number];

/**
 * Pairing lifecycle between the Madrasati browser extension and Waragh.
 * Deliberately secret-free: it only exposes a state and timestamps.
 */
export const MADRASATI_PAIRING_STATE_VALUES = ["paired", "pending", "revoked", "expired"] as const;
export type MadrasatiPairingState = (typeof MADRASATI_PAIRING_STATE_VALUES)[number];

/**
 * Current pairing status between the Madrasati extension and Waragh.
 *
 * No secrets are part of this contract — nothing here can be used to
 * impersonate the teacher or replay a Madrasati session.
 */
export interface PairingStatus {
  /** Current pairing lifecycle state. */
  state: MadrasatiPairingState;
  /** When the extension was successfully paired with Waragh (ISO 8601). */
  pairedAt?: string;
  /** When this status was last confirmed against the authoritative store. */
  lastVerifiedAt?: string;
  /** When the pairing/token expires (ISO 8601), if any. */
  expiresAt?: string;
  /** When the pairing was revoked (ISO 8601), if it ever was. */
  revokedAt?: string;
  /** Human-readable status for UI / dry-run reports. */
  message?: string;
}

/**
 * Data the Madrasati browser extension hands to Waragh.
 *
 * Contains only the normalized payload Waragh already consumes from its
 * Madrasati providers (`MadrasatiSyncService.collectSnapshot`), wrapped in a
 * versioned envelope. Reuses the existing provider models instead of
 * duplicating timetable/lesson shapes.
 */
export interface MadrasatiSnapshot {
  /** Contract version the extension produced against. */
  schemaVersion: typeof MADRASATI_SNAPSHOT_SCHEMA_VERSION;
  /** Producer of this snapshot. */
  source: MadrasatiSnapshotSource;
  /** When the extension captured this snapshot (ISO 8601). */
  capturedAt: string;
  /** Teacher profile as read at capture time, if available. */
  teacher: MadrasatiTeacher | null;
  /** Assigned classes. */
  classes: MadrasatiClass[];
  /** Assigned subjects. */
  subjects: MadrasatiSubject[];
  /** Homework visible at capture time. */
  homework: MadrasatiHomework[];
  /** Weekly timetable rows. */
  timetable: MadrasatiTimetableEntry[];
}

/*
 * Runtime validation for untrusted extension payloads.
 *
 * The schemas mirror the existing provider models in shape only — the
 * mandatory structural checks belong to the ingestion layer later
 * (e.g. `normalize-timetable.ts` already owns day/period rules).
 */

export const MadrasatiTeacherSchema = z
  .object({
    displayName: z.string(),
    externalId: z.string().optional(),
    schoolName: z.string().optional(),
    academicYear: z.string().optional(),
    semester: z.string().optional(),
  })
  .strict();

export const MadrasatiClassSchema = z
  .object({
    grade: z.string(),
    className: z.string(),
    stage: z.string().optional(),
  })
  .strict();

export const MadrasatiSubjectSchema = z
  .object({
    name: z.string(),
    code: z.string().optional(),
  })
  .strict();

export const MadrasatiHomeworkSchema = z
  .object({
    id: z.string().optional(),
    title: z.string(),
    subject: z.string().optional(),
    grade: z.string().optional(),
    className: z.string().optional(),
    description: z.string().optional(),
    startsAt: z.string().optional(),
    dueAt: z.string().optional(),
    status: z.string().optional(),
  })
  .strict();

export const MadrasatiTimetableEntrySchema = z
  .object({
    dayOfWeek: z.number(),
    period: z.number(),
    subject: z.string(),
    grade: z.string(),
    className: z.string(),
    classroom: z.string().optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  })
  .strict();

export const PairingStatusSchema = z
  .object({
    state: z.enum(MADRASATI_PAIRING_STATE_VALUES),
    pairedAt: z.string().datetime().optional(),
    lastVerifiedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    revokedAt: z.string().datetime().optional(),
    message: z.string().optional(),
  })
  .strict();

export const MadrasatiSnapshotSchema = z
  .object({
    schemaVersion: z.literal(MADRASATI_SNAPSHOT_SCHEMA_VERSION),
    source: z.enum(MADRASATI_SNAPSHOT_SOURCES),
    capturedAt: z.string().datetime(),
    teacher: MadrasatiTeacherSchema.nullable(),
    classes: z.array(MadrasatiClassSchema),
    subjects: z.array(MadrasatiSubjectSchema),
    homework: z.array(MadrasatiHomeworkSchema),
    timetable: z.array(MadrasatiTimetableEntrySchema),
  })
  .strict();
