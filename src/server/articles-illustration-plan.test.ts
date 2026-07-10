import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  aiInvocationRequirements,
  aiInvocations,
  illustrationPlans,
  stageContracts,
  stageRuns,
  workflowEvents
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient, type GeneratedIllustrationPlan } from "./ai";
import { createArticleWithDraft } from "./articles-test-utils";
import {
  confirmIllustrationPlan,
  createArticle,
  generateIllustrationPlan,
  listIllustrationPlans,
  listRequirementPresets,
  markFinalDraft,
  parseIllustrationPlanPayload,
  updateIllustrationPlan
} from "./articles";

class EmptyIllustrationPlanClient extends FakeAIClient {
  async generateIllustrationPlan(): Promise<GeneratedIllustrationPlan> {
    return {
      summary: "空规划",
      items: []
    };
  }
}

describe("article illustration plan service", () => {
  it("requires a final draft before generating an illustration plan", async () => {
    const { db } = createTestDatabase();
    const { article } = await createArticleWithDraft(db);

    await expect(generateIllustrationPlan(article.id, {}, new FakeAIClient(), db)).rejects.toThrow("请先标记最终稿");
    expect(db.select().from(illustrationPlans).all()).toHaveLength(0);
  });

  it("generates an illustration plan linked to prompt recipe ingredients", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    const requirement = listRequirementPresets({ stage: "illustration_plan" }, db)[0];

    const plan = await generateIllustrationPlan(
      article.id,
      {
        customInstruction: "只做边界图。",
        selectedRequirementIds: [requirement.id]
      },
      new FakeAIClient(),
      db
    );

    const payload = parseIllustrationPlanPayload(plan.planJson);
    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, plan.sourceInvocationId || "")).get();
    const requirementSnapshots = db.select().from(aiInvocationRequirements).where(eq(aiInvocationRequirements.aiInvocationId, invocation?.id || "")).all();
    const event = db.select().from(workflowEvents).where(eq(workflowEvents.eventType, "generate_illustration_plan")).get();

    expect(plan.status).toBe("draft");
    expect(plan.finalDraftVersionId).toBe(draft.id);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].position).toContain("速度");
    expect(invocation?.taskType).toBe("illustration_plan");
    expect(invocation?.customInstruction).toBe("只做边界图。");
    expect(invocation?.stagePromptSnapshot).toContain("只规划正文配图");
    expect(invocation?.prompt).toContain("最终稿 Markdown");
    expect(invocation?.prompt).toContain("结构化上游契约");
    expect(invocation?.upstreamContextJson || "").toContain('"stageContext"');
    expect(requirementSnapshots[0].labelSnapshot).toBe(requirement.label);
    expect(event?.payloadJson).toContain(plan.id);
    const run = db.select().from(stageRuns).where(eq(stageRuns.stage, "illustration")).get();
    const contract = db.select().from(stageContracts).where(eq(stageContracts.stage, "illustration")).get();
    expect(run).toMatchObject({ status: "needs_input", outputArtifactId: plan.id });
    expect(JSON.parse(contract?.contractJson || "{}")).toMatchObject({
      stage: "illustration",
      decision: plan.summaryMarkdown,
      openQuestions: ["配图规划尚未确认。"]
    });
  });

  it("records failed invocations when AI returns an empty plan", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);

    await expect(generateIllustrationPlan(article.id, {}, new EmptyIllustrationPlanClient(), db)).rejects.toThrow(
      "AI 返回的配图规划为空"
    );

    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "illustration_plan")).get();
    expect(invocation?.status).toBe("failed");
    expect(invocation?.errorMessage).toBe("AI 返回的配图规划为空");
    expect(db.select().from(illustrationPlans).all()).toHaveLength(0);
    expect(db.select().from(stageRuns).where(eq(stageRuns.stage, "illustration")).get()).toMatchObject({
      status: "failed",
      sourceInvocationId: invocation?.id,
      errorMessage: "AI 返回的配图规划为空"
    });
  });

  it("keeps historical illustration plans when regenerating", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);

    await generateIllustrationPlan(article.id, {}, new FakeAIClient(), db);
    await generateIllustrationPlan(article.id, { customInstruction: "换一种规划。" }, new FakeAIClient(), db);

    const plans = listIllustrationPlans(article.id, db);
    expect(plans).toHaveLength(2);
    expect(plans.every((plan) => plan.status === "draft")).toBe(true);
  });

  it("updates draft plans and confirms one plan as the active plan", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    const first = await generateIllustrationPlan(article.id, {}, new FakeAIClient(), db);
    const second = await generateIllustrationPlan(article.id, {}, new FakeAIClient(), db);
    const payload = parseIllustrationPlanPayload(second.planJson);

    const updated = updateIllustrationPlan(
      article.id,
      {
        planId: second.id,
        summaryMarkdown: "人工调整后的配图规划。",
        items: [
          {
            ...payload.items[0],
            purpose: "改成解释家庭现金流边界。"
          }
        ]
      },
      db
    );
    const confirmed = confirmIllustrationPlan(article.id, { planId: second.id }, db);

    expect(updated.summaryMarkdown).toContain("人工调整");
    expect(parseIllustrationPlanPayload(updated.planJson).items).toHaveLength(1);
    expect(confirmed.status).toBe("confirmed");
    expect(listIllustrationPlans(article.id, db).find((plan) => plan.id === first.id)?.status).toBe("superseded");
    const runs = db.select().from(stageRuns).where(eq(stageRuns.stage, "illustration")).all();
    const contracts = db.select().from(stageContracts).where(eq(stageContracts.stage, "illustration")).all();
    expect(runs.map((run) => run.status)).toEqual(["needs_input", "needs_input", "needs_input", "approved"]);
    expect(contracts.at(-1)).toMatchObject({ sourceArtifactId: confirmed.id, createdBy: "user" });
    expect(JSON.parse(contracts.at(-1)?.contractJson || "{}").openQuestions).toEqual([]);
    expect(() =>
      updateIllustrationPlan(article.id, {
        planId: second.id,
        summaryMarkdown: "再次修改",
        items: payload.items
      }, db)
    ).toThrow("已确认的配图规划不能编辑");
  });

  it("rejects cross-article illustration plan updates and confirmations", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    const plan = await generateIllustrationPlan(article.id, {}, new FakeAIClient(), db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    expect(() =>
      updateIllustrationPlan(other.id, {
        planId: plan.id,
        summaryMarkdown: "错误修改",
        items: parseIllustrationPlanPayload(plan.planJson).items
      }, db)
    ).toThrow("配图规划不存在");
    expect(() => confirmIllustrationPlan(other.id, { planId: plan.id }, db)).toThrow("配图规划不存在");
  });
});
