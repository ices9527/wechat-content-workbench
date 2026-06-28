import { expect, test } from "@playwright/test";

import { expectNoRuntimeErrorOverlay } from "./helpers";

const actionTimeout = 15_000;

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
  await topicDiagnosisPanel.getByRole("button", { name: "打开选题诊断提示词设置" }).click();
  const topicPromptDialog = page.getByRole("dialog", { name: "选题诊断提示词设置" });
  await expect(topicPromptDialog).toBeVisible();
  await expect(topicPromptDialog.getByText("目标读者具体").first()).toBeVisible();
  await expect(topicPromptDialog.getByText("真实问题成立").first()).toBeVisible();
  await expect(topicPromptDialog.getByText("默认提示词")).toHaveCount(0);
  await topicPromptDialog.getByRole("button", { name: "关闭提示词设置" }).click();

  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("重点检查是否有今天点开的理由。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible({ timeout: actionTimeout });
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
  await expect(page.getByText("已完成选题诊断")).toBeVisible({ timeout: actionTimeout });
  await expect(topicDiagnosisPanel.locator(".topic-verdict-line strong", { hasText: "暂缓" })).toBeVisible();

  await page.getByRole("tab", { name: /^角度/ }).click();
  await expect(page.getByText("选题诊断建议暂缓。请修改主题或重新运行选题诊断后继续。")).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 生成角度" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "手动创建角度" })).toBeDisabled();
  await expectNoRuntimeErrorOverlay(page);
});

test("shows topic diagnosis status in the article library", async ({ page }) => {
  await page.goto("/");

  const diagnosedTopic = `Sprint10C library diagnosed ${Date.now()}`;
  await page.getByLabel("主题").fill(diagnosedTopic);
  await page.getByLabel("目标读者").fill("正在安排香港账户和跨境资金的家庭");
  await page.getByLabel("核心问题").fill("资金路径是否能解释清楚");
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  const topicDiagnosisPanel = page.locator("#workflow-panel-topic-diagnosis");
  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("重点检查是否有今天点开的理由。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible({ timeout: actionTimeout });

  await page.goto("/");
  const diagnosedRow = page.locator(".article-row", { hasText: diagnosedTopic });
  await expect(diagnosedRow.locator(".topic-diagnosis-badge")).toContainText("选题诊断");
  await expect(diagnosedRow.locator(".topic-diagnosis-badge")).toContainText("修改后通过");

  const undiagnosedTopic = `Sprint10C library undiagnosed ${Date.now()}`;
  await page.getByLabel("主题").fill(undiagnosedTopic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);
  await page.goto("/");
  const undiagnosedRow = page.locator(".article-row", { hasText: undiagnosedTopic });
  await expect(undiagnosedRow.locator(".topic-diagnosis-badge")).toContainText("未诊断");
  await expectNoRuntimeErrorOverlay(page);
});

test("filters the article library by diagnosis, workflow status and keyword", async ({ page }) => {
  await page.goto("/");

  const stamp = Date.now();
  const diagnosedTopic = `Sprint10CE diagnosed ${stamp}`;
  const diagnosedProblem = `Sprint10CE 资金路径 ${stamp}`;
  await page.getByLabel("主题").fill(diagnosedTopic);
  await page.getByLabel("目标读者").fill("正在安排香港账户和跨境资金的家庭");
  await page.getByLabel("核心问题").fill(diagnosedProblem);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  const topicDiagnosisPanel = page.locator("#workflow-panel-topic-diagnosis");
  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("重点检查是否有今天点开的理由。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible({ timeout: actionTimeout });

  await page.goto("/");
  const undiagnosedTopic = `Sprint10CE undiagnosed ${stamp}`;
  await page.getByLabel("主题").fill(undiagnosedTopic);
  await page.getByLabel("目标读者").fill("还没有诊断的读者");
  await page.getByLabel("核心问题").fill(`Sprint10CE 未诊断问题 ${stamp}`);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  await page.goto("/");
  await page.getByLabel("选题诊断").selectOption("missing");
  await page.getByLabel("搜索文章").fill(undiagnosedTopic);
  await page.getByRole("button", { name: "筛选" }).click();
  const undiagnosedRow = page.locator(".article-row", { hasText: undiagnosedTopic });
  await expect(undiagnosedRow).toBeVisible();
  await expect(undiagnosedRow.locator(".topic-diagnosis-badge")).toContainText("未诊断");
  await expect(page.locator(".article-row", { hasText: diagnosedTopic })).toHaveCount(0);

  await page.getByRole("link", { name: "清除" }).click();
  await page.getByLabel("选题诊断").selectOption("revise");
  await page.getByLabel("流程状态").selectOption("topic_diagnosed");
  await page.getByLabel("搜索文章").fill(diagnosedProblem);
  await page.getByRole("button", { name: "筛选" }).click();
  const diagnosedRow = page.locator(".article-row", { hasText: diagnosedTopic });
  await expect(diagnosedRow).toBeVisible();
  await expect(diagnosedRow.locator(".topic-diagnosis-badge")).toContainText("修改后通过");
  await expect(page.locator(".article-row", { hasText: undiagnosedTopic })).toHaveCount(0);

  await diagnosedRow.click();
  await expect(page.getByRole("heading", { name: diagnosedTopic })).toBeVisible();
  await expectNoRuntimeErrorOverlay(page);
});

test("shows topic diagnosis history snapshots and prompt recipes", async ({ page }) => {
  await page.goto("/");

  const topic = `Sprint10C topic diagnosis history ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByLabel("目标读者").fill("正在安排香港账户和跨境资金的家庭");
  await page.getByLabel("核心问题").fill("资金路径是否能解释清楚");
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  const topicDiagnosisPanel = page.locator("#workflow-panel-topic-diagnosis");
  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("第一次要求：检查真实读者。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible({ timeout: actionTimeout });

  await topicDiagnosisPanel.getByRole("button", { name: "查看最新选题诊断提示词配方" }).click();
  const recipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(recipeDialog).toBeVisible({ timeout: actionTimeout });
  await expect(recipeDialog.getByText("topic_diagnosis")).toBeVisible();
  await expect(recipeDialog.getByText("目标读者具体").first()).toBeVisible();
  await expect(recipeDialog.getByText("第一次要求：检查真实读者。").first()).toBeVisible();
  await page.getByRole("button", { name: "关闭提示词配方" }).click();

  await topicDiagnosisPanel.getByPlaceholder("例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户").fill("第二次要求：检查点开理由。");
  await topicDiagnosisPanel.getByRole("button", { name: "运行 DBS 选题诊断" }).click();
  await expect(page.getByText("已完成选题诊断")).toBeVisible({ timeout: actionTimeout });
  await expect(topicDiagnosisPanel.getByText("历史诊断")).toBeVisible();

  const history = topicDiagnosisPanel.locator(".topic-diagnosis-history").first();
  await history.locator("summary").click();
  await expect(history.getByText("主题快照")).toBeVisible();
  await expect(history.getByText(topic)).toBeVisible();
  await expect(history.getByText("第一次要求：检查真实读者。")).toBeVisible();

  await history.getByRole("button", { name: "提示词配方" }).click();
  await expect(recipeDialog).toBeVisible({ timeout: actionTimeout });
  await expect(recipeDialog.getByText("第一次要求：检查真实读者。").first()).toBeVisible();
  await expectNoRuntimeErrorOverlay(page);
});
