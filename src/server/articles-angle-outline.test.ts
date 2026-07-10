import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  aiInvocationRequirements,
  aiInvocations,
  angleCandidates,
  draftVersions,
  outlineVersions,
  stageContracts,
  stageRuns,
  workflowEvents
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient, HoldTopicDiagnosisClient, IncompleteOutlineClient, ReviseOutlineQualityGateClient } from "./articles-test-utils";
import {
  acceptOutline,
  createArticle,
  createManualAngle,
  generateAngles,
  generateDraft,
  generateOutline,
  getArticle,
  listRequirementPresets,
  runTopicDiagnosis,
  saveDraftVersion,
  saveOutlineVersion,
  selectAngle,
  updateOutlineVersion
} from "./articles";

describe("article angle and outline service", () => {
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
    await runTopicDiagnosis(article.id, {}, new FakeAIClient(), db);
    const requirement = listRequirementPresets({ stage: "angle" }, db)[0];
    const angles = await generateAngles(article.id, new FakeAIClient(), db, {
      customInstruction: "这次只要家庭现金流角度。",
      selectedRequirementIds: [requirement.id]
    });
    const invocations = db.select().from(aiInvocations).all();
    const angleInvocation = invocations.find((invocation) => invocation.taskType === "generate_angles");
    const snapshots = db.select().from(aiInvocationRequirements).all();
    const updated = getArticle(article.id, db);

    expect(angles).toHaveLength(5);
    expect(angles[0].source).toBe("ai");
    expect(angleInvocation?.prompt).toContain("这次只要家庭现金流角度。");
    expect(angleInvocation?.prompt).toContain(requirement.promptFragment);
    expect(angleInvocation?.prompt).toContain("结构化上游契约");
    expect(angleInvocation?.prompt).toContain("主题与选题（topic v1）");
    expect(angleInvocation?.prompt).toContain("角度生成必须聚焦跨境家庭的生活资金路径");
    expect(angleInvocation?.prompt).toContain("主要风险是写成资料解释或工具宣传");
    expect(angleInvocation?.upstreamContextJson || "").toContain('"qualityGate"');
    expect(angleInvocation?.upstreamContextJson || "").toContain('"summaryForDownstream"');
    expect(angleInvocation?.upstreamContextJson || "").toContain('"stageContext"');
    expect(angleInvocation?.upstreamContextJson || "").toContain('"contractId"');
    expect(snapshots[0].labelSnapshot).toBe(requirement.label);
    expect(updated?.status).toBe("angles_generated");
    expect(db.select().from(stageRuns).all()).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: "angle", status: "needs_input" })])
    );
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
    const angleRuns = db.select().from(stageRuns).where(eq(stageRuns.stage, "angle")).all();
    const angleContracts = db.select().from(stageContracts).where(eq(stageContracts.stage, "angle")).all();
    expect(angleRuns.filter((run) => run.status === "approved")).toHaveLength(2);
    expect(angleContracts).toHaveLength(2);
    expect(JSON.parse(angleContracts[1].contractJson)).toMatchObject({
      stage: "angle",
      decision: expect.stringContaining("角度二")
    });
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

  it("blocks downstream angle and outline flow when the latest topic diagnosis says hold", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开" }, db);
    const first = createManualAngle(article.id, { angleTitle: "开户不是重点" }, db);
    const second = createManualAngle(article.id, { angleTitle: "资金路径才是重点" }, db);
    selectAngle(article.id, first.id, db);

    await runTopicDiagnosis(article.id, {}, new HoldTopicDiagnosisClient(), db);

    await expect(generateAngles(article.id, new FakeAIClient(), db)).rejects.toThrow("最新选题诊断结论为“暂缓”");
    expect(() => createManualAngle(article.id, { angleTitle: "继续新增" }, db)).toThrow("最新选题诊断结论为“暂缓”");
    expect(() => selectAngle(article.id, second.id, db)).toThrow("最新选题诊断结论为“暂缓”");
    await expect(generateOutline(article.id, new FakeAIClient(), db)).rejects.toThrow("最新选题诊断结论为“暂缓”");

    const selected = db.select().from(angleCandidates).where(eq(angleCandidates.selected, true)).all();
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(first.id);
  });

  it("blocks draft generation when a later topic diagnosis says hold", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "香港账户还能不能开" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "资金路径才是重点" }, db);
    selectAngle(article.id, angle.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);

    await runTopicDiagnosis(article.id, {}, new HoldTopicDiagnosisClient(), db);

    await expect(generateDraft(article.id, new FakeAIClient(), db)).rejects.toThrow("最新选题诊断结论为“暂缓”");
    expect(db.select().from(draftVersions).all()).toHaveLength(0);
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
    const invocations = db.select().from(aiInvocations).all();
    const outlineInvocation = invocations.find((invocation) => invocation.taskType === "generate_outline");
    const draftInvocation = invocations.find((invocation) => invocation.taskType === "generate_draft");

    expect(db.select().from(outlineVersions).all()).toHaveLength(1);
    expect(db.select().from(draftVersions).all()).toHaveLength(2);
    expect(draft.sourceOutlineId).toBe(outline.id);
    expect(outlineInvocation?.prompt).toContain("outline.cognitive_gap");
    expect(outlineInvocation?.response || "").toContain("qualityGate");
    expect(draftInvocation?.prompt).toContain("上游主线提纲质量门");
    expect(draftInvocation?.prompt).toContain("文案必须围绕");
    expect(draftInvocation?.upstreamContextJson || "").toContain("outlineQualityGate");
    expect(saved.versionNo).toBe(2);
    expect(getArticle(article.id, db)?.status).toBe("draft_generated");
    const outlineRuns = db.select().from(stageRuns).where(eq(stageRuns.stage, "outline")).all();
    const outlineContracts = db.select().from(stageContracts).where(eq(stageContracts.stage, "outline")).all();
    expect(outlineRuns.map((run) => run.status)).toEqual(["needs_input", "approved"]);
    expect(outlineContracts).toHaveLength(2);
    expect(JSON.parse(outlineContracts[1].contractJson)).toMatchObject({
      stage: "outline",
      decision: outline.mainline,
      qualityGate: { stage: "outline", verdict: "pass" }
    });
  });

  it("blocks draft generation when the accepted outline quality gate needs revision", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);

    const outline = await generateOutline(article.id, new ReviseOutlineQualityGateClient(), db);
    acceptOutline(article.id, outline.id, db);

    await expect(generateDraft(article.id, new FakeAIClient(), db)).rejects.toThrow("主线和提纲质量门结论为“修改”");
    expect(db.select().from(draftVersions).all()).toHaveLength(0);
  });

  it("blocks draft generation when the accepted outline has no quality gate", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const outline = saveOutlineVersion(
      article.id,
      {
        mainline: "人工主线。",
        outlineMarkdown: "## 人工提纲"
      },
      db
    );
    acceptOutline(article.id, outline.id, db);

    await expect(generateDraft(article.id, new FakeAIClient(), db)).rejects.toThrow("已确认提纲缺少质量门结果");
    expect(db.select().from(draftVersions).all()).toHaveLength(0);
  });

  it("records failed outline invocations when AI returns incomplete structure", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);

    await expect(generateOutline(article.id, new IncompleteOutlineClient(), db)).rejects.toThrow("AI 返回的提纲结构不完整");

    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_outline")).all();
    expect(invocations).toHaveLength(1);
    expect(invocations[0].status).toBe("failed");
    expect(invocations[0].errorMessage).toBe("AI 返回的提纲结构不完整");
    expect(db.select().from(outlineVersions).all()).toHaveLength(0);
    expect(getArticle(article.id, db)?.status).toBe("angle_selected");
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
});
