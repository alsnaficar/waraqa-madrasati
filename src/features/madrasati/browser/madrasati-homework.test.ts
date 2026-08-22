import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractMadrasatiHomework, type MadrasatiHomework } from "./madrasati-homework.ts";
import type { MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

function snapshot(overrides: Partial<MadrasatiPageLandmarks> = {}): MadrasatiPageLandmarks {
  return {
    url: "https://schools.madrasati.sa/",
    title: "الواجبات",
    text: "الواجبات",
    accessibleNames: ["الواجبات"],
    labeledValues: [],
    tableRows: [],
    ...overrides,
  };
}

describe("extractMadrasatiHomework", () => {
  it("extracts homework rows from a semantic table", () => {
    const result = extractMadrasatiHomework(
      snapshot({
        tableRows: [
          {
            headers: ["اسم الواجب", "المادة", "الصف الدراسي", "الشعبة", "تاريخ التسليم", "الحالة"],
            cells: ["تدريب حروف الجر", "لغتي", "الأول المتوسط", "أ", "2026-08-25", "مفتوح"],
          },
        ],
      }),
    );

    assert.equal(result.status, "found");
    assert.deepEqual(result.homework, [
      {
        title: "تدريب حروف الجر",
        subject: "لغتي",
        grade: "الأول المتوسط",
        className: "أ",
        dueAt: "2026-08-25",
        status: "مفتوح",
      },
    ]);
  });

  it("returns empty when Madrasati explicitly reports no homework", () => {
    const result = extractMadrasatiHomework(
      snapshot({
        text: "الواجبات\nلا توجد واجبات",
      }),
    );

    assert.equal(result.status, "empty");
    assert.deepEqual(result.homework, []);
  });

  it("fails closed when the page is not the homework page", () => {
    const result = extractMadrasatiHomework(
      snapshot({
        title: "جدولي",
        text: "الجدول الدراسي",
        accessibleNames: ["جدولي"],
      }),
    );

    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.homework, []);
  });

  it("deduplicates identical homework rows", () => {
    const row = {
      headers: ["اسم الواجب", "المادة", "تاريخ التسليم"],
      cells: ["واجب 1", "لغتي", "2026-08-25"],
    };

    const result = extractMadrasatiHomework(
      snapshot({
        tableRows: [row, row],
      }),
    );

    assert.equal(result.status, "found");
    assert.equal(result.homework.length, 1);
  });
});
