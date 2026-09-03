import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminArchiveCurriculum,
  adminDeleteCurriculumDraft,
  adminGetCurriculumLessons,
  adminListCurriculumFiles,
  adminPublishCurriculum,
  adminSaveCurriculumDraft,
} from "./curriculum-admin.ops.ts";
import { LessonInput, SaveCurriculumInput } from "./curriculum-management.functions.ts";

const TEACHER = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "teacher@waraqa.test",
};
const ADMIN = {
  userId: "22222222-2222-4222-8222-222222222222",
  email: "admin@waraqa.test",
};
const FILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Trace = {
  tables: string[];
  curriculumTables: string[];
  deletes: Array<{ table: string; fileId?: string }>;
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
};

function isCurriculumTable(table: string): boolean {
  return table === "curriculum_files" || table === "curriculum_lessons";
}

/**
 * Minimal supabaseAdmin mock:
 * - user_roles drives assertAdmin
 * - curriculum_* ops are traced for ordering / mutation proofs
 */
function mockAdminClient(options: {
  role: "admin" | "teacher" | null;
  fileStatus?: "draft" | "published" | "archived" | "other";
  fileMeta?: { subject: string; grade: string; semester: string } | null;
}): {
  // Tests pass a behavioral mock; cast at call sites via `as never`.
  client: { from: (table: string) => unknown; rpc: (fn: string, args: unknown) => unknown };
  trace: Trace;
} {
  const trace: Trace = { tables: [], curriculumTables: [], deletes: [], rpcCalls: [] };
  const status = options.fileStatus ?? "draft";
  const meta =
    options.fileMeta === undefined
      ? { subject: "رياضيات", grade: "5", semester: "1" }
      : options.fileMeta;

  const client = {
    from(table: string) {
      trace.tables.push(table);
      if (isCurriculumTable(table)) {
        trace.curriculumTables.push(table);
      }

      if (table === "user_roles") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        // assertAdmin queries specifically for role === 'admin'
                        return {
                          data: options.role === "admin" ? { role: "admin" } : null,
                          error: null,
                        };
                      },
                    };
                  },
                  async maybeSingle() {
                    return {
                      data: options.role === "admin" ? { role: "admin" } : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "curriculum_files") {
        const state: {
          filters: Record<string, string>;
          patch: Record<string, unknown>;
          mode: "select" | "update" | "delete";
        } = { filters: {}, patch: {}, mode: "select" };

        const terminal = {
          async single() {
            if (!meta) {
              return { data: null, error: { message: "not found" } };
            }
            return {
              data: { id: FILE_ID, status, ...meta },
              error: null,
            };
          },
          async maybeSingle() {
            return {
              data: { id: FILE_ID, status },
              error: null,
            };
          },
          then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
            return Promise.resolve({ data: [{ id: FILE_ID, status }], error: null }).then(
              resolve,
              reject,
            );
          },
        };

        const chain: Record<string, unknown> = {
          select() {
            state.mode = "select";
            return chain;
          },
          update(patch: Record<string, unknown>) {
            state.mode = "update";
            state.patch = patch;
            return chain;
          },
          delete() {
            state.mode = "delete";
            return chain;
          },
          eq(col: string, value: string) {
            state.filters[col] = value;
            return chain;
          },
          order() {
            return terminal;
          },
          single: terminal.single,
          maybeSingle: terminal.maybeSingle,
          then: terminal.then,
        };

        // Capture deletes when delete().eq() is awaited via thenable chain end
        const originalEq = chain.eq as (col: string, value: string) => typeof chain;
        chain.eq = (col: string, value: string) => {
          state.filters[col] = value;
          if (state.mode === "delete" && col === "id") {
            trace.deletes.push({ table: "curriculum_files", fileId: value });
          }
          return chain;
        };
        void originalEq;

        return chain;
      }

      if (table === "curriculum_lessons") {
        const state: { mode: "select" | "delete"; fileId?: string } = { mode: "select" };
        const chain: Record<string, unknown> = {
          select() {
            state.mode = "select";
            return chain;
          },
          delete() {
            state.mode = "delete";
            return chain;
          },
          eq(col: string, value: string) {
            if (col === "curriculum_file_id") state.fileId = value;
            if (state.mode === "delete") {
              trace.deletes.push({ table: "curriculum_lessons", fileId: value });
            }
            return chain;
          },
          order() {
            return Promise.resolve({ data: [], error: null });
          },
          then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return chain;
      }

      throw new Error(`unexpected table ${table}`);
    },
    rpc(fn: string, args: unknown) {
      trace.rpcCalls.push({ fn, args: (args ?? {}) as Record<string, unknown> });
      return Promise.resolve({ data: FILE_ID, error: null });
    },
  };

  return { client, trace };
}

function asAdmin(client: {
  from: (table: string) => unknown;
  rpc: (fn: string, args: unknown) => unknown;
}) {
  return client as never;
}

function assertDeniedBeforeCurriculum(fn: () => Promise<unknown>, trace: Trace) {
  return assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /Administrators/);
    assert.deepEqual(
      trace.curriculumTables,
      [],
      "teacher denial must occur before any curriculum_* privileged I/O",
    );
    assert.ok(trace.tables.includes("user_roles"));
    assert.deepEqual(trace.deletes, []);
    return true;
  });
}

describe("curriculum save input hardening", () => {
  const validLesson = {
    lessonTitle: "خصائص الضرب",
  };

  const validSave = {
    originalName: "منهج الرياضيات",
    academicYear: "1448",
    semester: "1",
    stage: "intermediate",
    grade: "الصف الأول المتوسط",
    subject: "الرياضيات",
    lessons: [validLesson],
  };

  it("accepts a normal curriculum lesson", () => {
    assert.doesNotThrow(() => LessonInput.parse(validLesson));
  });

  it("rejects more than 500 lessons", () => {
    assert.throws(() =>
      SaveCurriculumInput.parse({
        ...validSave,
        lessons: Array.from({ length: 501 }, (_, i) => ({
          lessonTitle: `درس ${i + 1}`,
        })),
      }),
    );
  });

  it("rejects an oversized lesson title", () => {
    assert.throws(() =>
      LessonInput.parse({
        lessonTitle: "أ".repeat(501),
      }),
    );
  });

  it("rejects an oversized lesson detail field", () => {
    assert.throws(() =>
      LessonInput.parse({
        lessonTitle: "درس صالح",
        objectives: "أ".repeat(10_001),
      }),
    );
  });

  it("rejects oversized curriculum metadata", () => {
    assert.throws(() =>
      SaveCurriculumInput.parse({
        ...validSave,
        subject: "أ".repeat(201),
      }),
    );
  });
});

describe("W1 curriculum admin authorization", () => {
  it("A. Non-admin → getAdminCurriculumFiles denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminListCurriculumFiles(asAdmin(client), TEACHER),
      trace,
    );
  });

  it("B. Non-admin → getAdminCurriculumLessons denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminGetCurriculumLessons(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("C. Non-admin → publishCurriculum denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminPublishCurriculum(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("D. Non-admin → archiveCurriculum denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminArchiveCurriculum(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("E. Non-admin → deleteCurriculumDraft denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminDeleteCurriculumDraft(asAdmin(client), TEACHER, FILE_ID),
      trace,
    );
  });

  it("K. Non-admin → saveCurriculumDraft denied", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () =>
        adminSaveCurriculumDraft(asAdmin(client), TEACHER, {
          originalName: "منهج الرياضيات",
          academicYear: "1448",
          semester: "1",
          grade: "الصف الأول المتوسط",
          subject: "الرياضيات",
          lessons: [{ lessonTitle: "خصائص الضرب" }],
        }),
      trace,
    );
  });

  it("F. Admin → allowed through the authorization gate (list)", async () => {
    const { client, trace } = mockAdminClient({ role: "admin" });
    const rows = await adminListCurriculumFiles(asAdmin(client), ADMIN);
    assert.ok(Array.isArray(rows));
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(trace.curriculumTables.includes("curriculum_files"));
  });

  it("G. Non-admin denial occurs BEFORE any privileged curriculum query/mutation", async () => {
    const ops = [
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return { trace: m.trace, run: () => adminListCurriculumFiles(asAdmin(m.client), TEACHER) };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminGetCurriculumLessons(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminPublishCurriculum(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminArchiveCurriculum(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
      () => {
        const m = mockAdminClient({ role: "teacher" });
        return {
          trace: m.trace,
          run: () => adminDeleteCurriculumDraft(asAdmin(m.client), TEACHER, FILE_ID),
        };
      },
    ];

    for (const make of ops) {
      const { trace, run } = make();
      await assertDeniedBeforeCurriculum(run, trace);
    }
  });

  it("H. deleteCurriculumDraft → published target denied", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "published" });
    await assert.rejects(
      () => adminDeleteCurriculumDraft(asAdmin(client), ADMIN, FILE_ID),
      (err: unknown) =>
        err instanceof Error && err.message.includes("مسودات") && err.message.includes("draft"),
    );
    assert.deepEqual(trace.deletes, []);
    assert.ok(trace.curriculumTables.includes("curriculum_files"));
    assert.ok(!trace.curriculumTables.includes("curriculum_lessons"));
  });

  it("I. deleteCurriculumDraft → archived target denied", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "archived" });
    await assert.rejects(
      () => adminDeleteCurriculumDraft(asAdmin(client), ADMIN, FILE_ID),
      (err: unknown) => err instanceof Error && err.message.includes("draft"),
    );
    assert.deepEqual(trace.deletes, []);
  });

  it("J. deleteCurriculumDraft → draft target allowed for admin", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "draft" });
    const result = await adminDeleteCurriculumDraft(asAdmin(client), ADMIN, FILE_ID);
    assert.deepEqual(result, { success: true });
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(trace.deletes.some((d) => d.table === "curriculum_lessons"));
    assert.ok(trace.deletes.some((d) => d.table === "curriculum_files"));
  });

  it("L. Admin → publishCurriculum archives peers and publishes target", async () => {
    const { client, trace } = mockAdminClient({
      role: "admin",
      fileStatus: "draft",
      fileMeta: { subject: "رياضيات", grade: "5", semester: "1" },
    });
    const result = await adminPublishCurriculum(asAdmin(client), ADMIN, FILE_ID);
    assert.deepEqual(result, { success: true });
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(
      trace.curriculumTables.filter((t) => t === "curriculum_files").length === 3,
      "publish must access curriculum_files three times: fetch, archive-peers, publish-target",
    );
  });

  it("M. Admin → archiveCurriculum succeeds", async () => {
    const { client, trace } = mockAdminClient({ role: "admin", fileStatus: "published" });
    const result = await adminArchiveCurriculum(asAdmin(client), ADMIN, FILE_ID);
    assert.deepEqual(result, { success: true });
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(trace.curriculumTables.includes("curriculum_files"));
  });

  it("N. Admin → getAdminCurriculumLessons returns lesson views", async () => {
    const { client, trace } = mockAdminClient({ role: "admin" });
    const lessons = await adminGetCurriculumLessons(asAdmin(client), ADMIN, FILE_ID);
    assert.ok(Array.isArray(lessons));
    assert.equal(trace.tables[0], "user_roles");
    assert.ok(trace.curriculumTables.includes("curriculum_lessons"));
  });
});

describe("curriculum save draft — stage/version persistence", () => {
  const saveInput = {
    originalName: "منهج الرياضيات",
    academicYear: "1448",
    semester: "1",
    grade: "الصف الأول المتوسط",
    subject: "الرياضيات",
    stage: "intermediate",
    version: "2.3",
    lessons: [{ lessonTitle: "خصائص الضرب" }],
  };

  function findSaveRpc(trace: Trace) {
    return trace.rpcCalls.find((c) => c.fn === "save_curriculum_draft_atomic");
  }

  it("passes stage and version to save_curriculum_draft_atomic RPC", async () => {
    const { client, trace } = mockAdminClient({ role: "admin" });
    const result = await adminSaveCurriculumDraft(asAdmin(client), ADMIN, saveInput);
    assert.equal(result.fileId, FILE_ID);

    const rpc = findSaveRpc(trace);
    assert.ok(rpc, "expected a save_curriculum_draft_atomic RPC call");
    assert.equal(rpc.args.p_stage, "intermediate");
    assert.equal(rpc.args.p_version, "2.3");
    assert.equal(rpc.args.p_subject, "الرياضيات");
  });

  it("defaults version to 1.0 and stage to null when omitted", async () => {
    const { client, trace } = mockAdminClient({ role: "admin" });
    const { stage: _stage, version: _version, ...rest } = saveInput;
    await adminSaveCurriculumDraft(asAdmin(client), ADMIN, rest);

    const rpc = findSaveRpc(trace);
    assert.ok(rpc, "expected a save_curriculum_draft_atomic RPC call");
    assert.equal(rpc.args.p_stage, null);
    assert.equal(rpc.args.p_version, "1.0");
  });

  it("preserves existing draft save behavior (file id, lessons, admin first)", async () => {
    const { client, trace } = mockAdminClient({ role: "admin" });
    const result = await adminSaveCurriculumDraft(asAdmin(client), ADMIN, saveInput);
    assert.equal(result.fileId, FILE_ID);

    const rpc = findSaveRpc(trace);
    assert.ok(rpc, "expected a save_curriculum_draft_atomic RPC call");
    assert.equal(rpc.args.p_file_id, null);
    assert.equal(rpc.args.p_original_name, "منهج الرياضيات");
    assert.equal(rpc.args.p_academic_year, "1448");
    assert.equal(rpc.args.p_semester, "1");
    assert.deepEqual(rpc.args.p_lessons, [{ lessonTitle: "خصائص الضرب" }]);
    assert.equal(trace.tables[0], "user_roles", "assertAdmin must run before the RPC");
  });

  it("still enforces admin authorization (non-admin denied before any RPC)", async () => {
    const { client, trace } = mockAdminClient({ role: "teacher" });
    await assertDeniedBeforeCurriculum(
      () => adminSaveCurriculumDraft(asAdmin(client), TEACHER, saveInput),
      trace,
    );
    assert.equal(trace.rpcCalls.length, 0, "RPC must not be called for non-admins");
  });
});
