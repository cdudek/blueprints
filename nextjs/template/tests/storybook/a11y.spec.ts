import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Every story, checked with axe in the Storybook it renders in. The a11y addon shows the same
// rules in the Storybook UI; this run makes them a gate without a browser open.
type Index = { entries: Record<string, { id: string; type: string }> };

test("every story passes axe (WCAG 2.2 AA)", async ({ page, request }) => {
  const index = (await (await request.get("/index.json")).json()) as Index;
  const stories = Object.values(index.entries).filter((e) => e.type === "story");
  expect(stories.length).toBeGreaterThan(0);
  for (const { id } of stories) {
    await page.goto(`/iframe.html?id=${id}&viewMode=story`);
    await page.locator("#storybook-root > *").first().waitFor();
    const { violations } = await new AxeBuilder({ page })
      .include("#storybook-root")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(violations.map((v) => `${id}: ${v.id}`)).toEqual([]);
  }
});
