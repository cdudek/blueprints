import { defineRouting } from "next-intl/routing";

// Every app is translatable from the first commit. Adding a language is a messages file and a
// locale here.
export const routing = defineRouting({ locales: ["en"], defaultLocale: "en" });
