import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocationRequirements, aiInvocations, requirementPresets, topicDiagnoses, topicVersions, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import {
  createArticleWithDraft,
  DropTopicDiagnosisClient,
  FailingTopicDiagnosisClient,
  FakeAIClient,
  HoldTopicDiagnosisClient,
  PassTopicDiagnosisClient
} from "./articles-test-utils";
import {
  createArticle,
  createRequirementInputSchema,
  createRequirementPreset,
  CUSTOM_INSTRUCTION_MAX_LENGTH,
  deleteRequirementPreset,
  generateAngles,
  generateIllustrationPlanInputSchema,
  generateWithPromptInputSchema,
  getArticle,
  getLatestTopicDiagnosisContext,
  listArticles,
  listPublishQueueArticles,
  listRequirementPresets,
  listStagePromptDefaults,
  listTopicDiagnoses,
  listTopicVersions,
  resolveSelectedRequirements,
  REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH,
  runTopicDiagnosis,
  updateArticle,
  updateRequirementInputSchema,
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

  it("creates an initial topic version when creating an article", () => {
    const { db } = createTestDatabase();
    const article = createArticle(
      {
        topic: "香港教育身份规划",
        targetReader: "家长",
        coreProblem: "教育路径怎么选",
        hotAnchor: "升学季"
      },
      db
    );
    const versions = listTopicVersions(article.id, db);

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      articleId: article.id,
      versionNo: 1,
      topic: "香港教育身份规划",
      targetReader: "家长",
      coreProblem: "教育路径怎么选",
      hotAnchor: "升学季",
      createdBy: "initial"
    });
    expect(db.select().from(topicVersions).all()).toHaveLength(1);
  });

  it("records topic versions when article topic fields are edited", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港教育身份规划", targetReader: "家长" }, db);

    const updated = updateArticle(
      article.id,
      {
        topic: "香港教育身份和现金流规划",
        targetReader: "跨境家庭",
        coreProblem: "教育和现金流怎么一起安排"
      },
      db
    );
    const versions = listTopicVersions(article.id, db);

    expect(updated?.title).toBe("香港教育身份和现金流规划");
    expect(versions.map((version) => version.versionNo)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      topic: "香港教育身份和现金流规划",
      targetReader: "跨境家庭",
      coreProblem: "教育和现金流怎么一起安排",
      createdBy: "user_edit"
    });
    expect(versions[1]).toMatchObject({
      topic: "香港教育身份规划",
      targetReader: "家长",
      createdBy: "initial"
    });
  });

  it("rejects empty topic updates", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港教育身份规划" }, db);

    expect(() => updateArticle(article.id, { topic: "   " }, db)).toThrow("主题不能为空");
  });

  it("seeds stage default prompts", () => {
    const { db } = createTestDatabase();
    const prompts = listStagePromptDefaults(db);

    expect(prompts.map((prompt) => prompt.stage).sort()).toEqual([
      "ai_style_check",
      "angle",
      "draft",
      "illustration_plan",
      "outline",
      "pre_publish",
      "research",
      "review"
    ]);
    expect(prompts.find((prompt) => prompt.stage === "angle")?.prompt).toContain("真实场景");
    expect(prompts.find((prompt) => prompt.stage === "research")?.prompt).toContain("只生成内容研究资料包");
    expect(prompts.find((prompt) => prompt.stage === "outline")?.prompt).toContain("主线必须是一句话判断");
    expect(prompts.find((prompt) => prompt.stage === "draft")?.prompt).toContain("专业克制");
    expect(prompts.find((prompt) => prompt.stage === "ai_style_check")?.prompt).toContain("只检查表达层面的水分");
    expect(prompts.find((prompt) => prompt.stage === "illustration_plan")?.prompt).toContain("只规划正文配图");
    expect(prompts.find((prompt) => prompt.stage === "pre_publish")?.prompt).toContain("预期阅读来源");
    expect(prompts.find((prompt) => prompt.stage === "review")?.prompt).toContain("不要一上来归因到文笔");
  });

  it("seeds selectable requirement presets", () => {
    const { db } = createTestDatabase();
    const outlineRequirements = listRequirementPresets({ stage: "outline" }, db);
    const topicRequirements = listRequirementPresets({ stage: "topic" }, db);
    const draftRequirements = listRequirementPresets({ stage: "draft" }, db);
    const aiStyleCheckRequirements = listRequirementPresets({ stage: "ai_style_check" }, db);
    const illustrationPlanRequirements = listRequirementPresets({ stage: "illustration_plan" }, db);
    const prePublishRequirements = listRequirementPresets({ stage: "pre_publish" }, db);
    const angleRequirements = listRequirementPresets({ stage: "angle" }, db);
    const researchRequirements = listRequirementPresets({ stage: "research" }, db);
    const reviewRequirements = listRequirementPresets({ stage: "review" }, db);

    expect(topicRequirements).toHaveLength(8);
    expect(angleRequirements.length).toBeGreaterThanOrEqual(5);
    expect(researchRequirements.length).toBeGreaterThanOrEqual(6);
    expect(outlineRequirements.length).toBeGreaterThanOrEqual(6);
    expect(draftRequirements.length).toBeGreaterThanOrEqual(24);
    expect(aiStyleCheckRequirements.length).toBeGreaterThanOrEqual(6);
    expect(illustrationPlanRequirements.length).toBeGreaterThanOrEqual(6);
    expect(prePublishRequirements.length).toBeGreaterThanOrEqual(10);
    expect(reviewRequirements.length).toBeGreaterThanOrEqual(4);
    expect(topicRequirements.filter((requirement) => requirement.defaultEnabled)).toHaveLength(4);
    expect(researchRequirements.filter((requirement) => requirement.defaultEnabled)).toHaveLength(5);
    expect(outlineRequirements.filter((requirement) => requirement.defaultEnabled)).toHaveLength(6);
    expect(aiStyleCheckRequirements.filter((requirement) => requirement.defaultEnabled)).toHaveLength(6);
    expect(illustrationPlanRequirements.filter((requirement) => requirement.defaultEnabled)).toHaveLength(5);
    expect(researchRequirements.find((requirement) => requirement.stableKey === "RESEARCH-003")?.promptFragment).toContain("路径边界");
    expect(draftRequirements.find((requirement) => requirement.stableKey === "STYLE-005")?.promptFragment).toContain("不是");
    expect(aiStyleCheckRequirements.find((requirement) => requirement.stableKey === "AICLEAN-003")?.promptFragment).toContain("反复表达同一个判断");
    expect(illustrationPlanRequirements.find((requirement) => requirement.stableKey === "ILLUS-004")?.promptFragment).toContain("不要规划任何暗示收益");
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
    expect(deleted.deleted).toBe(false);
    expect(deleted.archived).toBe(true);
    expect(db.select().from(requirementPresets).where(eq(requirementPresets.id, created.id)).all()).toHaveLength(1);
    expect(listRequirementPresets({ stage: "draft" }, db).some((item) => item.id === created.id)).toBe(false);
  });

  it("allows longer custom instructions while keeping a clear upper bound", () => {
    const validInstruction = "文".repeat(CUSTOM_INSTRUCTION_MAX_LENGTH);
    const tooLongInstruction = `${validInstruction}多`;

    expect(generateWithPromptInputSchema.parse({ customInstruction: validInstruction }).customInstruction).toHaveLength(CUSTOM_INSTRUCTION_MAX_LENGTH);
    expect(generateIllustrationPlanInputSchema.parse({ customInstruction: validInstruction }).customInstruction).toHaveLength(CUSTOM_INSTRUCTION_MAX_LENGTH);
    expect(() => generateWithPromptInputSchema.parse({ customInstruction: tooLongInstruction })).toThrow(
      `本次提示词不能超过 ${CUSTOM_INSTRUCTION_MAX_LENGTH} 字`
    );
    expect(() => generateIllustrationPlanInputSchema.parse({ customInstruction: tooLongInstruction })).toThrow(
      `本次提示词不能超过 ${CUSTOM_INSTRUCTION_MAX_LENGTH} 字`
    );
  });

  it("allows longer requirement prompt fragments while keeping reusable presets bounded", () => {
    const validFragment = "要".repeat(REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH);
    const tooLongFragment = `${validFragment}多`;

    expect(
      createRequirementInputSchema.parse({
        stage: "draft",
        category: "长提示词",
        type: "prefer",
        label: "长提示词片段",
        description: "用于验证 5000 字边界",
        promptFragment: validFragment
      }).promptFragment
    ).toHaveLength(REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH);
    expect(updateRequirementInputSchema.parse({ promptFragment: validFragment }).promptFragment).toHaveLength(REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH);
    expect(() =>
      createRequirementInputSchema.parse({
        stage: "draft",
        category: "长提示词",
        type: "prefer",
        label: "长提示词片段",
        description: "用于验证 5001 字边界",
        promptFragment: tooLongFragment
      })
    ).toThrow(`提示词不能超过 ${REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH} 字`);
    expect(() => updateRequirementInputSchema.parse({ promptFragment: tooLongFragment })).toThrow(
      `提示词不能超过 ${REQUIREMENT_PROMPT_FRAGMENT_MAX_LENGTH} 字`
    );
  });

  it("lists articles with next action labels", () => {
    const { db } = createTestDatabase();
    createArticle({ topic: "跨境支付通" }, db);

    const articles = listArticles({}, db);
    expect(articles).toHaveLength(1);
    expect(articles[0].nextAction).toBe("生成角度或手动创建角度");
  });

  it("shows the latest topic diagnosis summary in article lists", async () => {
    const { db } = createTestDatabase();
    const diagnosedArticle = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);
    createArticle({ topic: "还没有诊断的主题" }, db);

    await runTopicDiagnosis(diagnosedArticle.id, { customInstruction: "第一次诊断。" }, new FakeAIClient(), db);
    const latest = await runTopicDiagnosis(diagnosedArticle.id, { customInstruction: "强制暂缓。" }, new HoldTopicDiagnosisClient(), db);
    const articles = listArticles({}, db);

    const diagnosedItem = articles.find((article) => article.id === diagnosedArticle.id);
    const missingItem = articles.find((article) => article.topic === "还没有诊断的主题");
    expect(diagnosedItem?.latestTopicDiagnosis?.id).toBe(latest.id);
    expect(diagnosedItem?.latestTopicDiagnosis?.verdict).toBe("hold");
    expect(diagnosedItem?.latestTopicDiagnosis?.verdictLabel).toBe("暂缓");
    expect(diagnosedItem?.latestTopicDiagnosis?.riskSummary).toContain("资料解释");
    expect(missingItem?.latestTopicDiagnosis).toBeNull();
  });

  it("filters article lists by latest topic diagnosis verdict", async () => {
    const { db } = createTestDatabase();
    const passedArticle = createArticle({ topic: "香港账户路径" }, db);
    const heldArticle = createArticle({ topic: "还需要补题的账户文章" }, db);
    const droppedArticle = createArticle({ topic: "不值得继续写的主题" }, db);
    const missingArticle = createArticle({ topic: "还没有诊断的主题" }, db);

    await runTopicDiagnosis(passedArticle.id, {}, new PassTopicDiagnosisClient(), db);
    await runTopicDiagnosis(heldArticle.id, {}, new FakeAIClient(), db);
    await runTopicDiagnosis(heldArticle.id, { customInstruction: "强制暂缓。" }, new HoldTopicDiagnosisClient(), db);
    await runTopicDiagnosis(droppedArticle.id, {}, new DropTopicDiagnosisClient(), db);

    expect(listArticles({ topicDiagnosis: "pass" }, db).map((article) => article.id)).toEqual([passedArticle.id]);
    expect(listArticles({ topicDiagnosis: "hold" }, db).map((article) => article.id)).toEqual([heldArticle.id]);
    expect(listArticles({ topicDiagnosis: "drop" }, db).map((article) => article.id)).toEqual([droppedArticle.id]);
    expect(listArticles({ topicDiagnosis: "missing" }, db).map((article) => article.id)).toEqual([missingArticle.id]);
  });

  it("searches article lists by topic, target reader, core problem and hot anchor", () => {
    const { db } = createTestDatabase();
    const topicArticle = createArticle({ topic: "香港账户还能不能开" }, db);
    const readerArticle = createArticle({ topic: "教育金安排", targetReader: "跨境家庭和香港身份家长" }, db);
    const problemArticle = createArticle({ topic: "现金流规划", coreProblem: "资金路径是否能解释清楚" }, db);
    const anchorArticle = createArticle({ topic: "政策解读", hotAnchor: "跨境支付通新规" }, db);

    expect(listArticles({ query: "账户" }, db).map((article) => article.id)).toEqual([topicArticle.id]);
    expect(listArticles({ query: "身份家长" }, db).map((article) => article.id)).toEqual([readerArticle.id]);
    expect(listArticles({ query: "资金路径" }, db).map((article) => article.id)).toEqual([problemArticle.id]);
    expect(listArticles({ query: "支付通" }, db).map((article) => article.id)).toEqual([anchorArticle.id]);
  });

  it("combines article status, topic diagnosis and keyword filters", async () => {
    const { db } = createTestDatabase();
    const matchingArticle = createArticle(
      {
        topic: "香港账户还能不能开",
        targetReader: "跨境家庭",
        coreProblem: "资金路径是否能解释清楚"
      },
      db
    );
    const wrongVerdictArticle = createArticle({ topic: "香港账户暂缓选题", coreProblem: "资金路径是否能解释清楚" }, db);
    const wrongKeywordArticle = createArticle({ topic: "教育金现金流", coreProblem: "另一个问题" }, db);

    await runTopicDiagnosis(matchingArticle.id, {}, new FakeAIClient(), db);
    await runTopicDiagnosis(wrongVerdictArticle.id, {}, new HoldTopicDiagnosisClient(), db);
    await runTopicDiagnosis(wrongKeywordArticle.id, {}, new FakeAIClient(), db);

    const articles = listArticles({ status: "topic_diagnosed", topicDiagnosis: "revise", query: "资金路径" }, db);

    expect(articles).toHaveLength(1);
    expect(articles[0].id).toBe(matchingArticle.id);
    expect(listArticles({ status: "draft_generated", topicDiagnosis: "revise", query: "不存在" }, db)).toHaveLength(0);
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
    expect(getLatestTopicDiagnosisContext(article.id, db)?.qualityGate?.summaryForDownstream).toContain("资金路径");
    expect(invocations).toHaveLength(1);
    expect(invocations[0].prompt).toContain("重点检查是否有今天点开的理由");
    expect(invocations[0].prompt).toContain("## 节点质量门");
    expect(invocations[0].prompt).toContain("topic.precondition");
    expect(invocations[0].prompt).toContain("artifact");
    expect(invocations[0].response || "").toContain("targetReaderCheck");
    expect(invocations[0].response || "").toContain("qualityGate");
    expect(updated?.status).toBe("topic_diagnosed");
    expect(updated?.nextAction).toBe("生成角度或手动创建角度");
  });

  it("blocks downstream generation when the latest topic diagnosis snapshot is stale", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);

    await runTopicDiagnosis(article.id, {}, new PassTopicDiagnosisClient(), db);
    updateArticle(article.id, { topic: "香港账户还能不能开，资金路径怎么解释" }, db);

    await expect(generateAngles(article.id, new FakeAIClient(), db)).rejects.toThrow("主题已修改，需要重新运行选题诊断后继续");
  });

  it("requires rerunning topic diagnosis when the latest diagnosis has no quality gate", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);

    db.insert(topicDiagnoses)
      .values({
        id: "legacy-topic-diagnosis",
        articleId: article.id,
        ownerId: article.ownerId,
        topicSnapshot: article.topic,
        targetReaderSnapshot: article.targetReader,
        coreProblemSnapshot: article.coreProblem,
        hotAnchorSnapshot: article.hotAnchor,
        customInstructionSnapshot: null,
        verdict: "revise",
        targetReaderCheck: "旧诊断目标读者判断。",
        readerProblemCheck: "旧诊断读者问题判断。",
        timelinessCheck: "旧诊断点开理由。",
        actionabilityCheck: "旧诊断行动性。",
        riskSummary: "旧诊断风险。",
        suggestionsMarkdown: "旧诊断建议。",
        nextAction: "旧诊断下一步。",
        sourceInvocationId: null,
        createdAt: new Date().toISOString()
      })
      .run();

    await expect(generateAngles(article.id, new FakeAIClient(), db)).rejects.toThrow("最新选题诊断缺少质量门结果");
  });

  it("records selected topic requirements in topic diagnosis invocations", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);
    const topicRequirement = listRequirementPresets({ stage: "topic" }, db).find((requirement) => requirement.stableKey === "TOPIC-001");

    expect(topicRequirement).toBeDefined();
    if (!topicRequirement) {
      throw new Error("TOPIC-001 seed requirement missing");
    }
    const diagnosis = await runTopicDiagnosis(
      article.id,
      { customInstruction: "重点检查是否有今天点开的理由。", selectedRequirementIds: [topicRequirement.id] },
      new FakeAIClient(),
      db
    );
    const invocationRequirements = db.select().from(aiInvocationRequirements).all();
    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, diagnosis.sourceInvocationId as string)).get();

    expect(invocationRequirements).toHaveLength(1);
    expect(invocationRequirements[0].requirementPresetId).toBe(topicRequirement.id);
    expect(invocationRequirements[0].stageSnapshot).toBe("topic");
    expect(invocation?.prompt).toContain("目标读者具体");
    expect(invocation?.prompt).toContain("用户本次额外约束");
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
