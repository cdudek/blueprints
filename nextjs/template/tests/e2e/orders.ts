import { expect, type BrowserContext, type Page } from "@playwright/test";

/** Signs a fresh stub user in and places one order through the form. Needs DATABASE_URL. */
export async function placeOrderAsNewUser(page: Page, context: BrowserContext, prefix: string) {
  await context.addCookies([
    { name: "stub-user", value: `${prefix}-${Date.now()}`, url: "http://localhost:3100" },
  ]);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByRole("status")).toHaveText("Order placed");
}
