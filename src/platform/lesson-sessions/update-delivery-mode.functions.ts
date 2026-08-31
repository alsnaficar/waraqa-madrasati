import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LessonSessionService } from "@/features/lesson-sessions/services/lesson-session.service";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

const UpdateDeliveryModeInput = z.object({
  lessonSessionId: z.string().uuid("lessonSessionId مطلوب"),
  deliveryMode: z.enum(["classroom", "remote"]),
});

export const updateLessonSessionDeliveryMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateDeliveryModeInput.parse(data))
  .handler(async ({ data, context }) => {
    const auth = {
      client: context.supabase,
      userId: context.userId,
    };

    const session = await LessonSessionService.updateDeliveryMode(
      data.lessonSessionId,
      data.deliveryMode,
      auth,
    );

    if (!session) {
      throw new Error("تعذر تحديث نمط الحصة.");
    }

    return session;
  });
