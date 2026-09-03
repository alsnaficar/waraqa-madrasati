import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyAuthenticatedMadrasatiLiveTimetable,
  inspectAuthenticatedMadrasatiAuthentication,
  peekAuthenticatedMadrasatiAuthentication,
  startAuthenticatedMadrasatiAuthentication,
} from "./madrasati-auth.server.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const AUTH_SERVER_FILE =
  "src/platform/integration/connectors/madrasati/madrasati-auth.server.ts";
const SESSION_MANAGER_FILE =
  "src/features/madrasati/browser/madrasati-browser-session-manager.server.ts";
const SESSION_MANAGER_TEST_FILE =
  "src/features/madrasati/browser/madrasati-browser-session-manager.test.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * Server-side Madrasati session-ownership boundary.
 *
 * The full createServerFn handlers cannot be executed in CI because
 * requireSupabaseAuth needs a real Supabase URL + a real signed JWT, and
 * the production wrapper uses a non-injectable browser-session singleton.
 * Following the project's established pattern, these tests:
 *   - run the actual wrapper guards for real behavior (they throw before
 *     any browser/manager call for blank or mismatched owners), and
 *   - structurally assert that the JWT owner is derived server-side and
 *     threaded through to the manager's ownership check (which the
 *     existing session-manager test already exercises cross-user).
 */
describe("Madrasati server-connection ownership boundary", () => {
  it("refuses a blank authenticated user before touching any session", async () => {
    await assert.rejects(
      () => startAuthenticatedMadrasatiAuthentication("   "),
      /Unauthorized|user/i,
    );
    await assert.rejects(
      () => startAuthenticatedMadrasatiAuthentication(""),
      /Unauthorized|user/i,
    );
    await assert.rejects(
      () => peekAuthenticatedMadrasatiAuthentication(""),
      /Unauthorized|user/i,
    );
    await assert.rejects(
      () => inspectAuthenticatedMadrasatiAuthentication("", "session-1"),
      /Unauthorized|user/i,
    );
  });

  it("rejects a live apply whose owner does not equal the authenticated user", async () => {
    await assert.rejects(
      () =>
        applyAuthenticatedMadrasatiLiveTimetable(USER_A, {
          userId: USER_B,
          client: {},
        }),
      /Authenticated user mismatch|owner must equal/i,
    );
  });

  it("never accepts the session owner from client input", () => {
    const source = readFileSync(join(ROOT, AUTH_SERVER_FILE), "utf8");

    assert.equal(/data\.userId|input\.userId|body\.userId|payload\.userId/.test(source), false);
    assert.equal(/\.eq\("user_id",\s*data\./.test(source), false);
  });

  it("derives the owner from the authenticated user id and delegates to the manager", () => {
    const source = readFileSync(join(ROOT, AUTH_SERVER_FILE), "utf8");

    assert.match(source, /requireAuthenticatedUserId\(waraqaUserId\)/);
    assert.match(source, /inspectAuthentication\(userId,\s*sessionId\.trim\(\)\)/);
    assert.match(source, /closeSession\(userId,\s*sessionId\.trim\(\)\)/);
    assert.match(source, /getAuthenticationScreenshot\(\s*userId,\s*sessionId\.trim\(\)/);
    assert.match(source, /applyLiveTimetable\(userId,\s*auth\)/);
  });

  it("wires server-side ownership check into the manager (existing cross-user coverage)", () => {
    const manager = readFileSync(join(ROOT, SESSION_MANAGER_FILE), "utf8");
    const managerTest = readFileSync(join(ROOT, SESSION_MANAGER_TEST_FILE), "utf8");

    assert.match(manager, /record\.userId\s*!==\s*ownerId/);
    assert.match(manager, /Madrasati browser session does not belong to this user\./);
    assert.match(managerTest, /USER_B/);
    assert.match(managerTest, /does not belong/);
  });
});
