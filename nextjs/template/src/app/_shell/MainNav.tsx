import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { nav } from "./nav";

export function MainNav() {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("label")} className="mb-4 flex gap-4">
      {nav.map((item) => (
        <Link key={item.href} href={item.href} className="text-accent underline">
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}
