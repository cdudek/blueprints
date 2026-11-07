// clean twin: text comes from a translator; punctuation, numbers and spaces are not copy
const t = (key: string) => key;

export default function Translated() {
  const label = t("search");
  return (
    <main title={t("dashboard")}>
      <h1>{t("welcome")}</h1>
      <p>
        {t("count")} · 42 {"  "} ({t("items")})
      </p>
      <img src="/cat.png" alt="" />
      <input aria-label={label} placeholder={t("search")} type="search" />
    </main>
  );
}
