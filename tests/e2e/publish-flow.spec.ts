import { expect, test } from "@playwright/test";

test("runs the Sprint 4 publish package path", async ({ page }) => {
  await page.goto("/");

  const topic = `Sprint4 publish ${Date.now()}`;
  await page.getByLabel("主题").fill(topic);
  await page.getByRole("button", { name: "新建文章" }).click();
  await page.waitForURL(/\/articles\//);

  await page.getByRole("tab", { name: /^角度/ }).click();
  await page.getByPlaceholder("手动创建角度标题").fill("手动角度：真正变化不是速度");
  await page.getByRole("button", { name: "手动创建角度" }).click();
  await page.getByRole("button", { name: "选择角度" }).click();
  await expect(page.getByRole("tab", { name: /^内容研究/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /^主线提纲/ }).click();
  await expect(page.getByText("没有内容研究资料包时，仍可按旧流程生成主线提纲。")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成主线和提纲" })).toBeEnabled();
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

  const articleId = new URL(page.url()).pathname.split("/").pop() || "article";
  await page.route(
    "**/api/articles/*/upload-wechat-draft",
    async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: "微信接口失败",
          upload: {
            id: "failed-upload-1",
            articleId,
            ownerId: "owner-1",
            draftVersionId: "draft-1",
            coverAssetId: "cover-1",
            htmlAssetId: "html-1",
            wechatMediaId: null,
            wechatArticleUrl: null,
            status: "failed",
            errorMessage: "微信接口失败",
            uploadedAt: "2026-07-01T00:00:00.000Z"
          }
        })
      });
    },
    { times: 1 }
  );

  await page.getByRole("button", { name: "上传公众号草稿箱" }).click();
  await expect(page.locator(".error", { hasText: "微信接口失败" })).toBeVisible();
  const uploadList = page.locator(".upload-list");
  await expect(uploadList).toContainText("failed");
  await expect(uploadList).toContainText("微信接口失败");
  await expect(page.locator(".notice", { hasText: "已上传公众号草稿箱：null" })).toHaveCount(0);

  await page.getByRole("button", { name: "上传公众号草稿箱" }).click();
  await expect(page.locator(".notice", { hasText: "已上传公众号草稿箱" })).toBeVisible();
  await expect(page.locator(".status", { hasText: "已上传草稿箱" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "自动发表" })).toHaveCount(0);

  await page.getByRole("link", { name: "发布队列" }).click();
  await page.waitForURL(/\/publish-queue/);
  await expect(page.getByRole("heading", { name: "发布队列" })).toBeVisible();
  await expect(page.locator("section.panel", { has: page.getByRole("heading", { name: "待发布和复盘" }) }).locator(".article-row", { hasText: topic })).toBeVisible();
});
