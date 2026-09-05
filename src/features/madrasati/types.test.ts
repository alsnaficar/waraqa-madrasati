import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { z } from "zod";

import {
  MADRASATI_SNAPSHOT_SCHEMA_VERSION,
  MadrasatiSnapshot,
  MadrasatiSnapshotSchema,
  PairingStatus,
  PairingStatusSchema,
} from "./types.ts";

/*
 * Compile-time drift guards: the hand-written interfaces and the zod
 * schemas must stay mutually assignable, otherwise the contract silently
 * drifted. These run during `tsc --noEmit`, not at runtime.
 */
const _snapshotSchemaToInterface: (
  value: z.infer<typeof MadrasatiSnapshotSchema>,
) => MadrasatiSnapshot = (value) => value;
const _snapshotInterfaceToSchema: (
  value: MadrasatiSnapshot,
) => z.infer<typeof MadrasatiSnapshotSchema> = (value) => value;
const _pairingSchemaToInterface: (value: z.infer<typeof PairingStatusSchema>) => PairingStatus = (
  value,
) => value;
const _pairingInterfaceToSchema: (value: PairingStatus) => z.infer<typeof PairingStatusSchema> = (
  value,
) => value;

const validSnapshot = {
  schemaVersion: MADRASATI_SNAPSHOT_SCHEMA_VERSION,
  source: "madrasati-extension",
  capturedAt: "2026-09-05T12:00:00.000Z",
  teacher: {
    displayName: "أ. أحمد",
    schoolName: "مدرسة النموذجية",
    academicYear: "1446",
    semester: "الأول",
  },
  classes: [{ grade: "الصف الأول المتوسط", className: "1" }],
  subjects: [{ name: "لغتي الخالدة", code: "ARB101" }],
  homework: [
    {
      title: "تدريب حروف الجر",
      subject: "لغتي الخالدة",
      className: "1",
      dueAt: "2026-08-25",
    },
  ],
  timetable: [
    {
      dayOfWeek: 0,
      period: 1,
      subject: "لغتي الخالدة",
      grade: "الصف الأول المتوسط",
      className: "1",
      classroom: "فصل 1",
      startsAt: "07:30",
      endsAt: "08:15",
    },
  ],
} satisfies MadrasatiSnapshot;

describe("MadrasatiSnapshotSchema", () => {
  it("accepts a valid snapshot with a teacher profile", () => {
    assert.equal(MadrasatiSnapshotSchema.safeParse(validSnapshot).success, true);
  });

  it("accepts a valid snapshot without a teacher profile", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({ ...validSnapshot, teacher: null }).success,
      true,
    );
  });

  it("accepts a snapshot with empty optional discovery collections", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({
        ...validSnapshot,
        classes: [],
        subjects: [],
        homework: [],
        timetable: [],
      }).success,
      true,
    );
  });

  it("rejects a missing or future schema version", () => {
    const { schemaVersion: _omitted, ...withoutVersion } = validSnapshot;
    assert.equal(MadrasatiSnapshotSchema.safeParse(withoutVersion).success, false);
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({ ...validSnapshot, schemaVersion: 2 }).success,
      false,
    );
  });

  it("rejects an unknown source", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({ ...validSnapshot, source: "some-other-client" }).success,
      false,
    );
  });

  it("requires an ISO 8601 capturedAt", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({ ...validSnapshot, capturedAt: "2026/09/05" }).success,
      false,
    );
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({ ...validSnapshot, capturedAt: "not-a-date" }).success,
      false,
    );
  });

  it("rejects unknown top-level fields (fail closed against secrets)", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({
        ...validSnapshot,
        password: "hunter2",
        cookies: "SESSION=abc",
      }).success,
      false,
    );
  });

  it("rejects secrets smuggled inside nested objects", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({
        ...validSnapshot,
        timetable: [
          {
            ...validSnapshot.timetable[0],
            accessToken: "Bearer eyJhbGciOiJIUzI1NiJ9",
          },
        ],
      }).success,
      false,
    );
  });

  it("rejects a malformed timetable row", () => {
    assert.equal(
      MadrasatiSnapshotSchema.safeParse({
        ...validSnapshot,
        timetable: [{ dayOfWeek: 0, period: 1 }],
      }).success,
      false,
    );
  });
});

describe("PairingStatusSchema", () => {
  it("accepts every pairing state", () => {
    for (const state of ["paired", "pending", "revoked", "expired"] as const) {
      assert.equal(PairingStatusSchema.safeParse({ state }).success, true, state);
    }
  });

  it("accepts a full paired status with ISO timestamps", () => {
    assert.equal(
      PairingStatusSchema.safeParse({
        state: "paired",
        pairedAt: "2026-09-01T08:00:00.000Z",
        lastVerifiedAt: "2026-09-05T10:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        message: "مقترنة",
      }).success,
      true,
    );
  });

  it("rejects an unknown state", () => {
    assert.equal(PairingStatusSchema.safeParse({ state: "connected" }).success, false);
  });

  it("rejects non-ISO timestamps", () => {
    assert.equal(
      PairingStatusSchema.safeParse({ state: "paired", pairedAt: "yesterday" }).success,
      false,
    );
  });

  it("rejects secret fields (strict contract)", () => {
    assert.equal(
      PairingStatusSchema.safeParse({ state: "paired", refreshToken: "rt-123" }).success,
      false,
    );
  });
});

/*
 * Compile-time guards that the contract types themselves cannot hold
 * secrets. These lines must keep failing under `tsc --noEmit`.
 */
// @ts-expect-error — the snapshot contract must not carry cookies
const secretfulSnapshot: MadrasatiSnapshot = { ...validSnapshot, cookies: "SESSION=abc" };
// @ts-expect-error — the pairing contract must not carry tokens
const secretfulPairing: PairingStatus = { state: "paired", accessToken: "Bearer eyJ..." };
