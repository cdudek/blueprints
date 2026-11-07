import { hasLocale, type Locale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// One literal import per locale, so the dependency graph stays analysable; a locale added to the
// routing without a catalog here is a type error.
const catalogs: Record<Locale, () => Promise<{ default: object }>> = {
  en: () => import("../../messages/en.json"),
};

// next-intl reads this per request (createNextIntlPlugin finds it at src/i18n/request.ts).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: (await catalogs[locale]()).default };
});
