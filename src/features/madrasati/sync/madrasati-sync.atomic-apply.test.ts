import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MadrasatiSyncService,
  type MadrasatiApplyAuthContext,
} from "./madrasati-sync.service.ts";
import type { MadrasatiProvider } from "../provider/madrasati-provider.ts";
import type {
  MadrasatiAuthenticationPage,
} from "../provider/madrasati-provider.ts";
import type {
  MadrasatiAuthenticationState,
  MadrasatiClass,
  MadrasatiConnectionStatus,
  MadrasatiSubject,
  MadrasatiTeacher,
  MadrasatiTimetableEntry,
} from "../provider/models.ts";
import type { MadrasatiHomework } from "../browser/madrasati-homework.ts";

const WARAQA_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const connection: MadrasatiConnectionStatus = {
  state: "connected",
  authenticationState: "authenticated",
  isMock: false,
  browserAutomationAvailable: true,
  message: "Connected",
};

const timetable: MadrasatiTimetableEntry[] = [
  {
    dayOfWeek: 0,
    period: 1,
    subject: "رياضيات",
    grade: "خامس",
    className: "أ",
    classroom: "أ-101",
    startsAt: "07:00",
    endsAt: "07:45",
  },
  {
    dayOfWeek: 1,
    period: 2,
    subject: "علوم",
    grade: "سادس",
    className: "ب",
    classroom: "ب-203",
    startsAt: "07:50",
    endsAt: "08:35",
  },
];

function createProvider(): MadrasatiProvider {
  const teacher: MadrasatiTeacher = {
    displayName: "معلم اختبار",
  };

  const classes: MadrasatiClass[] = [];
  const subjects: MadrasatiSubject[] = [];
  const homework: MadrasatiHomework[] = [];

  const authenticationPage: MadrasatiAuthenticationPage = {
    url: "https://example.test",
    title: "Madrasati",
    text: "Authenticated",
    authenticationState: "authenticated" as MadrasatiAuthenticationState,
  };

  return {
    async connect() {
      return connection;
    },
    async beginAuthentication() {
      return connection;
    },
    async inspectAuthenticationPage() {
      return authenticationPage;
    },
    async disconnect() {
      return connection;
    },
    async getConnectionStatus() {
      return connection;
    },
    async getTeacherProfile() {
      return teacher;
    },
    async getTimetable() {
      return timetable;
    },
    async getClasses() {
      return classes;
    },
    async getSubjects() {
      return subjects;
    },
    async getHomework() {
      return homework;
    },
  };
}

function createAuth(): MadrasatiApplyAuthContext {
  return {
    userId: WARAQA_USER,
    client: {},
  } as MadrasatiApplyAuthContext;
}

describe("Madrasati atomic live apply orchestration", () => {
  it("sends only normalized accepted entries to the atomic writer", async () => {
    const sync = new MadrasatiSyncService(createProvider());

    let receivedEntries: MadrasatiTimetableEntry[] = [];
    let receivedUserId = "";

    const result = await sync.applyLiveTimetable(
      WARAQA_USER,
      createAuth(),
      {
        applyAtomic: async (entries, auth) => {
          receivedEntries = entries;
          receivedUserId = auth.userId;
          return entries.length;
        },
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.isMockApply, false);
    assert.equal(result.slotsWritten, 2);
    assert.equal(receivedUserId, WARAQA_USER);
    assert.equal(receivedEntries.length, 2);

    assert.deepEqual(
      receivedEntries.map((entry) => ({
        dayOfWeek: entry.dayOfWeek,
        period: entry.period,
        subject: entry.subject,
        grade: entry.grade,
        className: entry.className,
        classroom: entry.classroom,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
      })),
      timetable,
    );
  });

  it("does not call the atomic writer when the source contains rejected rows", async () => {
    const provider = createProvider();

    provider.getTimetable = async () => [
      ...timetable,
      {
        dayOfWeek: 9,
        period: 3,
        subject: "مرفوض",
        grade: "سادس",
        className: "ج",
      },
    ];

    const sync = new MadrasatiSyncService(provider);

    let called = false;

    await assert.rejects(
      () =>
        sync.applyLiveTimetable(
          WARAQA_USER,
          createAuth(),
          {
            applyAtomic: async () => {
              called = true;
              return 1;
            },
          },
        ),
      /rejected or duplicate rows/i,
    );

    assert.equal(called, false);
  });

  it("does not call the atomic writer for a mock provider", async () => {
    const provider = createProvider();

    provider.getConnectionStatus = async () => ({
      ...connection,
      isMock: true,
    });

    const sync = new MadrasatiSyncService(provider);

    let called = false;

    await assert.rejects(
      () =>
        sync.applyLiveTimetable(
          WARAQA_USER,
          createAuth(),
          {
            applyAtomic: async () => {
              called = true;
              return 1;
            },
          },
        ),
      /real browser provider/i,
    );

    assert.equal(called, false);
  });
});
