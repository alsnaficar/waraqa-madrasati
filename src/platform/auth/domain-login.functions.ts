import { createServerFn } from "@tanstack/react-start";
import { assertAdmin } from "@/platform/auth/assert-admin";
import {
  getCurrentAppDomain,
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

    const requestDomain = await getCurrentAppDomain();
    const domain = requestDomain.domain;

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
     * Normal teachers go to the teacher dashboard.
     * Administrators are also allowed to use the teacher interface.
     */
    return {
      domain,
      role,
      allowed: true,
      redirectPath: "/dashboard",
    };
  });
