import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  aiInvocations,
  aiInvocationRequirements,
  angleCandidates,
  contentDiagnoses,
  draftVersions,
  outlineVersions,
  promptRunArtifacts,
  requirementPresets,
  stagePromptDefaults,
  workflowEvents
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient } from "./ai";
import {
  acceptOutline,
  createArticle,
  createManualAngle,
  generateAngles,
  generateDraft,
  generateOutline,
  getArticle,
  getPromptRecipeForDraft,
  getPromptRecipeForInvocation,
  getPromptRecipeForOutline,
  createRequirementPreset,
  deleteRequirementPreset,
  listPromptRunArtifacts,
  listStagePromptDefaults,
  listRequirementPresets,
  listArticles,
  listDiagnoses,
  listPublishQueueArticles,
  markFinalDraft,
  markReadyToPublish,
  reviseFromDiagnosis,
  resolveSelectedRequirements,
  runDbsContent,
  runPrePublishCheck,
  runReviewCheck,
  saveDraftVersion,
  selectAngle,
  updateDraftVersion,
  updateRequirementPreset,
  updateOutlineVersion,
  updateStagePromptDefault
} from "./articles";

async function createArticleWithDraft(db: ReturnType<typeof createTestDatabase>["db"]) {
  const article = createArticle({ topic: "跨境支付通" }, db);
  const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
  selectAngle(article.id, angle.id, db);
  const outline = await generateOutline(article.id, new FakeAIClient(), db);
  acceptOutline(article.id, outline.id, db);
  const draft = await generateDraft(article.id, new FakeAIClient(), db);
  return { article, draft };
}

describe("article service", () => {
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

  it("returns null for missing articles", () => {
    const { db } = createTestDatabase();
    expect(getArticle("missing", db)).toBeNull();
  });

  it("does not include draft articles in the publish queue", () => {
    const { db } = createTestDatabase();
    createArticle({ topic: "还在写的文章" }, db);
    expect(listPublishQueueArticles(db)).toHaveLength(0);
  });

  it("creates manual angles without AI invocations", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "手动角度" }, db);
    const invocations = db.select().from(aiInvocations).all();

    expect(angle.source).toBe("manual");
    expect(invocations).toHaveLength(0);
  });

  it("generates AI angles and records the invocation", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const requirement = listRequirementPresets({ stage: "angle" }, db)[0];
    const angles = await generateAngles(article.id, new FakeAIClient(), db, {
      customInstruction: "这次只要家庭现金流角度。",
      selectedRequirementIds: [requirement.id]
    });
    const invocations = db.select().from(aiInvocations).all();
    const snapshots = db.select().from(aiInvocationRequirements).all();
    const updated = getArticle(article.id, db);

    expect(angles).toHaveLength(5);
    expect(angles[0].source).toBe("ai");
    expect(invocations[0].taskType).toBe("generate_angles");
    expect(invocations[0].prompt).toContain("这次只要家庭现金流角度。");
    expect(invocations[0].prompt).toContain(requirement.promptFragment);
    expect(snapshots[0].labelSnapshot).toBe(requirement.label);
    expect(updated?.status).toBe("angles_generated");
  });

  it("selects a single angle", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const first = createManualAngle(article.id, { angleTitle: "角度一" }, db);
    const second = createManualAngle(article.id, { angleTitle: "角度二" }, db);

    selectAngle(article.id, first.id, db);
    selectAngle(article.id, second.id, db);

    const selected = db.select().from(angleCandidates).where(eq(angleCandidates.selected, true)).all();
    const updated = getArticle(article.id, db);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(second.id);
    expect(updated?.status).toBe("angle_selected");
  });

  it("reselects an angle after draft generation and keeps previous versions as history", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const first = createManualAngle(article.id, { angleTitle: "开户不是重点" }, db);
    const second = createManualAngle(article.id, { angleTitle: "资金路径才是重点" }, db);

    selectAngle(article.id, first.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);
    await generateDraft(article.id, new FakeAIClient(), db);

    const reselected = selectAngle(article.id, second.id, db);
    const selected = db.select().from(angleCandidates).where(eq(angleCandidates.selected, true)).all();
    const updated = getArticle(article.id, db);
    const outlines = db.select().from(outlineVersions).where(eq(outlineVersions.articleId, article.id)).all();
    const drafts = db.select().from(draftVersions).where(eq(draftVersions.articleId, article.id)).all();
    const reworkEvent = db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.eventType, "select_angle"))
      .all()
      .find((event) => event.fromStatus === "draft_generated" && event.toStatus === "angle_selected");

    expect(reselected.id).toBe(second.id);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(second.id);
    expect(updated?.selectedAngleId).toBe(second.id);
    expect(updated?.status).toBe("angle_selected");
    expect(outlines).toHaveLength(1);
    expect(drafts).toHaveLength(1);
    expect(reworkEvent).toBeDefined();
  });

  it("generates outline, accepts it, and generates a draft", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);

    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);
    const draft = await generateDraft(article.id, new FakeAIClient(), db);
    const saved = saveDraftVersion(article.id, { markdown: `${draft.markdown}\n\n人工补充。` }, db);

    expect(db.select().from(outlineVersions).all()).toHaveLength(1);
    expect(db.select().from(draftVersions).all()).toHaveLength(2);
    expect(draft.sourceOutlineId).toBe(outline.id);
    expect(saved.versionNo).toBe(2);
    expect(getArticle(article.id, db)?.status).toBe("draft_generated");
  });

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
  });

  it("updates an existing draft version without creating a new version", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    const updated = updateDraftVersion(article.id, { draftVersionId: draft.id, markdown: `${draft.markdown}\n\n覆盖当前版本。` }, db);
    const drafts = db.select().from(draftVersions).all();

    expect(updated.versionNo).toBe(1);
    expect(updated.markdown).toContain("覆盖当前版本。");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].markdown).toContain("覆盖当前版本。");
  });

  it("updates an existing outline version without creating a new version", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);

    const updated = updateOutlineVersion(
      article.id,
      {
        outlineVersionId: outline.id,
        mainline: `${outline.mainline} 人工调整`,
        outlineMarkdown: `${outline.outlineMarkdown}\n\n## 新增`
      },
      db
    );
    const outlines = db.select().from(outlineVersions).all();

    expect(updated.versionNo).toBe(1);
    expect(updated.mainline).toContain("人工调整");
    expect(outlines).toHaveLength(1);
    expect(outlines[0].outlineMarkdown).toContain("## 新增");
  });

  it("rejects draft updates when the version belongs to another article", async () => {
    const { db } = createTestDatabase();
    const { draft } = await createArticleWithDraft(db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    expect(() => updateDraftVersion(other.id, { draftVersionId: draft.id, markdown: "错误覆盖" }, db)).toThrow("文案版本不存在");
  });

  it("rejects outline updates when the version belongs to another article", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    expect(() =>
      updateOutlineVersion(other.id, {
        outlineVersionId: outline.id,
        mainline: "错误覆盖",
        outlineMarkdown: "错误覆盖"
      }, db)
    ).toThrow("提纲版本不存在");
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

  it("runs dbs-content diagnosis for a draft version and keeps history", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    const first = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const second = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "dbs_content")).all();

    expect(first.draftVersionId).toBe(draft.id);
    expect(second.id).not.toBe(first.id);
    expect(db.select().from(contentDiagnoses).all()).toHaveLength(2);
    expect(listDiagnoses(article.id, db)).toHaveLength(2);
    expect(invocations).toHaveLength(2);
    expect(getArticle(article.id, db)?.status).toBe("dbs_checking");
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

  it("rejects diagnosis when the draft belongs to another article", async () => {
    const { db } = createTestDatabase();
    const { draft } = await createArticleWithDraft(db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    await expect(runDbsContent(other.id, { draftVersionId: draft.id }, new FakeAIClient(), db)).rejects.toThrow("文案版本不存在");
  });

  it("generates a revision draft from a diagnosis", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);

    const revision = await reviseFromDiagnosis(article.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db);

    expect(revision.versionNo).toBe(2);
    expect(revision.draftType).toBe("revision");
    expect(revision.sourceDiagnosisId).toBe(diagnosis.id);
    expect(db.select().from(draftVersions).all()).toHaveLength(2);
    expect(getArticle(article.id, db)?.status).toBe("revision_generated");
  });

  it("rejects revision when the diagnosis belongs to another article", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    await expect(reviseFromDiagnosis(other.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db)).rejects.toThrow("诊断记录不存在");
  });

  it("allows marking the current draft final after DBS without generating another revision", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);

    expect(getArticle(article.id, db)?.status).toBe("dbs_checking");

    const final = markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    const updatedArticle = getArticle(article.id, db);

    expect(final.isFinal).toBe(true);
    expect(updatedArticle?.status).toBe("human_review");
    expect(updatedArticle?.finalDraftVersionId).toBe(draft.id);
  });

  it("keeps one final draft and requires it before ready-to-publish", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    expect(() => markReadyToPublish(article.id, db)).toThrow("请先标记最终稿");
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const firstRevision = await reviseFromDiagnosis(article.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db);
    const secondRevision = saveDraftVersion(article.id, { markdown: `${firstRevision.markdown}\n\n人工定稿。` }, db);

    markFinalDraft(article.id, { draftVersionId: firstRevision.id }, db);
    markFinalDraft(article.id, { draftVersionId: secondRevision.id }, db);
    const finals = db.select().from(draftVersions).where(eq(draftVersions.isFinal, true)).all();
    const ready = markReadyToPublish(article.id, db);

    expect(finals).toHaveLength(1);
    expect(finals[0].id).toBe(secondRevision.id);
    expect(secondRevision.sourceDiagnosisId).toBe(diagnosis.id);
    expect(getArticle(article.id, db)?.finalDraftVersionId).toBe(secondRevision.id);
    expect(ready.status).toBe("ready_to_publish");
    expect(listPublishQueueArticles(db)).toHaveLength(1);
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
