import { expect, test } from "@playwright/test";

import { expectNoRuntimeErrorOverlay } from "./helpers";

test("runs topic diagnosis before angle generation without blocking the flow", async ({ page }) => {
  await page.goto("/");

  const topic = `Sprint10 topic diagnosis ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByLabel("目标读者").fill("正在安排香港账户和跨境资金的家庭");
  await page.getByLabel("核心问题").fill("资金路径是否能解释清楚");
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  await expect(page.getByRole("tab", { name: /^选题诊断/ })).toHaveAttribute("aria-selected", "true");
  const topicDiagnosisPanel = page.locator("#workflow-panel-topic-diagnosis");
  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("重点检查是否有今天点开的理由。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible();
  await expect(topicDiagnosisPanel.getByText("最新诊断")).toBeVisible();
  await expect(topicDiagnosisPanel.locator(".topic-verdict-line strong", { hasText: "修改后通过" })).toBeVisible();
  await expect(page.locator(".status", { hasText: "选题已诊断" }).first()).toBeVisible();

  await page.getByRole("tab", { name: /^角度/ }).click();
  await expect(page.getByText("选题诊断建议先补强后再生成角度")).toBeVisible();
  await page.getByRole("button", { name: "AI 生成角度" }).click();
  await expect(page.getByText("速度只是第一眼，真正变化在资金路径")).toBeVisible();
  await expect(page.getByRole("tab", { name: /^角度/ })).toContainText("5 个");
  await expectNoRuntimeErrorOverlay(page);
});

test("blocks downstream angle actions when topic diagnosis is hold", async ({ page }) => {
  await page.goto("/");

  const topic = `Sprint10 hold topic diagnosis ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByLabel("目标读者").fill("还不够具体的跨境家庭");
  await page.getByLabel("核心问题").fill("问题还没有压实");
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  const topicDiagnosisPanel = page.locator("#workflow-panel-topic-diagnosis");
  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("强制暂缓，用于验证流程阻断。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible();
  await expect(topicDiagnosisPanel.locator(".topic-verdict-line strong", { hasText: "暂缓" })).toBeVisible();

  await page.getByRole("tab", { name: /^角度/ }).click();
  await expect(page.getByText("选题诊断建议暂缓。请修改主题或重新运行选题诊断后继续。")).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 生成角度" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "手动创建角度" })).toBeDisabled();
  await expectNoRuntimeErrorOverlay(page);
});
