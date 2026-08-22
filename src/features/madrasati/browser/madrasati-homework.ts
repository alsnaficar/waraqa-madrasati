import { sanitizePageLandmarks, type MadrasatiPageLandmarks } from "./madrasati-teacher-profile.ts";

export type MadrasatiHomework = {
  id?: string;
  title: string;
  subject?: string;
  grade?: string;
  className?: string;
  description?: string;
  startsAt?: string;
  dueAt?: string;
  status?: string;
};

export type MadrasatiHomeworkExtractionStatus = "found" | "empty" | "unavailable";

export type MadrasatiHomeworkExtraction = {
  readonly status: MadrasatiHomeworkExtractionStatus;
  readonly homework: readonly MadrasatiHomework[];
};

const EMPTY_MARKERS = [
  "لا توجد واجبات",
  "لا يوجد واجبات",
  "لا توجد بيانات",
  "لا يوجد بيانات",
] as const;

const HOMEWORK_PAGE_MARKERS = ["الواجبات", "الواجبات المنزلية", "قائمة الواجبات"] as const;

const TITLE_HEADERS = ["اسم الواجب", "الواجب", "عنوان الواجب", "اسم المهمة", "المهمة"] as const;

const SUBJECT_HEADERS = ["المادة", "اسم المادة", "المقرر", "اسم المقرر"] as const;

const GRADE_HEADERS = ["الصف", "اسم الصف", "الصف الدراسي"] as const;

const CLASS_HEADERS = ["الشعبة", "اسم الشعبة", "الفصل", "اسم الفصل"] as const;

const DESCRIPTION_HEADERS = ["الوصف", "وصف الواجب", "تفاصيل الواجب", "التفاصيل"] as const;

const START_HEADERS = ["تاريخ البداية", "بداية الواجب", "تاريخ الإتاحة"] as const;

const DUE_HEADERS = ["تاريخ التسليم", "موعد التسليم", "آخر موعد", "تاريخ الانتهاء"] as const;

const STATUS_HEADERS = ["الحالة", "حالة الواجب"] as const;

export function extractMadrasatiHomework(
  snapshot: MadrasatiPageLandmarks,
): MadrasatiHomeworkExtraction {
  const landmarks = sanitizePageLandmarks(snapshot);

  if (!isHomeworkPage(landmarks)) {
    return {
      status: "unavailable",
      homework: [],
    };
  }

  const collected: MadrasatiHomework[] = [];

  for (const row of landmarks.tableRows ?? []) {
    const title = valueForHeaders(row.headers, row.cells, TITLE_HEADERS);

    if (!title) {
      continue;
    }

    const item: MadrasatiHomework = {
      title,
      ...optional("subject", valueForHeaders(row.headers, row.cells, SUBJECT_HEADERS)),
      ...optional("grade", valueForHeaders(row.headers, row.cells, GRADE_HEADERS)),
      ...optional("className", valueForHeaders(row.headers, row.cells, CLASS_HEADERS)),
      ...optional("description", valueForHeaders(row.headers, row.cells, DESCRIPTION_HEADERS)),
      ...optional("startsAt", valueForHeaders(row.headers, row.cells, START_HEADERS)),
      ...optional("dueAt", valueForHeaders(row.headers, row.cells, DUE_HEADERS)),
      ...optional("status", valueForHeaders(row.headers, row.cells, STATUS_HEADERS)),
    };

    collected.push(item);
  }

  if (collected.length > 0) {
    return {
      status: "found",
      homework: dedupe(collected),
    };
  }

  const haystack = `${landmarks.title}\n${landmarks.text}`;

  if (EMPTY_MARKERS.some((marker) => haystack.includes(marker))) {
    return {
      status: "empty",
      homework: [],
    };
  }

  return {
    status: "unavailable",
    homework: [],
  };
}

function isHomeworkPage(landmarks: MadrasatiPageLandmarks): boolean {
  const haystack = [landmarks.title, landmarks.text, ...landmarks.accessibleNames].join("\n");

  return HOMEWORK_PAGE_MARKERS.some((marker) => haystack.includes(marker));
}

function valueForHeaders(
  headers: readonly string[],
  cells: readonly string[],
  wanted: readonly string[],
): string | undefined {
  const index = headers.findIndex((header) =>
    wanted.some((item) => normalize(header) === normalize(item)),
  );

  if (index < 0) {
    return undefined;
  }

  const value = cells[index]?.trim();

  return value || undefined;
}

function optional(
  key: keyof Omit<MadrasatiHomework, "title">,
  value: string | undefined,
): Partial<MadrasatiHomework> {
  return value ? { [key]: value } : {};
}

function dedupe(items: readonly MadrasatiHomework[]): MadrasatiHomework[] {
  const seen = new Set<string>();
  const result: MadrasatiHomework[] = [];

  for (const item of items) {
    const key = [
      item.id ?? "",
      item.title,
      item.subject ?? "",
      item.grade ?? "",
      item.className ?? "",
      item.dueAt ?? "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalize(value: string): string {
  return value.replace(/[:：]/g, "").replace(/\s+/g, " ").trim();
}
