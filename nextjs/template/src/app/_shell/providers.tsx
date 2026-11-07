import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

// The one place providers are composed; only root layouts render it. It stays a server file, so
// NextIntlClientProvider inherits the locale and messages from the request. Client providers
// (a theme, a query cache) nest inside it.
export function Providers({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
