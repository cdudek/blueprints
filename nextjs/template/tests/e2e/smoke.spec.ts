import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Orders and billing blueprint" })).toBeVisible();
});

test("a signed-in user places and cancels an order", async ({ page, context }) => {
  test.skip(!process.env.DATABASE_URL, "needs a migrated Postgres: set DATABASE_URL (CI does)");

  await context.addCookies([
    { name: "stub-user", value: `e2e-${Date.now()}`, url: "http://localhost:3100" },
  ]);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Order placed");

  const row = page.getByRole("row", { name: /pending/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("row", { name: /cancelled/ })).toBeVisible();
});
