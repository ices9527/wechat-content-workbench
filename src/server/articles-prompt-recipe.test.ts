import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  aiInvocationRequirements,
  aiInvocations,
  promptRunArtifacts,
  requirementPresets,
  researchVersions,
  stagePromptDefaults
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft, FakeAIClient } from "./articles-test-utils";
import {
  acceptOutline,
  createArticle,
  createManualAngle,
  CUSTOM_INSTRUCTION_MAX_LENGTH,
  deleteRequirementPreset,
  generateDraft,
  generateContentResearch,
  generateIllustrationPlan,
  generateOutline,
  getPromptRecipeForAIStyleCheck,
  getPromptRecipeForDraft,
  getPromptRecipeForIllustrationPlan,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline,
  getPromptRecipeForResearch,
  getPromptRecipeForTopicDiagnosis,
  listPromptRunArtifacts,
  listRequirementPresets,
  markFinalDraft,
  markReadyToPublish,
  reviseFromDiagnosis,
  runDbsContent,
  runAIStyleCheck,
  runPrePublishCheck,
  runReviewCheck,
  runTopicDiagnosis,
  selectAngle,
  updateDraftVersion,
  updateRequirementPreset,
  updateStagePromptDefault
} from "./articles";

describe("article prompt recipe service", () => {
  it("links generated outline and draft versions to prompt recipes", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outlineRequirement = listRequirementPresets({ stage: "outline" }, db)[0];
    const draftRequirement = listRequirementPresets({ stage: "draft" }, db)[0];

    const outline = await generateOutline(article.id, new FakeAIClient(), db, {
      customInstruction: "强调家庭现金流安排。",
      selectedRequirementIds: [outlineRequirement.id]
    });
    acceptOutline(article.id, outline.id, db);
    const draft = await generateDraft(article.id, new FakeAIClient(), db, {
      customInstruction: "开头先从家庭生活场景进入。",
      selectedRequirementIds: [draftRequirement.id]
    });

    const outlineRecipe = getPromptRecipeForOutline(article.id, outline.id, db);
    const draftRecipe = getPromptRecipeForDraft(article.id, draft.id, db);

    expect(outline.sourceInvocationId).toBeTruthy();
    expect(draft.sourceInvocationId).toBeTruthy();
    expect(outlineRecipe.stageDefaultPrompt?.prompt).toContain("主线必须是一句话判断");
    expect(outlineRecipe.selectedRequirements.map((requirement) => requirement.label)).toContain(outlineRequirement.label);
    expect(outlineRecipe.customInstruction).toBe("强调家庭现金流安排。");
    expect(outlineRecipe.finalPrompt).toContain("强调家庭现金流安排。");
    expect(draftRecipe.stageDefaultPrompt?.prompt).toContain("专业克制");
    expect(draftRecipe.selectedRequirements.map((requirement) => requirement.label)).toContain(draftRequirement.label);
    expect(draftRecipe.customInstruction).toBe("开头先从家庭生活场景进入。");
    expect(draftRecipe.finalPrompt).toContain("开头先从家庭生活场景进入。");

    updateStagePromptDefault({ stage: "draft", prompt: "后来改掉的默认提示词" }, db);
    updateRequirementPreset(
      draftRequirement.id,
      {
        label: "后来改掉的标签",
        promptFragment: "后来改掉的可选提示词"
      },
      db
    );
    const recipeAfterPromptEdits = getPromptRecipeForDraft(article.id, draft.id, db);

    expect(recipeAfterPromptEdits.stageDefaultPrompt?.prompt).toContain("专业克制");
    expect(recipeAfterPromptEdits.stageDefaultPrompt?.prompt).not.toContain("后来改掉");
    expect(recipeAfterPromptEdits.selectedRequirements[0].label).toBe(draftRequirement.label);
    expect(recipeAfterPromptEdits.selectedRequirements[0].promptFragment).toBe(draftRequirement.promptFragment);
    expect(recipeAfterPromptEdits.finalPrompt).toContain(draftRequirement.promptFragment);
    expect(recipeAfterPromptEdits.finalPrompt).not.toContain("后来改掉的可选提示词");
  });

  it("keeps long draft custom instructions in AI invocation and prompt recipe snapshots", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);
    const customInstruction = "请".repeat(CUSTOM_INSTRUCTION_MAX_LENGTH);

    const draft = await generateDraft(article.id, new FakeAIClient(), db, { customInstruction });
    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, draft.sourceInvocationId || "")).get();
    const recipe = getPromptRecipeForDraft(article.id, draft.id, db);

    expect(invocation?.customInstruction).toBe(customInstruction);
    expect(recipe.customInstruction).toBe(customInstruction);
    expect(recipe.finalPrompt).toContain(customInstruction);
  });

  it("shows upstream topic diagnosis snapshots in outline and draft prompt recipes", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);
    await runTopicDiagnosis(article.id, {}, new FakeAIClient(), db);
    const angle = createManualAngle(article.id, { angleTitle: "真正变化在资金路径" }, db);
    selectAngle(article.id, angle.id, db);

    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);
    const draft = await generateDraft(article.id, new FakeAIClient(), db);

    const outlineRecipe = getPromptRecipeForOutline(article.id, outline.id, db);
    const draftRecipe = getPromptRecipeForDraft(article.id, draft.id, db);

    expect(outlineRecipe.upstreamTopicDiagnosis?.verdict).toBe("revise");
    expect(outlineRecipe.upstreamTopicDiagnosis?.topicSnapshot).toBe("香港账户还能不能开");
    expect(outlineRecipe.finalPrompt).toContain("上游选题诊断快照");
    expect(draftRecipe.upstreamTopicDiagnosis?.riskSummary).toContain("资料解释");
    expect(draftRecipe.finalPrompt).toContain("本阶段约束");
  });

  it("links topic diagnosis records to their prompt recipes", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开", targetReader: "跨境家庭" }, db);

    const diagnosis = await runTopicDiagnosis(
      article.id,
      { customInstruction: "重点检查今天点开的理由。" },
      new FakeAIClient(),
      db
    );
    const recipe = getPromptRecipeForTopicDiagnosis(article.id, diagnosis.id, db);

    expect(diagnosis.sourceInvocationId).toBeTruthy();
    expect(recipe.invocationId).toBe(diagnosis.sourceInvocationId);
    expect(recipe.taskType).toBe("topic_diagnosis");
    expect(recipe.customInstruction).toBe("重点检查今天点开的理由。");
    expect(recipe.finalPrompt).toContain("只判断这个选题是否值得进入公众号生产线");
    expect(recipe.finalPrompt).toContain("重点检查今天点开的理由。");
  });

  it("links content research packages to their prompt recipes", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通", targetReader: "跨境家庭" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);
    updateStagePromptDefault({ stage: "research", prompt: "默认：只整理研究资料，不写正文。" }, db);
    const requirement = listRequirementPresets({ stage: "research" }, db).find((item) => item.stableKey === "RESEARCH-005");
    if (!requirement) {
      throw new Error("测试缺少内容研究可选提示词");
    }

    const research = await generateContentResearch(
      article.id,
      {
        customInstruction: "重点研究家庭现金流场景。",
        selectedRequirementIds: [requirement.id]
      },
      new FakeAIClient(),
      db
    );
    const recipe = getPromptRecipeForResearch(article.id, research.id, db);

    expect(research.sourceInvocationId).toBeTruthy();
    expect(recipe.invocationId).toBe(research.sourceInvocationId);
    expect(recipe.taskType).toBe("content_research");
    expect(recipe.stageDefaultPrompt?.prompt).toContain("默认：只整理研究资料");
    expect(recipe.selectedRequirements.map((item) => item.label)).toContain(requirement.label);
    expect(recipe.customInstruction).toBe("重点研究家庭现金流场景。");
    expect(recipe.finalPrompt).toContain("输出研究资料包");
    expect(recipe.finalPrompt).toContain("可写方向和不建议写的方向");
    expect(recipe.finalPrompt).toContain("重点研究家庭现金流场景。");
  });

  it("links illustration plans to their prompt recipes", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    const requirement = listRequirementPresets({ stage: "illustration_plan" }, db)[0];

    const plan = await generateIllustrationPlan(
      article.id,
      {
        customInstruction: "只做边界清单图。",
        selectedRequirementIds: [requirement.id]
      },
      new FakeAIClient(),
      db
    );
    const recipe = getPromptRecipeForIllustrationPlan(article.id, plan.id, db);

    expect(plan.sourceInvocationId).toBeTruthy();
    expect(recipe.invocationId).toBe(plan.sourceInvocationId);
    expect(recipe.taskType).toBe("illustration_plan");
    expect(recipe.stageDefaultPrompt?.prompt).toContain("只规划正文配图");
    expect(recipe.selectedRequirements.map((item) => item.label)).toContain(requirement.label);
    expect(recipe.customInstruction).toBe("只做边界清单图。");
    expect(recipe.finalPrompt).toContain("正文配图规划助手");
    expect(recipe.finalPrompt).toContain("只做边界清单图。");
  });

  it("returns an empty prompt recipe for research packages without invocation history", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是表层" }, db);
    selectAngle(article.id, angle.id, db);

    db.insert(researchVersions)
      .values({
        id: "manual-research-version",
        articleId: article.id,
        ownerId: article.ownerId,
        versionNo: 1,
        sourceAngleId: angle.id,
        sourceInvocationId: null,
        summaryMarkdown: "人工摘要",
        researchMarkdown: "## 人工资料包\n\n人工修正内容",
        factsMarkdown: null,
        backgroundMarkdown: null,
        readerQuestionsMarkdown: null,
        boundariesMarkdown: null,
        writeableDirectionsMarkdown: null,
        avoidDirectionsMarkdown: null,
        createdBy: "user",
        createdAt: new Date().toISOString()
      })
      .run();

    const recipe = getPromptRecipeForResearch(article.id, "manual-research-version", db);

    expect(recipe.invocationId).toBeNull();
    expect(recipe.emptyReason).toContain("没有绑定 AI 提示词记录");
    expect(recipe.finalPrompt).toBeNull();
  });

  it("rejects cross-article research prompt recipe lookups", async () => {
    const { db } = createTestDatabase();
    const first = createArticle({ topic: "第一篇" }, db);
    const firstAngle = createManualAngle(first.id, { angleTitle: "第一角度" }, db);
    selectAngle(first.id, firstAngle.id, db);
    const research = await generateContentResearch(first.id, {}, new FakeAIClient(), db);
    const second = createArticle({ topic: "第二篇" }, db);

    expect(() => getPromptRecipeForResearch(second.id, research.id, db)).toThrow("研究资料包不存在");
  });

  it("updates stage default prompts", () => {
    const { db } = createTestDatabase();
    const updated = updateStagePromptDefault({ stage: "draft", prompt: "新的文案默认提示词" }, db);
    const prompts = db.select().from(stagePromptDefaults).where(eq(stagePromptDefaults.stage, "draft")).all();

    expect(updated.prompt).toBe("新的文案默认提示词");
    expect(prompts).toHaveLength(1);
    expect(prompts[0].prompt).toBe("新的文案默认提示词");
  });

  it("includes stage defaults and custom instructions in generation prompts", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    updateStagePromptDefault({ stage: "outline", prompt: "默认：先讲边界" }, db);
    updateStagePromptDefault({ stage: "draft", prompt: "默认：专业克制" }, db);

    const outline = await generateOutline(article.id, new FakeAIClient(), db, { customInstruction: "本次：强调现金流" });
    acceptOutline(article.id, outline.id, db);
    await generateDraft(article.id, new FakeAIClient(), db, { customInstruction: "本次：生活场景开头" });

    const outlineInvocation = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_outline")).get();
    const draftInvocation = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_draft")).get();

    expect(outlineInvocation?.prompt).toContain("默认：先讲边界");
    expect(outlineInvocation?.prompt).toContain("本次：强调现金流");
    expect(draftInvocation?.prompt).toContain("默认：专业克制");
    expect(draftInvocation?.prompt).toContain("本次：生活场景开头");
  });

  it("includes selected requirements in prompts and records snapshots", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outlineRequirement = db
      .select()
      .from(requirementPresets)
      .where(eq(requirementPresets.stableKey, "OUTLINE-003"))
      .get();
    const draftRequirement = db
      .select()
      .from(requirementPresets)
      .where(eq(requirementPresets.stableKey, "STYLE-005"))
      .get();

    if (!outlineRequirement || !draftRequirement) {
      throw new Error("测试缺少默认可选提示词");
    }

    const outline = await generateOutline(article.id, new FakeAIClient(), db, {
      selectedRequirementIds: [outlineRequirement.id]
    });
    acceptOutline(article.id, outline.id, db);
    await generateDraft(article.id, new FakeAIClient(), db, {
      selectedRequirementIds: [draftRequirement.id]
    });

    const outlineInvocation = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_outline")).get();
    const draftInvocation = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_draft")).get();
    const snapshots = db.select().from(aiInvocationRequirements).all();

    expect(outlineInvocation?.prompt).toContain("先讲清楚适用边界");
    expect(draftInvocation?.prompt).toContain("不要使用“不是……而是……”");
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.stableKeySnapshot).sort()).toEqual(["OUTLINE-003", "STYLE-005"]);
  });

  it("archives requirement presets that already have invocation history", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const requirement = db
      .select()
      .from(requirementPresets)
      .where(eq(requirementPresets.stableKey, "OUTLINE-003"))
      .get();
    if (!requirement) {
      throw new Error("测试缺少默认可选提示词");
    }

    await generateOutline(article.id, new FakeAIClient(), db, {
      selectedRequirementIds: [requirement.id]
    });
    const deleted = deleteRequirementPreset(requirement.id, db);
    const saved = db.select().from(requirementPresets).where(eq(requirementPresets.id, requirement.id)).get();

    expect(deleted.deleted).toBe(false);
    expect(deleted.archived).toBe(true);
    expect(saved?.archivedAt).not.toBeNull();
    expect(saved?.enabled).toBe(false);
  });

  it("adds requirement compliance notes to dbs-content when tracked hard rules are violated", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const requirement = db
      .select()
      .from(requirementPresets)
      .where(eq(requirementPresets.stableKey, "STYLE-005"))
      .get();
    if (!requirement) {
      throw new Error("测试缺少默认可选提示词");
    }

    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);
    const draft = await generateDraft(article.id, new FakeAIClient(), db, {
      selectedRequirementIds: [requirement.id]
    });
    updateDraftVersion(
      article.id,
      {
        draftVersionId: draft.id,
        markdown: `${draft.markdown}\n\n这件事不是追求速度，而是重新理解家庭现金流。`
      },
      db
    );

    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    expect(diagnosis.diagnosisMarkdown).toContain("要求遵守情况");
    expect(diagnosis.diagnosisMarkdown).toContain("禁用不是而是");
  });

  it("links dbs-content diagnosis to the prompt recipe", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const requirement = listRequirementPresets({ stage: "dbs" }, db)[0];

    const diagnosis = await runDbsContent(
      article.id,
      {
        draftVersionId: draft.id,
        customInstruction: "只检查标题承诺和首屏判断。",
        selectedRequirementIds: [requirement.id]
      },
      new FakeAIClient(),
      db
    );
    const recipe = getPromptRecipeForInvocation(article.id, diagnosis.sourceInvocationId as string, db);

    expect(diagnosis.sourceInvocationId).toBeTruthy();
    expect(diagnosis.diagnosisMarkdown).toContain("本次 dbs-content 检查要求");
    expect(recipe.taskType).toBe("dbs_content");
    expect(recipe.stageDefaultPrompt?.prompt).toContain("诊断只指出具体问题");
    expect(recipe.selectedRequirements.map((item) => item.label)).toContain(requirement.label);
    expect(recipe.customInstruction).toBe("只检查标题承诺和首屏判断。");
    expect(recipe.finalPrompt).toContain(requirement.promptFragment);
  });

  it("links AI style checks to their prompt recipes", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const requirement = listRequirementPresets({ stage: "ai_style_check" }, db).find((item) => item.stableKey === "AICLEAN-003");
    if (!requirement) {
      throw new Error("测试缺少文案清洁检查可选提示词");
    }

    const check = await runAIStyleCheck(
      article.id,
      {
        draftVersionId: draft.id,
        customInstruction: "重点检查不是而是和重复判断。",
        selectedRequirementIds: [requirement.id]
      },
      new FakeAIClient(),
      db
    );
    const recipe = getPromptRecipeForAIStyleCheck(article.id, check.id, db);

    expect(check.sourceInvocationId).toBeTruthy();
    expect(recipe.invocationId).toBe(check.sourceInvocationId);
    expect(recipe.taskType).toBe("ai_style_check");
    expect(recipe.stageDefaultPrompt?.prompt).toContain("只检查表达层面的水分");
    expect(recipe.selectedRequirements.map((item) => item.label)).toContain(requirement.label);
    expect(recipe.customInstruction).toBe("重点检查不是而是和重复判断。");
    expect(recipe.finalPrompt).toContain(requirement.promptFragment);
    expect(recipe.finalPrompt).toContain("重点检查不是而是和重复判断。");
  });

  it("creates prompt artifacts for pre-publish and review checks", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const revision = await reviseFromDiagnosis(article.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db);
    markFinalDraft(article.id, { draftVersionId: revision.id }, db);
    markReadyToPublish(article.id, db);
    const prePublishRequirement = listRequirementPresets({ stage: "pre_publish" }, db)[0];
    const reviewRequirement = listRequirementPresets({ stage: "review" }, db)[0];

    const prePublishArtifact = await runPrePublishCheck(
      article.id,
      {
        customInstruction: "重点检查转发理由。",
        selectedRequirementIds: [prePublishRequirement.id]
      },
      new FakeAIClient(),
      db
    );
    const reviewArtifact = await runReviewCheck(
      article.id,
      {
        customInstruction: "先看触达，不先怪文案。",
        selectedRequirementIds: [reviewRequirement.id]
      },
      new FakeAIClient(),
      db
    );
    const artifacts = listPromptRunArtifacts(article.id, {}, db);
    const prePublishRecipe = getPromptRecipeForInvocation(article.id, prePublishArtifact.sourceInvocationId as string, db);
    const reviewRecipe = getPromptRecipeForInvocation(article.id, reviewArtifact.sourceInvocationId as string, db);

    expect(db.select().from(promptRunArtifacts).all()).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.stage).sort()).toEqual(["pre_publish", "review"]);
    expect(prePublishArtifact.summaryMarkdown).toContain("发布前检查摘要");
    expect(prePublishArtifact.summaryMarkdown).toContain("本次发布前检查要求");
    expect(reviewArtifact.summaryMarkdown).toContain("复盘归因检查清单");
    expect(reviewArtifact.summaryMarkdown).toContain("本次复盘检查要求");
    expect(prePublishRecipe.taskType).toBe("pre_publish_check");
    expect(prePublishRecipe.selectedRequirements.map((item) => item.label)).toContain(prePublishRequirement.label);
    expect(prePublishRecipe.customInstruction).toBe("重点检查转发理由。");
    expect(reviewRecipe.taskType).toBe("review_check");
    expect(reviewRecipe.selectedRequirements.map((item) => item.label)).toContain(reviewRequirement.label);
    expect(reviewRecipe.customInstruction).toBe("先看触达，不先怪文案。");
  });
});
