import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectNoRuntimeErrorOverlay(page: Page) {
  await expect(page.locator("body")).not.toContainText("Runtime Error");
  await expect(page.locator("body")).not.toContainText("Cannot find module");
  await expect(page.locator("body")).not.toContainText("vendor-chunks/drizzle-orm.js");
}

async function expectPromptDialogScrollable(dialog: Locator) {
  const body = dialog.locator(".prompt-config-body");
  await expect(body).toBeVisible();
  await expect(body).toHaveCSS("overflow-y", "scroll");
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBeTruthy();
}

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
  await expect(page.getByRole("tab", { name: /^角度/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /^主题/ }).click();
  await expect(page).toHaveURL(/tab=topic/);
  await expect(page.getByRole("tabpanel", { name: /^主题/ })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: /^主题/ }).getByText("公众号作者")).toBeVisible();
  await expect(page.getByRole("heading", { name: "下一步动作" })).toHaveCount(0);
  await expectNoRuntimeErrorOverlay(page);
});

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

test("runs the Sprint 2 manual angle to draft path", async ({ page }) => {
  await page.goto("/");

  const topic = `Sprint2 manual ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);
  await expect(page.getByRole("heading", { name: topic })).toBeVisible();

  await page.getByPlaceholder("手动创建角度标题").fill("手动角度：速度不是重点");
  await page.getByPlaceholder("读者痛点，可选").fill("读者只看到到账速度");
  await page.getByPlaceholder("文章承诺，可选").fill("解释真正变化");
  await page.getByPlaceholder("风险提醒，可选").fill("不夸大为投资通道");
  await page.getByRole("button", { name: "手动创建角度" }).click();
  await expect(page.getByText("手动角度：速度不是重点")).toBeVisible();

  await page.getByRole("button", { name: "选择角度" }).click();
  await expect(page.locator(".status", { hasText: "已选角度" }).first()).toBeVisible();

  const outlinePanel = page.locator("#workflow-panel-outline");
  await outlinePanel.getByRole("button", { name: "打开主线提纲提示词设置" }).click();
  const outlinePromptDialog = page.getByRole("dialog", { name: "主线提纲提示词设置" });
  await expect(outlinePromptDialog.getByText("主线一句话判断").first()).toBeVisible();
  await expectPromptDialogScrollable(outlinePromptDialog);
  await outlinePromptDialog.getByRole("button", { name: "关闭提示词设置" }).click();
  await expect(outlinePromptDialog).toHaveCount(0);

  await page.getByRole("button", { name: "生成主线和提纲" }).click();
  await expect(page.getByLabel("主线判断")).toHaveValue(/这篇文章/);
  await expect(page.getByLabel("Markdown 提纲")).toHaveValue(/## 一/);
  await outlinePanel.getByRole("button", { name: "查看提纲提示词配方" }).click();
  const outlineRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(outlineRecipeDialog.getByRole("heading", { name: "默认提示词" })).toBeVisible();
  await expect(outlineRecipeDialog.getByText("最终提示词")).toBeVisible();
  await outlineRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(outlineRecipeDialog).toHaveCount(0);

  await page.getByLabel("主线判断").fill("这是提纲 v1 的主线");
  await page.getByRole("button", { name: "另存为新版本" }).click();
  await expect(page.getByText("已另存为提纲 v2")).toBeVisible();
  await expect(page.getByLabel("切换提纲版本").locator("option")).toHaveCount(2);

  await page.getByLabel("主线判断").fill("这是提纲 v2 的覆盖修改");
  await page.getByRole("button", { name: "保存当前版本" }).click();
  await expect(page.getByText("已保存到提纲 v2")).toBeVisible();
  await expect(page.getByLabel("切换提纲版本").locator("option")).toHaveCount(2);

  await page.getByLabel("切换提纲版本").selectOption({ label: "v1" });
  await expect(page.getByText("已载入提纲 v1")).toBeVisible();
  await expect(page.getByLabel("主线判断")).not.toHaveValue(/覆盖修改/);

  await page.getByLabel("切换提纲版本").selectOption({ label: "v2" });
  await expect(page.getByText("已载入提纲 v2")).toBeVisible();
  await expect(page.getByLabel("主线判断")).toHaveValue(/覆盖修改/);

  await page.getByRole("button", { name: "确认提纲" }).click();
  await expect(page.locator(".status", { hasText: "提纲已确认" }).first()).toBeVisible();

  const draftPanel = page.locator("#workflow-panel-draft");
  await draftPanel.getByPlaceholder("例如：开头不要用热点追问，先从家庭生活场景进入").fill("开头先从家庭现金流场景进入。");
  page.once("dialog", (dialog) => dialog.accept("家庭现金流开头"));
  await draftPanel.getByRole("button", { name: "保存为可选提示词" }).click();
  await expect(page.getByText("已新增可选提示词")).toBeVisible();

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
  await expect(editor).toHaveValue(/跨境支付通火了/);
  await draftPanel.getByRole("button", { name: "查看文案提示词配方" }).click();
  const draftRecipeDialog = page.getByRole("dialog", { name: "提示词配方" });
  await expect(draftRecipeDialog.locator(".prompt-recipe-card", { hasText: "开头先从家庭现金流场景进入。" }).first()).toBeVisible();
  await expect(draftRecipeDialog.getByText("最终提示词")).toBeVisible();
  await draftRecipeDialog.getByRole("button", { name: "关闭提示词配方" }).click();
  await expect(draftRecipeDialog).toHaveCount(0);

  await page.getByRole("tab", { name: /^dbs-content/ }).click();
  await expect(page).toHaveURL(/tab=diagnosis/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /^dbs-content/ })).toHaveAttribute("aria-selected", "true");
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

  await page.getByRole("button", { name: "全屏查看基础预览" }).click();
  const previewDialog = page.getByRole("dialog", { name: "基础预览全屏" });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog.getByText("这是全屏编辑补充。")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(previewDialog).toHaveCount(0);

  await editor.fill(`${await editor.inputValue()}\n\n这是人工补充的一段。`);
  await page.getByRole("button", { name: "另存为新版本" }).click();
  await expect(page.getByText("已另存为文案 v2")).toBeVisible();
  await expect(page.getByLabel("切换文案版本").locator("option")).toHaveCount(2);

  await editor.fill(`${await editor.inputValue()}\n\n这是覆盖当前版本的一段。`);
  await page.getByRole("button", { name: "保存当前版本" }).click();
  await expect(page.getByText("已保存到文案 v2")).toBeVisible();
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
  await initialDraftCard.getByRole("button", { name: "载入编辑器" }).click();
  await expect(page.getByText("已载入文案 v1 到编辑器")).toBeVisible();
  await expect(editor).toHaveValue(/跨境支付通火了/);
  await expect(editor).not.toHaveValue(/这是人工补充的一段。/);
});

test("runs the Sprint 4 publish package path", async ({ page }) => {
  await page.goto("/");

  const topic = `Sprint4 publish ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  await page.getByPlaceholder("手动创建角度标题").fill("手动角度：真正变化不是速度");
  await page.getByRole("button", { name: "手动创建角度" }).click();
  await page.getByRole("button", { name: "选择角度" }).click();
  await page.getByRole("button", { name: "生成主线和提纲" }).click();
  await expect(page.getByLabel("Markdown 提纲")).toHaveValue(/## 一/);
  await page.getByRole("button", { name: "确认提纲" }).click();
  await page.getByRole("button", { name: "生成 Markdown 文案" }).click();
  await expect(page.getByLabel("Markdown 编辑")).toHaveValue(/跨境支付通火了/);

  await page.getByRole("tab", { name: /^dbs-content/ }).click();
  await page.getByRole("button", { name: "运行 dbs-content" }).click();
  await expect(page.getByText("已保存 dbs-content 诊断")).toBeVisible();
  await expect(page.getByText("内容创作诊断报告")).toBeVisible();

  await page.getByRole("tab", { name: /^人工检查/ }).click();
  const draftCardAfterDiagnosis = page.locator(".mini-card", { has: page.getByRole("heading", { name: "v1" }) });
  await expect(draftCardAfterDiagnosis.getByRole("button", { name: "标记最终稿" })).toBeEnabled();

  await page.getByRole("tab", { name: /^dbs-content/ }).click();
  await page.getByRole("button", { name: "基于诊断生成修改稿" }).click();
  await expect(page.getByText("已生成修改稿 v2")).toBeVisible();
  await expect(page.getByLabel("Markdown 编辑")).toHaveValue(/真正变的不是到账速度/);

  await page.getByRole("tab", { name: /^人工检查/ }).click();
  const revisionCard = page.locator(".mini-card", { has: page.getByRole("heading", { name: "v2" }) }).filter({ hasText: "修改稿" });
  await revisionCard.getByRole("button", { name: "标记最终稿" }).click();
  await expect(page.getByText("已标记最终稿 v2")).toBeVisible();
  await page.getByRole("button", { name: "标记待发布" }).click();
  await expect(page.locator(".notice", { hasText: "已进入发布队列" })).toBeVisible();
  await expect(page.locator(".status", { hasText: "待发布" }).first()).toBeVisible();

  await page.getByRole("button", { name: "生成公众号 HTML" }).click();
  await expect(page.locator(".notice", { hasText: "已生成公众号 HTML" })).toBeVisible();
  await expect(page.locator(".status", { hasText: "已生成发布包" }).first()).toBeVisible();

  await page.getByRole("button", { name: "生成默认封面" }).click();
  await expect(page.locator(".notice", { hasText: "已生成封面 2 张" })).toBeVisible();
  await expect(page.locator(".status", { hasText: "已生成封面" }).first()).toBeVisible();
  await expect(page.getByText("21:9 封面：1 个")).toBeVisible();
  await expect(page.getByText("1:1 封面：1 个")).toBeVisible();

  await page.getByRole("button", { name: "上传公众号草稿箱" }).click();
  await expect(page.locator(".notice", { hasText: "已上传公众号草稿箱" })).toBeVisible();
  await expect(page.locator(".status", { hasText: "已上传草稿箱" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "自动发表" })).toHaveCount(0);

  await page.getByRole("link", { name: "发布队列" }).click();
  await page.waitForURL(/\/publish-queue/);
  await expect(page.getByRole("heading", { name: "发布队列" })).toBeVisible();
  await expect(page.locator("section.panel", { has: page.getByRole("heading", { name: "待发布和复盘" }) }).locator(".article-row", { hasText: topic })).toBeVisible();
});
