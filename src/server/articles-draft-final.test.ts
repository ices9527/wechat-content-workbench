import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocations, aiStyleChecks, draftVersions, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft, EmptyDraftClient, FakeAIClient } from "./articles-test-utils";
import {
  acceptOutline,
  createArticle,
  createManualAngle,
  generateDraft,
  generateOutline,
  getArticle,
  listPublishQueueArticles,
  markFinalDraft,
  markReadyToPublish,
  reviseFromAIStyleCheck,
  runAIStyleCheck,
  saveDraftVersion,
  selectAngle,
  updateDraftVersion
} from "./articles";

describe("article draft and final service", () => {
  it("records failed draft invocations when AI returns empty markdown", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);

    await expect(generateDraft(article.id, new EmptyDraftClient(), db)).rejects.toThrow("AI 返回的文案为空");

    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "generate_draft")).all();
    expect(invocations).toHaveLength(1);
    expect(invocations[0].status).toBe("failed");
    expect(invocations[0].prompt).toContain("draft.text_cleanliness");
    expect(invocations[0].errorMessage).toBe("AI 返回的文案为空");
    expect(db.select().from(draftVersions).all()).toHaveLength(0);
    expect(getArticle(article.id, db)?.status).toBe("outline_review");
  });

  it("stores draft quality gate results when generating Markdown drafts", async () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境支付通" }, db);
    const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
    selectAngle(article.id, angle.id, db);
    const outline = await generateOutline(article.id, new FakeAIClient(), db);
    acceptOutline(article.id, outline.id, db);

    const draft = await generateDraft(article.id, new FakeAIClient(), db);
    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, draft.sourceInvocationId as string)).get();
    const response = JSON.parse(invocation?.response || "{}") as { qualityGate?: { stage?: string; ownedChecks?: { checkId: string }[] } };

    expect(draft.markdown).toContain("#");
    expect(invocation?.prompt).toContain("节点质量门");
    expect(invocation?.prompt).toContain("draft.expression_efficiency");
    expect(response.qualityGate?.stage).toBe("draft");
    expect(response.qualityGate?.ownedChecks?.map((item) => item.checkId)).toEqual(
      expect.arrayContaining(["draft.text_cleanliness", "draft.expression_efficiency", "draft.ai_trace"])
    );
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

  it("rejects draft updates when the version belongs to another article", async () => {
    const { db } = createTestDatabase();
    const { draft } = await createArticleWithDraft(db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    expect(() => updateDraftVersion(other.id, { draftVersionId: draft.id, markdown: "错误覆盖" }, db)).toThrow("文案版本不存在");
  });

  it("allows marking the current generated draft final without another revision", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    expect(getArticle(article.id, db)?.status).toBe("draft_generated");

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
    const check = await runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const firstRevision = await reviseFromAIStyleCheck(article.id, { checkId: check.id }, new FakeAIClient(), db);
    const secondRevision = saveDraftVersion(article.id, { markdown: `${firstRevision.markdown}\n\n人工定稿。` }, db);

    markFinalDraft(article.id, { draftVersionId: firstRevision.id }, db);
    markFinalDraft(article.id, { draftVersionId: secondRevision.id }, db);
    const finals = db.select().from(draftVersions).where(eq(draftVersions.isFinal, true)).all();
    const ready = markReadyToPublish(article.id, db);

    expect(finals).toHaveLength(1);
    expect(finals[0].id).toBe(secondRevision.id);
    expect(secondRevision.sourceAIStyleCheckId).toBe(check.id);
    expect(getArticle(article.id, db)?.finalDraftVersionId).toBe(secondRevision.id);
    expect(ready.status).toBe("ready_to_publish");
    expect(listPublishQueueArticles(db)).toHaveLength(1);
  });

  it("requires confirmation before marking a heavy-slop draft final", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    db.insert(aiStyleChecks)
      .values({
        id: "heavy-slop-check",
        articleId: article.id,
        ownerId: article.ownerId,
        draftVersionId: draft.id,
        cleanlinessVerdict: "heavy_slop",
        issueCount: 1,
        summaryMarkdown: "仍存在明显表达水分。",
        issuesJson: "[]"
      })
      .run();

    expect(() => markFinalDraft(article.id, { draftVersionId: draft.id }, db)).toThrow("仍存在明显表达水分");

    const final = markFinalDraft(article.id, { draftVersionId: draft.id, force: true }, db);
    const gateEvent = db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.eventType, "confirm_final_draft_ai_style_check_gate"))
      .get();

    expect(final.isFinal).toBe(true);
    expect(gateEvent?.payloadJson).toContain("heavy-slop-check");
  });
});
