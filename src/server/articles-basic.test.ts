import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocations, requirementPresets, topicDiagnoses, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft, FailingTopicDiagnosisClient, FakeAIClient } from "./articles-test-utils";
import {
  createArticle,
  createRequirementPreset,
  deleteRequirementPreset,
  getArticle,
  getLatestTopicDiagnosisContext,
  listArticles,
  listPublishQueueArticles,
  listRequirementPresets,
  listStagePromptDefaults,
  listTopicDiagnoses,
  resolveSelectedRequirements,
  runTopicDiagnosis,
  updateRequirementPreset
} from "./articles";

describe("article service basics", () => {
  it("creates articles with topic_created status and local owner", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港教育身份规划", targetReader: "家长" }, db);

    expect(article.status).toBe("topic_created");
    expect(article.ownerId).toBe("local_user");
    expect(article.title).toBe("香港教育身份规划");
  });

  it("seeds stage default prompts", () => {
    const { db } = createTestDatabase();
    const prompts = listStagePromptDefaults(db);

    expect(prompts.map((prompt) => prompt.stage).sort()).toEqual(["angle", "dbs", "draft", "outline", "pre_publish", "review"]);
    expect(prompts.find((prompt) => prompt.stage === "angle")?.prompt).toContain("真实场景");
    expect(prompts.find((prompt) => prompt.stage === "outline")?.prompt).toContain("主线必须是一句话判断");
    expect(prompts.find((prompt) => prompt.stage === "draft")?.prompt).toContain("专业克制");
    expect(prompts.find((prompt) => prompt.stage === "pre_publish")?.prompt).toContain("预期阅读来源");
    expect(prompts.find((prompt) => prompt.stage === "review")?.prompt).toContain("不要一上来归因到文笔");
  });

  it("seeds selectable requirement presets", () => {
    const { db } = createTestDatabase();
    const outlineRequirements = listRequirementPresets({ stage: "outline" }, db);
    const draftRequirements = listRequirementPresets({ stage: "draft" }, db);
    const dbsRequirements = listRequirementPresets({ stage: "dbs" }, db);
    const prePublishRequirements = listRequirementPresets({ stage: "pre_publish" }, db);
    const angleRequirements = listRequirementPresets({ stage: "angle" }, db);
    const reviewRequirements = listRequirementPresets({ stage: "review" }, db);

    expect(angleRequirements.length).toBeGreaterThanOrEqual(5);
    expect(outlineRequirements.length).toBeGreaterThanOrEqual(6);
    expect(draftRequirements.length).toBeGreaterThanOrEqual(24);
    expect(dbsRequirements.length).toBeGreaterThanOrEqual(5);
    expect(prePublishRequirements.length).toBeGreaterThanOrEqual(10);
    expect(reviewRequirements.length).toBeGreaterThanOrEqual(4);
    expect(outlineRequirements.filter((requirement) => requirement.defaultEnabled)).toHaveLength(6);
    expect(draftRequirements.find((requirement) => requirement.stableKey === "STYLE-005")?.promptFragment).toContain("不是");
    expect(draftRequirements.find((requirement) => requirement.stableKey === "BAN-001")?.promptFragment).toContain("综上所述");
    expect(prePublishRequirements.find((requirement) => requirement.stableKey === "PUB-005")?.label).toBe("确认通知状态");
  });

  it("resolves selected requirements for the matching stage", () => {
    const { db } = createTestDatabase();
    const outlineRequirement = listRequirementPresets({ stage: "outline" }, db)[0];
    const resolved = resolveSelectedRequirements([outlineRequirement.id], "outline", db);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe(outlineRequirement.id);
  });

  it("rejects selected requirements from another stage", () => {
    const { db } = createTestDatabase();
    const draftRequirement = listRequirementPresets({ stage: "draft" }, db)[0];

    expect(() => resolveSelectedRequirements([draftRequirement.id], "outline", db)).toThrow("可选提示词不适用于当前阶段");
  });

  it("creates, updates, disables, restores, archives and deletes unused requirement presets", () => {
    const { db } = createTestDatabase();
    const created = createRequirementPreset(
      {
        stage: "draft",
        category: "自定义",
        type: "prefer",
        label: "现金流开头",
        description: "从家庭现金流场景进入",
        promptFragment: "开头先从家庭现金流场景进入。",
        defaultEnabled: false,
        priority: 500
      },
      db
    );

    const updated = updateRequirementPreset(
      created.id,
      {
        label: "家庭现金流开头",
        defaultEnabled: true,
        enabled: false
      },
      db
    );
    expect(updated.label).toBe("家庭现金流开头");
    expect(updated.enabled).toBe(false);
    expect(listRequirementPresets({ stage: "draft" }, db).some((item) => item.id === created.id)).toBe(false);

    const restored = updateRequirementPreset(created.id, { enabled: true, archived: false }, db);
    expect(restored.enabled).toBe(true);

    const archived = updateRequirementPreset(created.id, { enabled: false, archived: true }, db);
    expect(archived.archivedAt).not.toBeNull();

    const deleted = deleteRequirementPreset(created.id, db);
    expect(deleted.deleted).toBe(true);
    expect(db.select().from(requirementPresets).where(eq(requirementPresets.id, created.id)).all()).toHaveLength(0);
  });

  it("lists articles with next action labels", () => {
    const { db } = createTestDatabase();
    createArticle({ topic: "跨境支付通" }, db);

    const articles = listArticles({}, db);
    expect(articles).toHaveLength(1);
    expect(articles[0].nextAction).toBe("生成角度或手动创建角度");
  });

  it("runs topic diagnosis and records the invocation", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);

    const diagnosis = await runTopicDiagnosis(
      article.id,
      { customInstruction: "重点检查是否有今天点开的理由。" },
      new FakeAIClient(),
      db
    );
    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "topic_diagnosis")).all();
    const rows = db.select().from(topicDiagnoses).all();
    const updated = getArticle(article.id, db);

    expect(diagnosis.verdict).toBe("revise");
    expect(diagnosis.topicSnapshot).toBe("香港账户还能不能开");
    expect(diagnosis.targetReaderSnapshot).toBe("跨境家庭");
    expect(diagnosis.customInstructionSnapshot).toBe("重点检查是否有今天点开的理由。");
    expect(diagnosis.sourceInvocationId).toBeTruthy();
    expect(rows).toHaveLength(1);
    expect(listTopicDiagnoses(article.id, db)).toHaveLength(1);
    expect(getLatestTopicDiagnosisContext(article.id, db)?.diagnosisId).toBe(diagnosis.id);
    expect(getLatestTopicDiagnosisContext(article.id, db)?.riskSummary).toContain("资料解释");
    expect(invocations).toHaveLength(1);
    expect(invocations[0].prompt).toContain("重点检查是否有今天点开的理由");
    expect(invocations[0].response || "").toContain("targetReaderCheck");
    expect(updated?.status).toBe("topic_diagnosed");
    expect(updated?.nextAction).toBe("生成角度或手动创建角度");
  });

  it("keeps later workflow status when topic diagnosis is rerun", async () => {
    const { db } = createTestDatabase();
    const { article } = await createArticleWithDraft(db);

    const diagnosis = await runTopicDiagnosis(article.id, { customInstruction: "回头检查选题风险。" }, new FakeAIClient(), db);
    const updated = getArticle(article.id, db);
    const event = db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.eventType, "run_topic_diagnosis"))
      .all()
      .find((item) => item.fromStatus === "draft_generated" && item.toStatus === "draft_generated");

    expect(diagnosis.verdict).toBe("revise");
    expect(updated?.status).toBe("draft_generated");
    expect(event).toBeDefined();
  });

  it("records failed topic diagnosis invocations without creating diagnosis rows", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开" }, db);

    await expect(runTopicDiagnosis(article.id, {}, new FailingTopicDiagnosisClient(), db)).rejects.toThrow("topic diagnosis unavailable");
    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "topic_diagnosis")).all();

    expect(invocations).toHaveLength(1);
    expect(invocations[0].status).toBe("failed");
    expect(db.select().from(topicDiagnoses).all()).toHaveLength(0);
    expect(getArticle(article.id, db)?.status).toBe("topic_created");
  });

  it("returns null for missing articles", () => {
    const { db } = createTestDatabase();
    expect(getArticle("missing", db)).toBeNull();
  });

  it("does not include draft articles in the publish queue", () => {
    const { db } = createTestDatabase();
    createArticle({ topic: "还在写的文章" }, db);
    expect(listPublishQueueArticles(db)).toHaveLength(0);
  });
});
