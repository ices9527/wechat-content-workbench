import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { getDatabase } from "@/db/client";
import { aiInvocations, angleCandidates, articleProjects, draftVersions, outlineVersions, topicVersions } from "@/db/schema";

import { expectNoRuntimeErrorOverlay } from "./helpers";

const actionTimeout = 15_000;
const localUserId = "local_user";

function createArticleWithDraftRework() {
  const { db } = getDatabase();
  const now = new Date().toISOString();
  const articleId = randomUUID();
  const angleId = randomUUID();
  const outlineId = randomUUID();
  const draftId = randomUUID();
  const outlineInvocationId = randomUUID();
  const draftInvocationId = randomUUID();
  const topic = `Sprint15C rework ${Date.now()}`;
  const targetReader = "正在安排跨境家庭资金路径的读者";
  const coreProblem = "读者还不知道为什么今天要处理这个问题";
  const mainline = "这篇文章要先说明读者为什么今天需要重新看资金路径，而不是只看开户动作。";
  const outlineMarkdown = [
    "## 一、先把问题收窄",
    "- 读者看到的是开户动作。",
    "- 真正要判断的是家庭资金路径。",
    "",
    "## 二、再讲路径怎么影响安排",
    "- 学费、生活费、备用金都需要解释来源和用途。"
  ].join("\n");
  const markdown = [
    "# 香港账户还能不能开？真正变了的不是开户，是资金路径",
    "",
    "很多家庭关心能不能开账户，但更重要的是资金路径为什么现在值得重新判断。",
    "",
    "## 速度只是入口",
    "",
    "如果只写工具动作，读者仍然不知道这件事和自己的家庭现金流有什么关系。"
  ].join("\n");

  db.transaction(() => {
    db.insert(articleProjects)
      .values({
        id: articleId,
        ownerId: localUserId,
        title: topic,
        topic,
        status: "draft_generated",
        topicType: null,
        targetReader,
        coreProblem,
        hotAnchor: null,
        selectedAngleId: angleId,
        finalDraftVersionId: null,
        createdAt: now,
        updatedAt: now
      })
      .run();
    db.insert(topicVersions)
      .values({
        id: randomUUID(),
        articleId,
        ownerId: localUserId,
        versionNo: 1,
        topic,
        targetReader,
        coreProblem,
        hotAnchor: null,
        createdBy: "initial",
        createdAt: now
      })
      .run();
    db.insert(angleCandidates)
      .values({
        id: angleId,
        articleId,
        ownerId: localUserId,
        source: "manual",
        createdBy: "user",
        angleTitle: "资金路径比开户动作更重要",
        readerPain: "读者容易把工具动作当作真正问题",
        promise: "把问题收回家庭现金流路径",
        risk: "不承诺开户或到账结果",
        recommended: false,
        selected: true,
        createdAt: now
      })
      .run();
    db.insert(aiInvocations)
      .values({
        id: outlineInvocationId,
        ownerId: localUserId,
        articleId,
        taskType: "generate_outline",
        model: "e2e-fixture",
        baseUrl: "fixture://local",
        prompt: "E2E outline fixture prompt",
        response: JSON.stringify({
          mainline,
          outlineMarkdown,
          qualityGate: {
            stage: "outline",
            verdict: "pass",
            ownedChecks: [
              {
                checkId: "outline.cognitive_gap",
                status: "pass",
                evidence: "认知落差成立。",
                suggestion: null
              }
            ],
            upstreamRework: [],
            summaryForDownstream: "文案要围绕资金路径而不是开户动作展开。"
          }
        }),
        status: "succeeded",
        createdAt: now
      })
      .run();
    db.insert(outlineVersions)
      .values({
        id: outlineId,
        articleId,
        ownerId: localUserId,
        versionNo: 1,
        sourceInvocationId: outlineInvocationId,
        sourceResearchVersionId: null,
        mainline,
        outlineMarkdown,
        createdBy: "ai",
        accepted: true,
        createdAt: now
      })
      .run();
    db.insert(aiInvocations)
      .values({
        id: draftInvocationId,
        ownerId: localUserId,
        articleId,
        taskType: "generate_draft",
        model: "e2e-fixture",
        baseUrl: "fixture://local",
        prompt: "E2E draft fixture prompt",
        response: JSON.stringify({
          markdown,
          qualityGate: {
            stage: "draft",
            verdict: "revise",
            ownedChecks: [
              {
                checkId: "draft.text_cleanliness",
                status: "pass",
                evidence: "正文表达可以继续清理，但不是主要阻塞点。",
                suggestion: null
              },
              {
                checkId: "draft.expression_efficiency",
                status: "pass",
                evidence: "正文段落基本直接。",
                suggestion: null
              },
              {
                checkId: "draft.ai_trace",
                status: "pass",
                evidence: "没有明显模板化 AI 痕迹。",
                suggestion: null
              }
            ],
            upstreamRework: [
              {
                targetStage: "topic",
                checkId: "topic.value",
                reason: "文案阶段发现读者为什么现在需要读仍不清楚。",
                suggestedAction: "回到主题页收敛读者问题，再重新运行选题诊断。"
              }
            ],
            summaryForDownstream: "不要继续硬改正文，先回到主题收敛选题价值。"
          }
        }),
        status: "succeeded",
        createdAt: now
      })
      .run();
    db.insert(draftVersions)
      .values({
        id: draftId,
        articleId,
        ownerId: localUserId,
        versionNo: 1,
        draftType: "initial",
        markdown,
        html: null,
        sourceOutlineId: outlineId,
        sourceDiagnosisId: null,
        sourceAIStyleCheckId: null,
        sourceInvocationId: draftInvocationId,
        isFinal: false,
        createdBy: "ai",
        createdAt: now
      })
      .run();
  });

  return { id: articleId };
}

test("shows quality gate upstream rework prompts and jumps back to the target tab", async ({ page }) => {
  await page.goto("/");
  const article = createArticleWithDraftRework();

  await page.goto(`/articles/${article.id}?tab=draft`);

  await expect(page.getByRole("tab", { name: /^Markdown 文案/ })).toHaveAttribute("aria-selected", "true");
  const reworkCard = page.getByRole("region", { name: "质量门回流建议" });
  await expect(reworkCard).toBeVisible({ timeout: actionTimeout });
  await expect(reworkCard.getByText("需要回到上游处理")).toBeVisible();
  await expect(reworkCard.getByText("1 条会阻断继续推进。")).toBeVisible();
  await expect(reworkCard.getByText("Markdown 文案 v1 发现 · 回到 主题")).toBeVisible();
  await expect(reworkCard.getByRole("heading", { name: "选题价值" })).toBeVisible();
  await expect(reworkCard.getByText("文案阶段发现读者为什么现在需要读仍不清楚。")).toBeVisible();
  await expect(reworkCard.getByText("回到主题页收敛读者问题，再重新运行选题诊断。")).toBeVisible();

  await reworkCard.getByRole("button", { name: "回到主题" }).click();

  await expect(page).toHaveURL(/tab=topic/);
  await expect(page.getByRole("tab", { name: /^主题/ })).toHaveAttribute("aria-selected", "true");
  const topicPanel = page.locator("#workflow-panel-topic");
  await expect(topicPanel.getByRole("button", { name: "编辑主题" })).toBeVisible();
  await expect(topicPanel.getByRole("button", { name: "保存主题" })).toHaveCount(0);
  await expectNoRuntimeErrorOverlay(page);
});
