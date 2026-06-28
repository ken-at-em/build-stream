import { expect, test } from "@playwright/test";

test("authenticated page does not spin on Convex token requests", async ({ page }) => {
  let tokenRequests = 0;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-1",
          githubLogin: "ken-at-em",
          name: "Test User",
          email: "test@buildstream.local",
        },
        expires: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
  });

  await page.route("**/api/auth/convex-token", async (route) => {
    tokenRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ token: "convex-test-token" }),
    });
  });

  await page.goto("/");
  await expect(page.getByText("Loading BuildStream")).toBeVisible();
  await page.waitForTimeout(2_500);

  expect(tokenRequests).toBeLessThanOrEqual(3);
  await expect(page.getByText("This page couldn't load")).toHaveCount(0);
});
