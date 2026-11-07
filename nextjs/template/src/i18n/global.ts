import type messages from "../../messages/en.json";
import type { routing } from "./routing";

// Typed message keys: a key missing from messages/en.json is a type error.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
