import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { placeOrderAsNewUser } from "./orders";

// axe over every page of the app, as a user reaches it. Automated checks find only part of the
// issues; keyboard-only use of each new flow stays a review obligation.
const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(wcag).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );

test("the home page", async ({ page }) => {
  await page.goto("/");
  expect(await violations(page)).toEqual([]);
});

test("the orders page, signed out", async ({ page }) => {
  await page.goto("/orders");
  expect(await violations(page)).toEqual([]);
});

test("the orders page with an order and the cancel dialog open", async ({ page, context }) => {
  test.skip(!process.env.DATABASE_URL, "needs a migrated Postgres: set DATABASE_URL (CI does)");
  await placeOrderAsNewUser(page, context, "a11y");
  expect(await violations(page)).toEqual([]);
  await page
    .getByRole("row", { name: /pending/ })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
