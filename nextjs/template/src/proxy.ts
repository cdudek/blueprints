import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const localize = createMiddleware(routing);

// Locale routing, headers and redirects only. Auth and permission checks live in services.
export function proxy(request: NextRequest) {
  const response = localize(request);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return response;
}

// Everything but API routes, Next.js internals and files with an extension.
export const config = { matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"] };
