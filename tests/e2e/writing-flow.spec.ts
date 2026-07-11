import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { getDatabase } from "@/db/client";
import { articleAssets, illustrationPlans } from "@/db/schema";
import { expectPromptDialogScrollable, selectWorkflowTab } from "./helpers";

const actionTimeout = 15_000;

function currentArticleIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function insertFailedInlineIllustrationAsset(articleId: string) {
  const { db } = getDatabase();
  const plan = db
    .select()
    .from(illustrationPlans)
    .where(eq(illustrationPlans.articleId, articleId))
    .orderBy(desc(illustrationPlans.createdAt))
    .get();
  if (!plan) {
    throw new Error("missing illustration plan for e2e failed asset setup");
  }
  const parsed = JSON.parse(plan.planJson) as { items?: Array<{ itemId?: string }> };
  const itemId = parsed.items?.[0]?.itemId || "item-1";
  const now = new Date().toISOString();

  db.insert(articleAssets)
    .values({
      id: randomUUID(),
      articleId: plan.articleId,
      ownerId: plan.ownerId,
      draftVersionId: plan.finalDraftVersionId,
      sourcePlanId: plan.id,
      sourcePlanItemId: itemId,
      assetType: "inline_illustration",
      status: "failed",
      variant: itemId,
      path: `/tmp/missing-inline-illustration-${itemId}.svg`,
      mimeType: "image/svg+xml",
      source: "e2e_failed_asset",
      promptSnapshot: "Prompt 简报：这是一条失败资产的测试 prompt。",
      provider: "e2e_failed_provider",
      errorMessage: "provider broken for e2e",
      width: 1200,
      height: 675,
      generatedAt: now,
      createdAt: now
    })
    .run();
}

test("runs the Sprint 2 manual angle to draft path", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/");

  const topic = `Sprint2 manual ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);
  await expect(page.getByRole("heading", { name: topic })).toBeVisible();

  await page.getByRole("tab", { name: /^角度/ }).click();
  await page.getByPlaceholder("手动创建角度标题").fill("手动角度：速度不是重点");
  await page.getByPlaceholder("读者痛点，可选").fill("读者只看到到账速度");
  await page.getByPlaceholder("文章承诺，可选").fill("解释真正变化");
  await page.getByPlaceholder("风险提醒，可选").fill("不夸大为投资通道");
  await page.getByRole("button", { name: "手动创建角度" }).click();
  await expect(page.getByText("手动角度：速度不是重点")).toBeVisible();

  await page.getByRole("button", { name: "选择角度" }).click();
  await expect(page.locator(".status", { hasText: "已选角度" }).first()).toBeVisible();

  const researchPanel = page.locator("#workflow-panel-research");
  await expect(page.getByRole("tab", { name: /^内容研究/ })).toHaveAttribute("aria-selected", "true");
  await researchPanel.getByRole("button", { name: "打开内容研究提示词设置" }).click();
  const researchPromptDialog = page.getByRole("dialog", { name: "内容研究提示词设置" });
  await expect(researchPromptDialog.getByText("内容研究默认提示词")).toBeVisible();
  const researchAvoidListCheckbox = researchPromptDialog.locator(".requirement-option", { hasText: "不要资料罗列" }).getByRole("checkbox");
  await researchAvoidListCheckbox.check();
  await expect(researchAvoidListCheckbox).toBeChecked();
  await expect(researchPromptDialog.getByText("6 / 6 条可用")).toBeVisible();
  await expectPromptDialogScrollable(researchPromptDialog);
  await researchPromptDialog.getByRole("button", { name: "关闭提示词设置" }).click();
  await expect(researchPromptDialog).toHaveCount(0);
  await researchPanel.getByPlaceholder("例如：重点研究家庭现金流场景，不要写成政策资料罗列").fill("重点研究家庭现金流和合规边界。");
  await researchPanel.getByRole("button", { name: "生成内容研究资料包" }).click();
  await expect(researchPanel.getByText("当前资料包 r1")).toBeVisible({ timeout: actionTimeout });
  await expect(researchPanel.getByText("核心事实")).toBeVisible();
  await expect(researchPanel.getByLabel("研究资料包版本").locator("option")).toHaveCount(1);
  await researchPanel.getByRole("button", { name: "查看研究资料包提示词配方" }).click();
  const firstResearchRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(firstResearchRecipeDialog.getByText("内容研究默认提示词")).toBeVisible();
  await expect(firstResearchRecipeDialog.getByText("不要资料罗列").first()).toBeVisible();
  await firstResearchRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(firstResearchRecipeDialog).toHaveCount(0);
  await researchPanel.getByPlaceholder("例如：重点研究家庭现金流场景，不要写成政策资料罗列").fill("第二版重点研究读者真实问题。");
  await researchPanel.getByRole("button", { name: "生成内容研究资料包" }).click();
  await expect(researchPanel.getByText("当前资料包 r2")).toBeVisible({ timeout: actionTimeout });
  await expect(researchPanel.getByLabel("研究资料包版本").locator("option")).toHaveCount(2);
  await researchPanel.getByRole("button", { name: "查看研究资料包提示词配方" }).click();
  const researchRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(researchRecipeDialog.getByText("最终提示词")).toBeVisible();
  await expect(researchRecipeDialog.getByText("内容研究默认提示词")).toBeVisible();
  await expect(researchRecipeDialog.getByText("标出路径边界").first()).toBeVisible();
  await researchRecipeDialog.getByText("最终提示词").click();
  await expect(researchRecipeDialog.locator(".prompt-recipe-card", { hasText: "第二版重点研究读者真实问题。" }).first()).toBeVisible();
  await expectPromptDialogScrollable(researchRecipeDialog);
  await researchRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(researchRecipeDialog).toHaveCount(0);
  await researchPanel.getByRole("button", { name: "载入编辑器" }).click();
  await expect(page.getByText("已载入资料包 r2")).toBeVisible();
  await researchPanel.getByRole("textbox", { name: "给主线提纲的材料摘要" }).fill("人工摘要：后续提纲要围绕家庭现金流和路径边界展开。");
  await researchPanel.getByRole("textbox", { name: "研究资料包 Markdown" }).fill("## 人工修正资料包\n\n把资料包改成更适合主线提纲使用。");
  await researchPanel.getByRole("button", { name: "另存人工版本" }).click();
  await expect(page.getByText("已另存为人工资料包 r3")).toBeVisible({ timeout: actionTimeout });
  await expect(researchPanel.getByText("当前资料包 r3")).toBeVisible();
  await expect(researchPanel.locator(".research-preview").getByText("手动")).toBeVisible();
  await expect(researchPanel.getByLabel("研究资料包版本").locator("option")).toHaveCount(3);
  const researchComparison = researchPanel.getByLabel("资料包对比区域");
  await expect(researchComparison.getByText("资料包版本对比")).toBeVisible();
  await expect(researchComparison.getByLabel("左侧对比版本")).toHaveValue(/.+/);
  await expect(researchComparison.getByLabel("右侧对比版本")).toHaveValue(/.+/);
  await expect(researchComparison.getByText("材料摘要")).toBeVisible();
  await expect(researchComparison.getByText("边界提醒")).toBeVisible();
  await expect(researchComparison.getByText("可写方向")).toBeVisible();
  await expect(researchComparison.getByText("不建议写的方向")).toBeVisible();
  await expect(researchComparison.getByText("人工摘要：后续提纲要围绕家庭现金流和路径边界展开。")).toBeVisible();
  await researchPanel.getByLabel("研究资料包版本").selectOption({ index: 2 });
  await expect(researchPanel.getByText("当前资料包 r1")).toBeVisible();
  await researchPanel.getByLabel("研究资料包版本").selectOption({ index: 0 });
  await expect(researchPanel.getByText("当前资料包 r3")).toBeVisible();

  await page.getByRole("tab", { name: /^主线提纲/ }).click();
  const outlinePanel = page.locator("#workflow-panel-outline");
  await expect(outlinePanel.getByLabel("引用内容研究资料包")).toHaveValue(/.+/);
  await outlinePanel.getByRole("button", { name: "打开主线提纲提示词设置" }).click();
  const outlinePromptDialog = page.getByRole("dialog", { name: "主线提纲提示词设置" });
  await expect(outlinePromptDialog.getByText("主线一句话判断").first()).toBeVisible();
  await expectPromptDialogScrollable(outlinePromptDialog);
  await outlinePromptDialog.getByRole("button", { name: "关闭提示词设置" }).click();
  await expect(outlinePromptDialog).toHaveCount(0);

  await page.getByRole("button", { name: "生成主线和提纲" }).click();
  await expect(page.getByLabel("主线判断")).toHaveValue(/这篇文章/, { timeout: actionTimeout });
  await expect(page.getByLabel("Markdown 提纲")).toHaveValue(/## 一/, { timeout: actionTimeout });
  await expect(outlinePanel.getByText("引用资料包：r3")).toBeVisible();
  await outlinePanel.getByRole("button", { name: "查看提纲提示词配方" }).click();
  const outlineRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(outlineRecipeDialog.getByRole("heading", { name: "默认提示词" })).toBeVisible();
  await expect(outlineRecipeDialog.getByText("最终提示词")).toBeVisible();
  await outlineRecipeDialog.getByText("最终提示词").click();
  await expect(outlineRecipeDialog.getByText("内容研究资料包摘要")).toBeVisible();
  await expect(outlineRecipeDialog.getByText("人工摘要：后续提纲要围绕家庭现金流和路径边界展开。")).toBeVisible();
  await outlineRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(outlineRecipeDialog).toHaveCount(0);

  await page.getByLabel("主线判断").fill("这是提纲 v1 的主线");
  await page.getByRole("button", { name: "另存为新版本" }).click();
  await expect(page.getByText("已另存为提纲 v2")).toBeVisible({ timeout: actionTimeout });
  await expect(page.getByLabel("切换提纲版本").locator("option")).toHaveCount(2);

  await page.getByLabel("主线判断").fill("这是提纲 v2 的覆盖修改");
  await page.getByRole("button", { name: "保存当前版本" }).click();
  await expect(page.getByText("已保存到提纲 v2")).toBeVisible({ timeout: actionTimeout });
  await expect(page.getByLabel("切换提纲版本").locator("option")).toHaveCount(2);

  await page.getByLabel("切换提纲版本").selectOption({ label: "v1" });
  await expect(page.getByText("已载入提纲 v1")).toBeVisible();
  await expect(page.getByLabel("主线判断")).not.toHaveValue(/覆盖修改/);

  await page.getByLabel("切换提纲版本").selectOption({ label: "v2" });
  await expect(page.getByText("已载入提纲 v2")).toBeVisible();
  await expect(page.getByLabel("主线判断")).toHaveValue(/覆盖修改/);

  await page.getByLabel("切换提纲版本").selectOption({ label: "v1" });
  await expect(page.getByText("已载入提纲 v1")).toBeVisible();

  await page.getByRole("button", { name: "确认提纲" }).click();
  await expect(page.locator(".status", { hasText: "提纲已确认" }).first()).toBeVisible({ timeout: actionTimeout });

  const draftPanel = page.locator("#workflow-panel-draft");
  await draftPanel.getByPlaceholder("例如：开头不要用热点追问，先从家庭生活场景进入").fill("开头先从家庭现金流场景进入。");
  page.once("dialog", (dialog) => dialog.accept("家庭现金流开头"));
  await draftPanel.getByRole("button", { name: "保存为可选提示词" }).click();
  await expect(page.getByText("已新增可选提示词")).toBeVisible({ timeout: actionTimeout });

  await draftPanel.getByRole("button", { name: "打开Markdown 文案提示词设置" }).click();
  const promptDialog = page.getByRole("dialog", { name: "Markdown 文案提示词设置" });
  await expect(promptDialog).toBeVisible();
  await expectPromptDialogScrollable(promptDialog);
  await expect(promptDialog.getByText("家庭现金流开头").first()).toBeVisible();
  await expect(promptDialog.getByText("禁用不是而是").first()).toBeVisible();
  await expect(promptDialog.getByText("禁 AI 味套话").first()).toBeVisible();
  await promptDialog.getByLabel("搜索提示词").fill("家庭现金流");
  await expect(promptDialog.locator(".requirement-option", { hasText: "家庭现金流开头" }).first()).toBeVisible();
  await expect(promptDialog.locator(".requirement-option", { hasText: "禁 AI 味套话" })).toHaveCount(0);
  await promptDialog.getByRole("button", { name: "关闭提示词设置" }).click();
  await expect(promptDialog).toHaveCount(0);

  await page.getByRole("button", { name: "生成 Markdown 文案" }).click();
  const editor = page.getByLabel("Markdown 编辑");
  await expect(editor).toHaveValue(/跨境支付通火了/, { timeout: actionTimeout });
  await draftPanel.getByRole("button", { name: "查看文案提示词配方" }).click();
  const draftRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(draftRecipeDialog.locator(".prompt-recipe-card", { hasText: "开头先从家庭现金流场景进入。" }).first()).toBeVisible();
  await expect(draftRecipeDialog.getByText("最终提示词")).toBeVisible();
  await draftRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(draftRecipeDialog).toHaveCount(0);

  const aiStyleSection = draftPanel.locator(".ai-style-check-section");
  await aiStyleSection.getByRole("button", { name: "打开文案清洁检查提示词设置" }).click();
  const aiStylePromptDialog = page.getByRole("dialog", { name: "文案清洁检查提示词设置" });
  await expect(aiStylePromptDialog.getByText("文案清洁检查默认提示词")).toBeVisible();
  await expect(aiStylePromptDialog.getByText("检查重复判断").first()).toBeVisible();
  await expectPromptDialogScrollable(aiStylePromptDialog);
  await aiStylePromptDialog.getByRole("button", { name: "关闭提示词设置" }).click();
  await expect(aiStylePromptDialog).toHaveCount(0);

  await aiStyleSection.getByPlaceholder("例如：重点找空话、重复判断和 AI 味套话，不要改核心观点").fill("重点检查不是而是和重复判断。");
  let failAIStyleCheckOnce = true;
  await page.route("**/api/articles/**/run-ai-style-check", async (route) => {
    if (failAIStyleCheckOnce) {
      failAIStyleCheckOnce = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "模拟文案清洁检查失败" })
      });
      return;
    }
    await route.continue();
  });
  await aiStyleSection.getByRole("button", { name: "运行文案清洁检查" }).click();
  await expect(page.getByText("模拟文案清洁检查失败")).toBeVisible({ timeout: actionTimeout });

  await aiStyleSection.getByRole("button", { name: "运行文案清洁检查" }).click();
  await expect(page.getByText("已保存文案清洁检查")).toBeVisible({ timeout: actionTimeout });
  await expect(aiStyleSection.getByText("需要清理").first()).toBeVisible();
  await expect(aiStyleSection.getByText("2 个问题").first()).toBeVisible();
  await expect(aiStyleSection.getByText("ai_cliche").first()).toBeVisible();
  await expect(aiStyleSection.getByText("真正重要的不是几秒到账，而是生活资金的路径变得更低摩擦。")).toBeVisible();
  await expect(aiStyleSection.getByText("少用“不是……而是……”结构")).toBeVisible();
  await aiStyleSection.getByRole("button", { name: "查看文案清洁检查提示词配方" }).click();
  const aiStyleRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(aiStyleRecipeDialog.getByText("ai_style_check")).toBeVisible();
  await expect(aiStyleRecipeDialog.locator(".prompt-recipe-card", { hasText: "重点检查不是而是和重复判断。" }).first()).toBeVisible();
  await aiStyleRecipeDialog.getByText("最终提示词").click();
  await expect(aiStyleRecipeDialog.locator(".prompt-recipe-final", { hasText: "只检查表达层面的水分" })).toBeVisible();
  await aiStyleRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(aiStyleRecipeDialog).toHaveCount(0);

  await expect(page.getByRole("tab", { name: /^dbs-content/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "运行 dbs-content" })).toHaveCount(0);
  await page.goto(`${page.url().split("?")[0]}?tab=diagnosis`);
  await expect(page.getByRole("tab", { name: /^dbs-content/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /^Markdown 文案/ }).click();
  await expect(page).toHaveURL(/tab=draft/);

  await page.getByRole("button", { name: "全屏编辑 Markdown" }).click();
  const editorDialog = page.getByRole("dialog", { name: "Markdown 全屏编辑" });
  await expect(editorDialog).toBeVisible();
  const fullscreenEditor = editorDialog.getByRole("textbox", { name: "Markdown 全屏编辑" });
  await expect(fullscreenEditor).toHaveValue(/跨境支付通火了/);
  await fullscreenEditor.fill(`${await fullscreenEditor.inputValue()}\n\n这是全屏编辑补充。`);
  await editorDialog.getByRole("button", { name: "关闭全屏" }).click();
  await expect(editorDialog).toHaveCount(0);
  await expect(editor).toHaveValue(/这是全屏编辑补充。/);
  await expect(aiStyleSection.getByRole("button", { name: "运行文案清洁检查" })).toBeDisabled();
  await expect(aiStyleSection.getByText("编辑器有未保存修改")).toBeVisible();

  await page.getByRole("button", { name: "全屏查看基础预览" }).click();
  const previewDialog = page.getByRole("dialog", { name: "基础预览全屏" });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog.getByText("这是全屏编辑补充。")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(previewDialog).toHaveCount(0);

  await editor.fill(`${await editor.inputValue()}\n\n这是人工补充的一段。`);
  await page.getByRole("button", { name: "另存为新版本" }).click();
  await expect(page.getByText("已另存为文案 v2")).toBeVisible({ timeout: actionTimeout });
  await expect(page.getByLabel("切换文案版本").locator("option")).toHaveCount(2);

  await editor.fill(`${await editor.inputValue()}\n\n这是覆盖当前版本的一段。`);
  await page.getByRole("button", { name: "保存当前版本" }).click();
  await expect(page.getByText("已保存到文案 v2")).toBeVisible({ timeout: actionTimeout });
  await expect(page.getByLabel("切换文案版本").locator("option")).toHaveCount(2);

  await page.getByLabel("切换文案版本").selectOption({ label: "v1" });
  await expect(page.getByText("已载入文案 v1 到编辑器")).toBeVisible();
  await expect(page.getByLabel("切换文案版本").locator("option:checked")).toHaveText("v1");
  await expect(editor).not.toHaveValue(/这是人工补充的一段。/);
  await expect(editor).not.toHaveValue(/这是覆盖当前版本的一段。/);

  await page.getByLabel("切换文案版本").selectOption({ label: "v2" });
  await expect(page.getByText("已载入文案 v2 到编辑器")).toBeVisible();
  await expect(page.getByLabel("切换文案版本").locator("option:checked")).toHaveText("v2");
  await expect(editor).toHaveValue(/这是人工补充的一段。/);
  await expect(editor).toHaveValue(/这是覆盖当前版本的一段。/);

  await page.getByRole("tab", { name: /^人工检查/ }).click();
  const initialDraftCard = page.locator(".mini-card", { has: page.getByRole("heading", { name: "v1" }) });
  const savedDraftCard = page.locator(".mini-card", { has: page.getByRole("heading", { name: "v2" }) });
  await expect(initialDraftCard.getByText("有高风险表达水分：需要清理")).toBeVisible();
  await expect(initialDraftCard.getByText(/2 个问题/)).toBeVisible();
  await expect(savedDraftCard.getByText("未运行文案清洁检查")).toBeVisible();
  await initialDraftCard.getByRole("button", { name: "查看检查详情" }).click();
  const checkDetailDialog = page.getByRole("dialog", { name: "文案清洁检查详情" });
  await expect(checkDetailDialog.getByText("真正重要的不是几秒到账，而是生活资金的路径变得更低摩擦。")).toBeVisible();
  await checkDetailDialog.getByRole("button", { name: "关闭文案清洁检查详情" }).click();
  await expect(checkDetailDialog).toHaveCount(0);
  await initialDraftCard.getByRole("button", { name: "查看文案清洁检查提示词配方" }).click();
  const finalTabRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(finalTabRecipeDialog.getByText("ai_style_check")).toBeVisible();
  await expect(finalTabRecipeDialog.locator(".prompt-recipe-card", { hasText: "重点检查不是而是和重复判断。" }).first()).toBeVisible();
  await finalTabRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(finalTabRecipeDialog).toHaveCount(0);
  await initialDraftCard.getByRole("button", { name: "标记最终稿" }).click();
  await expect(page.getByText("已标记最终稿 v1")).toBeVisible({ timeout: actionTimeout });
  await initialDraftCard.getByRole("button", { name: "载入编辑器" }).click();
  await expect(page.getByText("已载入文案 v1 到编辑器")).toBeVisible();
  await expect(editor).toHaveValue(/跨境支付通火了/);
  await expect(editor).not.toHaveValue(/这是人工补充的一段。/);

  await page.getByLabel("切换文案版本").selectOption({ label: "v2" });
  await expect(page.getByText("已载入文案 v2 到编辑器")).toBeVisible();
  await aiStyleSection.getByPlaceholder("例如：重点找空话、重复判断和 AI 味套话，不要改核心观点").fill("强制重度水分");
  await aiStyleSection.getByRole("button", { name: "运行文案清洁检查" }).click();
  await expect(page.getByText("已保存文案清洁检查")).toBeVisible({ timeout: actionTimeout });

  await page.getByRole("tab", { name: /^人工检查/ }).click();
  const heavyDraftCard = page.locator(".mini-card", { has: page.getByRole("heading", { name: "v2" }) });
  await expect(heavyDraftCard.getByText("有高风险表达水分：重度水分")).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("仍存在明显表达水分，是否继续标记最终稿");
    await dialog.accept();
  });
  await heavyDraftCard.getByRole("button", { name: "标记最终稿" }).click();
  await expect(page.getByText("已标记最终稿 v2")).toBeVisible({ timeout: actionTimeout });

  await selectWorkflowTab(page, "发布与复盘", /^配图规划/);
  const illustrationPanel = page.locator("#workflow-panel-illustration");
  await expect(illustrationPanel.getByText("还没有配图规划")).toBeVisible();
  await illustrationPanel.getByRole("button", { name: "打开配图规划提示词设置" }).click();
  const illustrationPromptDialog = page.getByRole("dialog", { name: "配图规划提示词设置" });
  await expect(illustrationPromptDialog.getByText("配图规划默认提示词")).toBeVisible();
  await expect(illustrationPromptDialog.getByText("不画承诺结果").first()).toBeVisible();
  await illustrationPromptDialog.locator(".requirement-option", { hasText: "优先结构化图" }).getByRole("checkbox").check();
  await expectPromptDialogScrollable(illustrationPromptDialog);
  await illustrationPromptDialog.getByRole("button", { name: "关闭提示词设置" }).click();
  await expect(illustrationPromptDialog).toHaveCount(0);
  await illustrationPanel.getByPlaceholder("例如：只做流程图和边界清单图，不要人物场景图").fill("只做边界清单图，不要人物场景图。");
  await illustrationPanel.getByRole("button", { name: "生成配图规划" }).click();
  await expect(page.getByText("已生成配图规划")).toBeVisible({ timeout: actionTimeout });
  await expect(illustrationPanel.getByText("建议使用 2 张正文配图")).toBeVisible();
  await expect(illustrationPanel.getByText("配图 1")).toBeVisible();
  const firstIllustrationItem = illustrationPanel.locator(".illustration-plan-item").first();
  await expect(firstIllustrationItem.getByLabel("图片类型")).toHaveValue("流程示意图");
  await firstIllustrationItem.getByLabel("插入位置").fill("放在“不存在的小标题”之后");
  await expect(firstIllustrationItem.locator(".illustration-position-check")).toContainText("未匹配");
  await illustrationPanel.getByRole("button", { name: "确认配图规划" }).click();
  await expect(page.getByText(/还有 \d+ 张配图未匹配插入位置/)).toBeVisible();
  await firstIllustrationItem.locator(".illustration-position-selector summary").click();
  const speedPositionOption = firstIllustrationItem.locator(".illustration-position-option", { hasText: "速度只是入口" }).first();
  await expect(speedPositionOption).toBeVisible();
  await speedPositionOption.getByRole("button", { name: "之后" }).click();
  await expect(firstIllustrationItem.getByLabel("插入位置")).toHaveValue(/速度只是入口/);
  await expect(firstIllustrationItem.locator(".illustration-position-check")).toContainText("已匹配");
  await firstIllustrationItem.getByLabel("图片作用").fill("人工修改：帮助读者先看懂资金路径边界。");
  await illustrationPanel.locator(".illustration-plan-item").nth(1).getByRole("button", { name: "删除配图 2" }).click();
  await expect(illustrationPanel.locator(".illustration-plan-item")).toHaveCount(1);
  await illustrationPanel.getByRole("button", { name: "保存当前规划" }).click();
  await expect(page.getByText("已保存配图规划")).toBeVisible({ timeout: actionTimeout });
  await illustrationPanel.getByRole("button", { name: "查看配图规划提示词配方" }).click();
  const illustrationRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(illustrationRecipeDialog.getByText("illustration_plan")).toBeVisible();
  await expect(illustrationRecipeDialog.locator(".prompt-recipe-card", { hasText: "只做边界清单图，不要人物场景图。" }).first()).toBeVisible();
  await illustrationRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(illustrationRecipeDialog).toHaveCount(0);
  await expect(firstIllustrationItem.getByRole("button", { name: "生成配图 1 图片" })).toBeDisabled();
  await illustrationPanel.getByRole("button", { name: "确认配图规划" }).click();
  await expect(page.getByText("已确认配图规划")).toBeVisible({ timeout: actionTimeout });
  await expect(page.getByRole("tab", { name: /^配图规划/ })).toContainText("已确认");
  await expect(illustrationPanel.getByRole("button", { name: "保存当前规划" })).toBeDisabled();

  insertFailedInlineIllustrationAsset(currentArticleIdFromUrl(page.url()));
  await page.reload();
  const refreshedIllustrationPanel = page.locator("#workflow-panel-illustration");
  const refreshedFirstIllustrationItem = refreshedIllustrationPanel.locator(".illustration-plan-item").first();
  await expect(refreshedFirstIllustrationItem.locator(".inline-asset-status", { hasText: "生成失败" })).toBeVisible();
  await expect(refreshedFirstIllustrationItem.getByText("provider broken for e2e")).toBeVisible();
  await refreshedFirstIllustrationItem.getByRole("button", { name: "重新生成配图 1 图片" }).click();
  await expect(page.getByText("已生成配图 1")).toBeVisible({ timeout: actionTimeout });
  await expect(refreshedFirstIllustrationItem.locator(".inline-asset-status", { hasText: "测试占位图" })).toBeVisible();
  await expect(refreshedFirstIllustrationItem.getByText("上传公众号草稿箱前请重新生成真实图片或删除该配图项")).toBeVisible();
  await expect(refreshedFirstIllustrationItem.getByAltText("配图 1 预览")).toBeVisible({ timeout: actionTimeout });
  await refreshedFirstIllustrationItem.getByText("查看 prompt").click();
  await expect(refreshedFirstIllustrationItem.locator(".inline-asset-details pre")).toContainText("Prompt 简报");
  await refreshedFirstIllustrationItem.getByText("历史记录（1）").click();
  await expect(refreshedFirstIllustrationItem.getByText("provider broken for e2e")).toBeVisible();

  await selectWorkflowTab(page, "成稿", /^人工检查/);
  await heavyDraftCard.getByRole("button", { name: "查看检查详情" }).click();
  const heavyDetailDialog = page.getByRole("dialog", { name: "文案清洁检查详情" });
  await heavyDetailDialog.getByRole("button", { name: "生成清洁版文案" }).click();
  await expect(page.getByText("已生成清洁版文案 v3")).toBeVisible({ timeout: actionTimeout });
  await expect(heavyDetailDialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Markdown 文案/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("切换文案版本").locator("option")).toHaveCount(3);

  await page.getByRole("tab", { name: /^人工检查/ }).click();
  await page.getByRole("button", { name: "标记待发布" }).click();
  await expect(page.getByText("已进入发布队列")).toBeVisible({ timeout: actionTimeout });
  const publishPanel = page.locator("#workflow-panel-publish");
  await publishPanel.getByRole("button", { name: "生成公众号 HTML" }).click();
  await expect(page.getByText(/已生成公众号 HTML/)).toBeVisible({ timeout: actionTimeout });
  await expect(publishPanel.getByText("正文配图需要人工处理")).toBeVisible({ timeout: actionTimeout });
  await expect(publishPanel.getByRole("alert").getByText("正文配图使用本地资产引用")).toBeVisible();
  await expect(publishPanel.getByRole("alert").getByText("测试占位图")).toBeVisible();
  await expect(publishPanel.getByRole("alert").getByText("微信正文图片 URL")).toBeVisible();
  await expect(publishPanel.getByText("正文配图：1 张已生成")).toBeVisible();
  await expect(publishPanel.getByText("测试占位图：1 张")).toBeVisible();
  await expect(publishPanel.getByText("可上传正文图：0 张")).toBeVisible();
  await expect(publishPanel.getByText("正文配图处理：测试占位图需替换或删除")).toBeVisible();
  await expect(publishPanel.frameLocator('iframe[title="公众号 HTML 预览"]').locator(".wechat-inline-illustration img")).toBeVisible({
    timeout: actionTimeout
  });
  await publishPanel.getByRole("button", { name: "生成默认封面" }).click();
  await expect(page.getByText("已生成封面 2 张")).toBeVisible({ timeout: actionTimeout });
  await publishPanel.getByRole("button", { name: "上传公众号草稿箱" }).click();
  await expect(page.getByText("发布包存在正文配图处理提示")).toBeVisible({ timeout: actionTimeout });
  await expect(page.locator(".error", { hasText: "测试占位图" })).toBeVisible();
  await publishPanel.getByRole("button", { name: "检查发布 HTML 文案" }).click();
  await expect(page.getByText("已完成发布 HTML 文案清洁检查")).toBeVisible({ timeout: actionTimeout });
  await expect(publishPanel.getByText("最新发布 HTML 文案清洁检查")).toBeVisible();
});
