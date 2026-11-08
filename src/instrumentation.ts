import type { Instrumentation } from "next";

import { logError } from "@/lib/log";

/**
 * Incident usehourly:9db3c000cb4bfc80 (2026-11-04, 2026-11-06): a server render threw, and the logs kept only Next's
 * stack frames, one per line, never the message. Each render error now also becomes one `render_error` JSON line with
 * the message, the digest (the reference the error screen shows), the path and the cf-ray id. The query is cut off
 * because reset, verify and invite links carry tokens; headers, cookies and bodies are never logged.
 */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  try {
    const cfRay = request?.headers?.["cf-ray"];
    logError("render_error", err, {
      digest: (err as { digest?: unknown } | null)?.digest,
      path: request?.path?.split("?")[0],
      method: request?.method,
      routePath: context?.routePath,
      routeType: context?.routeType,
      requestId: Array.isArray(cfRay) ? cfRay[0] : cfRay,
    });
  } catch {
    // A throw here would hide the real render error (Next still prints its own stack), so leave one plain line.
    try {
      console.error(JSON.stringify({ level: "error", event: "render_error", error: { name: "LogFailure" } }));
    } catch {
      // Nothing is left to log with; returning quietly is still better than throwing over the render error.
    }
  }
};
