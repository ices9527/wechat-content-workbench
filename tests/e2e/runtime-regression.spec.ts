import { expect, test } from "@playwright/test";

import { expectNoRuntimeErrorOverlay } from "./helpers";

test("loads article detail pages without the Next runtime error overlay", async ({ page }) => {
  await page.goto("/");

  const topic = `Runtime overlay regression ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  const articleUrl = page.url();
  await expect(page.getByRole("heading", { name: topic })).toBeVisible();
  await expectNoRuntimeErrorOverlay(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: topic })).toBeVisible();
  await expectNoRuntimeErrorOverlay(page);

  await page.goto(articleUrl);
  await expect(page.getByRole("heading", { name: topic })).toBeVisible();
  await expectNoRuntimeErrorOverlay(page);
});
