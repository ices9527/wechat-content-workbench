import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocationRequirements, aiInvocations, angleCandidates, draftVersions, outlineVersions, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient, IncompleteOutlineClient } from "./articles-test-utils";
import {
  acceptOutline,
  createArticle,
  createManualAngle,
  generateAngles,
  generateDraft,
  generateOutline,
  getArticle,
  listRequirementPresets,
  saveDraftVersion,
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
