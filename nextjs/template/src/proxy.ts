import { NextResponse } from "next/server";

// Headers and redirects only. Auth and permission checks live in services.
export function proxy() {
  const response = NextResponse.next();
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
