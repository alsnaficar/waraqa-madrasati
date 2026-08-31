import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("TodayLessonCard UI contract", () => {
  it("renders lesson mode, time and preparation status", () => {
    const source = readFileSync(
      path.join(here, "today-lesson-card.tsx"),
      "utf8",
    );

    assert.match(source, /deliveryMode/);
    assert.match(source, /remote/);
    assert.match(source, /حضوري/);
    assert.match(source, /عن بُعد/);

    assert.match(source, /startsAt/);
    assert.match(source, /endsAt/);
    assert.match(source, /startTime/);
    assert.match(source, /endTime/);

    assert.match(source, /statusLabel/);
    assert.match(source, /تم التحضير/);
    assert.match(source, /preparing/);
  });

  it("keeps AI tools session-bound", () => {
    const source = readFileSync(
      path.join(here, "today-lesson-card.tsx"),
      "utf8",
    );

    assert.match(source, /lessonSessionId/);
    assert.match(source, /\/ai-lesson-plan/);
    assert.match(source, /\/ai-worksheet/);
    assert.match(source, /\/ai-quiz/);
  });

  it("keeps the fallback lesson-session navigation", () => {
    const source = readFileSync(
      path.join(here, "today-lesson-card.tsx"),
      "utf8",
    );

    assert.match(source, /\/lesson-sessions/);
    assert.match(source, /فتح الحصة/);
  });
});
