import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  FlaskConical,
  Clock3,
  Monitor,
  School,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

export interface TodayLessonCardProps {
  entry: {
    id: string;
    period: number;
    grade?: string;
    className?: string;
    klass?: string;
    lessonTitle: string;
    subject: string;
    /** When set, AI deep links are session-bound (P3 Step 2). */
    lessonSessionId?: string;
    deliveryMode?: "classroom" | "remote";
    status?: string;
    startsAt?: string | null;
    endsAt?: string | null;
  };
}

export function TodayLessonCard({ entry }: TodayLessonCardProps) {
  const displayGrade = entry.className || entry.grade || "";
  const shortGrade = displayGrade.replace(/^الصف\s+/, "");
  const displayKlass = entry.klass || "";

  const hasSession = Boolean(entry.lessonSessionId);

  const statusLabel =
    entry.status === "prepared" || entry.status === "completed"
      ? "تم التحضير"
      : entry.status === "preparing"
        ? "جارٍ التحضير"
        : entry.status === "cancelled"
          ? "ملغاة"
          : "مجدولة";

  const formatTime = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat("ar-SA", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  const startTime = formatTime(entry.startsAt);
  const endTime = formatTime(entry.endsAt);
  const searchParams = hasSession
    ? {
        lessonSessionId: entry.lessonSessionId!,
        stage: displayGrade.includes("متوسط")
          ? ("intermediate" as const)
          : displayGrade.includes("ثانوي")
            ? ("secondary" as const)
            : ("primary" as const),
        grade: displayGrade,
        subject: entry.subject,
        title: entry.lessonTitle,
      }
    : null;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <span className="text-sm font-bold">{entry.period}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {shortGrade || "مادة مخصصة"}
            </Badge>

            {displayKlass && (
              <span className="text-[10px] text-muted-foreground">{displayKlass}</span>
            )}
          </div>

          <p className="mt-1 truncate text-sm font-semibold">{entry.lessonTitle}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {entry.deliveryMode && (
              <span className="inline-flex items-center gap-1">
                {entry.deliveryMode === "remote" ? (
                  <Monitor className="h-3 w-3" />
                ) : (
                  <School className="h-3 w-3" />
                )}
                {entry.deliveryMode === "remote" ? "عن بُعد" : "حضوري"}
              </span>
            )}

            {startTime && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" />
                {startTime}
                {endTime ? ` - ${endTime}` : ""}
              </span>
            )}

            {entry.lessonSessionId && (
              <span>{statusLabel}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {searchParams ? (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link to="/ai-lesson-plan" search={searchParams as never}>
                  <BookOpen className="h-4 w-4 text-emerald-600" />
                </Link>
              </Button>

              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link to="/ai-worksheet" search={searchParams as never}>
                  <FileText className="h-4 w-4 text-orange-500" />
                </Link>
              </Button>

              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link to="/ai-quiz" search={searchParams as never}>
                  <FlaskConical className="h-4 w-4 text-indigo-600" />
                </Link>
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
              <Link to="/lesson-sessions">فتح الحصة</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
