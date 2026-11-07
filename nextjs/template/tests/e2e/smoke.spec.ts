import { expect, test } from "@playwright/test";
import { placeOrderAsNewUser } from "./orders";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Orders and billing blueprint" })).toBeVisible();
});

test("a signed-in user places and cancels an order", async ({ page, context }) => {
  test.skip(!process.env.DATABASE_URL, "needs a migrated Postgres: set DATABASE_URL (CI does)");

  await placeOrderAsNewUser(page, context, "e2e");

  const row = page.getByRole("row", { name: /pending/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByRole("row", { name: /cancelled/ })).toBeVisible();
});
