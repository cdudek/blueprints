import { hasLocale, useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale); // static rendering
  const t = useTranslations("home");
  return (
    <main>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2">
        {t.rich("intro", {
          link: (chunks) => (
            <Link href="/orders" className="text-accent underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </main>
  );
}
