import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocations, stageContracts } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft } from "./articles-test-utils";
import { listQualityGateReworkItems } from "./articles";

describe("article quality gate rework service", () => {
  it("collects current article upstream rework items from persisted quality gate responses", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    const draftContract = db.select().from(stageContracts).where(eq(stageContracts.stage, "draft")).get();
    const contractPayload = JSON.parse(draftContract?.contractJson || "{}");
    db.update(stageContracts)
      .set({
        contractJson: JSON.stringify({
          ...contractPayload,
          qualityGate: {
            stage: "draft",
            verdict: "revise",
            ownedChecks: [
              {
                checkId: "draft.text_cleanliness",
                status: "pass",
                evidence: "表达没有明显水分。",
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
            summaryForDownstream: "不要继续硬改正文，先处理上游选题价值。"
          }
        })
      })
      .where(eq(stageContracts.id, draftContract?.id || ""))
      .run();
    db.update(aiInvocations)
      .set({ response: JSON.stringify({ markdown: draft.markdown, qualityGate: null }) })
      .where(eq(aiInvocations.id, draft.sourceInvocationId as string))
      .run();

    const items = listQualityGateReworkItems(article.id, db);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceLabel: "Markdown 文案 v1",
      sourceStage: "draft",
      targetStage: "topic",
      targetTab: "topic",
      targetLabel: "主题",
      checkId: "topic.value",
      checkLabel: "选题价值",
      blockingLevel: "block",
      reason: "文案阶段发现读者为什么现在需要读仍不清楚。",
      suggestedAction: "回到主题页收敛读者问题，再重新运行选题诊断。"
    });
  });

  it("ignores missing or old quality gate responses", async () => {
    const { db } = createTestDatabase();
    const { article } = await createArticleWithDraft(db);

    expect(listQualityGateReworkItems(article.id, db)).toEqual([]);
  });
});
