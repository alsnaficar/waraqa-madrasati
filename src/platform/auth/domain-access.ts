import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";

export type AppDomain = "admin" | "teacher";

const ADMIN_HOSTS = new Set([
  "waraqa.alsnafi.app",
]);

const TEACHER_HOSTS = new Set([
  "waragh.alsnafi.app",
]);

function normaliseHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .split(",")[0]
    .trim()
    .split(":")[0];
}

export function resolveAppDomain(hostname: string): AppDomain | null {
  const host = normaliseHostname(hostname);

  if (ADMIN_HOSTS.has(host)) return "admin";
  if (TEACHER_HOSTS.has(host)) return "teacher";

  return null;
}

export function getConfiguredAppDomainFromBrowser(): AppDomain | null {
  if (typeof window === "undefined") return null;

  return resolveAppDomain(window.location.hostname);
}

/**
 * Returns the application domain seen by the current server request.
 *
 * Reverse-proxy safe:
 * x-forwarded-host → host → origin
 */
function getCurrentAppDomainFromRequest() {
  const request = getRequest();
  const forwardedHost = request?.headers.get("x-forwarded-host");
  const host = request?.headers.get("host");
  const origin = request?.headers.get("origin");

  const hostname =
    forwardedHost ||
    host ||
    (origin ? new URL(origin).hostname : "");

  const normalisedHostname = normaliseHostname(hostname);

  return {
    hostname: normalisedHostname,
    domain: resolveAppDomain(normalisedHostname),
  };
}

export const getCurrentAppDomain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => getCurrentAppDomainFromRequest());
