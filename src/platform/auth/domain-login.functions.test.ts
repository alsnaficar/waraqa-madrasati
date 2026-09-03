import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveAppDomain } from "./domain-access.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOMAIN_LOGIN_FILE =
  "src/platform/auth/domain-login.functions.ts";

/**
 * Admin-domain login gate.
 *
 * The full createServerFn handler cannot be executed in CI because
 * requireSupabaseAuth needs a real Supabase URL + a real signed JWT.
 * Following the project's established pattern for server-function
 * security boundaries (e.g. academic-calendar.management.test.ts,
 * calendar-import.test.ts), these tests:
 *   - run the pure domain resolution logic for real behavior, and
 *   - structurally assert the fail-closed deny-before-elevate wiring
 *     in the exact production file that serves the login decision.
 */
describe("resolveDomainLogin admin-domain gate", () => {
  it("resolves the request hostname to the correct application domain", () => {
    assert.equal(resolveAppDomain("waraqa.alsnafi.app"), "admin");
    assert.equal(resolveAppDomain("waragh.alsnafi.app"), "teacher");
    assert.equal(resolveAppDomain("example.com"), null);
  });

  it("normalises host case, whitespace and port before resolving", () => {
    assert.equal(resolveAppDomain("  WARAQA.ALSNAFI.APP  "), "admin");
    assert.equal(resolveAppDomain("waragh.alsnafi.app:443"), "teacher");
    assert.equal(resolveAppDomain("waraqa.alsnafi.app,waragh.alsnafi.app"), "admin");
  });

  it("denies a non-admin before any privileged operation on the admin domain", () => {
    const source = readFileSync(join(ROOT, DOMAIN_LOGIN_FILE), "utf8");

    assert.match(source, /requireSupabaseAuth/);
    assert.match(source, /context\.userId/);

    const adminDomainBlockStart = source.indexOf('domain === "admin"');
    assert.ok(adminDomainBlockStart >= 0, "admin domain branch must exist");

    const adminDomainBlock = source.slice(adminDomainBlockStart);

    const denyIndex = adminDomainBlock.indexOf("allowed: false");
    const assertAdminIndex = adminDomainBlock.indexOf("await assertAdmin(");

    assert.ok(denyIndex >= 0, "non-admin deny must return allowed: false");
    assert.ok(
      assertAdminIndex >= 0,
      "admin domain grant must be gated behind assertAdmin",
    );
    assert.ok(
      denyIndex < assertAdminIndex,
      "a non-admin must be denied BEFORE assertAdmin is reached",
    );
  });

  it("routes a denied non-admin away from /admin and never returns the admin domain decision", () => {
    const source = readFileSync(join(ROOT, DOMAIN_LOGIN_FILE), "utf8");

    const adminDomainBlockStart = source.indexOf('domain === "admin"');
    const adminDomainBlock = source.slice(adminDomainBlockStart);

    assert.match(
      adminDomainBlock,
      /redirectPath:\s*"\/dashboard"/,
      "non-admin on the admin domain must be redirected to /dashboard",
    );
    assert.match(
      adminDomainBlock,
      /if\s*\(\s*role\s*!==\s*"admin"\s*\)/,
      "the admin domain branch must reject when the resolved role is not admin",
    );
  });

  it("resolves the role from the JWT user only, never from client input", () => {
    const source = readFileSync(join(ROOT, DOMAIN_LOGIN_FILE), "utf8");

    assert.equal(/data\.userId|input\.userId|body\.userId/.test(source), false);
    assert.match(source, /data\?\.role\s*===\s*"admin"\s*\?\s*"admin"\s*:\s*"teacher"/);
    assert.match(source, /\.eq\("user_id",\s*context\.userId\)/);
  });
});
