import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocationRequirements, aiInvocations, promptRunArtifacts, requirementPresets, stagePromptDefaults } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft, FakeAIClient } from "./articles-test-utils";
import {
  acceptOutline,
  createArticle,
  createManualAngle,
  deleteRequirementPreset,
  generateDraft,
  generateOutline,
  getPromptRecipeForDraft,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline,
  listPromptRunArtifacts,
  listRequirementPresets,
  markFinalDraft,
  markReadyToPublish,
  reviseFromDiagnosis,
  runDbsContent,
  runPrePublishCheck,
  runReviewCheck,
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
