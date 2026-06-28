import { expect, test } from "@playwright/test";

import { expectNoRuntimeErrorOverlay } from "./helpers";

test("creates an article and shows it in the Linear workbench", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "今天要处理什么？" })).toBeVisible();
  await page.getByLabel("主题").fill(`Sprint smoke ${Date.now()}`);
  await page.getByLabel("目标读者").fill("公众号作者");
  await page.getByLabel("核心问题").fill("测试工作台能否新建文章");
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  await expect(page.getByRole("heading", { name: /Sprint smoke/ })).toBeVisible();
  await expect(page.locator(".status", { hasText: "已建主题" }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /^选题诊断/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /^主题/ }).click();
  await expect(page).toHaveURL(/tab=topic/);
  await expect(page.getByRole("tabpanel", { name: /^主题/ })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: /^主题/ }).getByText("公众号作者")).toBeVisible();
  await expect(page.getByRole("heading", { name: "下一步动作" })).toHaveCount(0);
  await expectNoRuntimeErrorOverlay(page);
});

test("shows content research empty state before an angle is selected", async ({ page }) => {
  await page.goto("/");

  const topic = `Research empty ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  await page.getByRole("tab", { name: /^内容研究/ }).click();
  await expect(page.getByText("请先选择角度，再生成内容研究资料包。")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成内容研究资料包" })).toHaveCount(0);
  await expectNoRuntimeErrorOverlay(page);
});
