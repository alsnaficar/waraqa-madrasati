import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { assertAdmin } from "@/platform/auth/assert-admin";
import {
  resolveAppDomain,
  type AppDomain,
} from "@/platform/auth/domain-access";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

export type DomainLoginDecision = {
  domain: AppDomain | null;
  role: "admin" | "teacher";
  allowed: boolean;
  redirectPath: "/admin" | "/dashboard";
};

export const resolveDomainLogin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DomainLoginDecision> => {
    const { supabaseAdmin } =
      await import("@/platform/database/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) {
      console.error(
        "[auth] domain login role lookup failed:",
        error.message,
      );
      throw new Error("تعذر التحقق من صلاحيات الحساب.");
    }

    const role = data?.role === "admin" ? "admin" : "teacher";

    const request = getRequest();
    const forwardedHost = request?.headers.get("x-forwarded-host");
    const host = request?.headers.get("host");
    const origin = request?.headers.get("origin");

    const hostname =
      forwardedHost ||
      host ||
      (origin ? new URL(origin).hostname : "");

    const normalisedHostname = hostname
      .trim()
      .toLowerCase()
      .split(",")[0]
      .trim()
      .split(":")[0];

    const domain = resolveAppDomain(normalisedHostname);

    console.log("[auth] domain login decision:", {
      userId: context.userId,
      role,
      hostname: normalisedHostname,
      domain,
    });

    /*
     * No recognised application hostname:
     * preserve the existing role-based behaviour.
     */
    if (!domain) {
      return {
        domain: null,
        role,
        allowed: true,
        redirectPath: role === "admin" ? "/admin" : "/dashboard",
      };
    }

    /*
     * ADMIN DOMAIN
     *
     * waraqa.alsnafi.app
     * Only administrators are allowed here.
     */
    if (domain === "admin") {
      if (role !== "admin") {
        return {
          domain,
          role,
          allowed: false,
          redirectPath: "/dashboard",
        };
      }

      await assertAdmin(supabaseAdmin, context.userId);

      return {
        domain,
        role,
        allowed: true,
        redirectPath: "/admin",
      };
    }

    /*
     * TEACHER DOMAIN
     *
     * waragh.alsnafi.app
     * Teachers use the teacher dashboard.
     * Administrators may also access the teacher interface.
     */
    return {
      domain,
      role,
      allowed: true,
      redirectPath: "/dashboard",
    };
  });
