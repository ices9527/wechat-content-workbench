import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { aiInvocationRequirements, aiInvocations, aiStyleChecks, draftVersions, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft, FakeAIClient } from "./articles-test-utils";
import {
  getArticle,
  listAIStyleChecks,
  listRequirementPresets,
  markFinalDraft,
  markReadyToPublish,
  reviseFromAIStyleCheck,
  runAIStyleCheck,
  runPublishHTMLAIStyleCheck,
  type RunAIStyleCheckInput
} from "./articles";
import type { GeneratedAIStyleCheck, GeneratedDraft } from "./ai";
import { renderWechatHtmlAsset } from "./publishing";

class FailingAIStyleCheckClient extends FakeAIClient {
  async runAIStyleCheck(): Promise<never> {
    throw new Error("ai style check unavailable");
  }
}

class EmptyHighRiskAIStyleCheckClient extends FakeAIClient {
  async runAIStyleCheck(): Promise<GeneratedAIStyleCheck> {
    return {
      verdict: "heavy_slop",
      score: 20,
      summaryMarkdown: "有明显表达水分。",
      issues: []
    };
  }
}

class CleanDraftClient extends FakeAIClient {
  async reviseDraft(): Promise<GeneratedDraft> {
    return {
      markdown: "# 清洁版文案\n\n把模板化表达改成直接判断。"
    };
  }
}

describe("article AI style check service", () => {
  it("runs AI style checks for a draft version and keeps history", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    const first = await runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const second = await runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const checks = listAIStyleChecks(article.id, db);
    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "ai_style_check")).all();

    expect(first.draftVersionId).toBe(draft.id);
    expect(first.cleanlinessVerdict).toBe("needs_cleanup");
    expect(first.issueCount).toBeGreaterThan(0);
    expect(JSON.parse(first.issuesJson)).toHaveLength(first.issueCount);
    expect(second.id).not.toBe(first.id);
    expect(checks).toHaveLength(2);
    expect(invocations).toHaveLength(2);
    expect(getArticle(article.id, db)?.status).toBe("draft_generated");
  });

  it("rejects checks when the draft belongs to another article", async () => {
    const { db } = createTestDatabase();
    const { draft } = await createArticleWithDraft(db);
    const { article: other } = await createArticleWithDraft(db);

    await expect(runAIStyleCheck(other.id, { draftVersionId: draft.id }, new FakeAIClient(), db)).rejects.toThrow("文案版本不存在");
  });

  it("records failed invocations when AI style check fails", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    await expect(runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FailingAIStyleCheckClient(), db)).rejects.toThrow(
      "ai style check unavailable"
    );

    const invocations = db.select().from(aiInvocations).where(eq(aiInvocations.taskType, "ai_style_check")).all();
    expect(invocations).toHaveLength(1);
    expect(invocations[0].status).toBe("failed");
    expect(invocations[0].errorMessage).toContain("ai style check unavailable");
    expect(db.select().from(aiStyleChecks).all()).toHaveLength(0);
  });

  it("rejects high-risk checks without issue details", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);

    await expect(runAIStyleCheck(article.id, { draftVersionId: draft.id }, new EmptyHighRiskAIStyleCheckClient(), db)).rejects.toThrow(
      "AI 返回的问题列表为空"
    );
    expect(db.select().from(aiStyleChecks).all()).toHaveLength(0);
  });

  it("includes default prompts, selected requirements and custom instruction in the invocation", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const requirement = listRequirementPresets({ stage: "ai_style_check" }, db).find((item) => item.stableKey === "AICLEAN-003");
    if (!requirement) {
      throw new Error("missing ai style check requirement");
    }
    const input: RunAIStyleCheckInput = {
      draftVersionId: draft.id,
      customInstruction: "本次重点检查重复判断。",
      selectedRequirementIds: [requirement.id]
    };

    const check = await runAIStyleCheck(article.id, input, new FakeAIClient(), db);
    const invocation = db.select().from(aiInvocations).where(eq(aiInvocations.id, check.sourceInvocationId as string)).get();
    const requirementSnapshots = db.select().from(aiInvocationRequirements).where(eq(aiInvocationRequirements.aiInvocationId, invocation?.id || "")).all();

    expect(invocation?.prompt).toContain("文案清洁检查");
    expect(invocation?.prompt).toContain("只检查表达层面的水分");
    expect(invocation?.prompt).toContain("本次重点检查重复判断");
    expect(invocation?.prompt).toContain(requirement.promptFragment);
    expect(invocation?.customInstruction).toBe("本次重点检查重复判断。");
    expect(invocation?.stagePromptSnapshot).toContain("不替代 dbs-content");
    expect(requirementSnapshots).toHaveLength(1);
    expect(requirementSnapshots[0].stableKeySnapshot).toBe("AICLEAN-003");
  });

  it("does not modify the draft body and records a workflow event", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const originalMarkdown = draft.markdown;

    const check = await runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const updatedDraft = db.select().from(draftVersions).where(eq(draftVersions.id, draft.id)).get();
    const event = db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.eventType, "run_ai_style_check"))
      .get();

    expect(updatedDraft?.markdown).toBe(originalMarkdown);
    expect(event?.fromStatus).toBe("draft_generated");
    expect(event?.toStatus).toBe("draft_generated");
    expect(event?.payloadJson).toContain(check.id);
  });

  it("generates a clean draft version from an AI style check without overwriting the source draft", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const originalMarkdown = draft.markdown;
    const check = await runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);

    const cleanDraft = await reviseFromAIStyleCheck(article.id, { checkId: check.id }, new CleanDraftClient(), db);
    const drafts = db.select().from(draftVersions).where(eq(draftVersions.articleId, article.id)).all();
    const sourceDraft = db.select().from(draftVersions).where(eq(draftVersions.id, draft.id)).get();

    expect(cleanDraft.versionNo).toBe(2);
    expect(cleanDraft.markdown).toContain("清洁版文案");
    expect(cleanDraft.sourceAIStyleCheckId).toBe(check.id);
    expect(cleanDraft.sourceInvocationId).toBeTruthy();
    expect(sourceDraft?.markdown).toBe(originalMarkdown);
    expect(drafts).toHaveLength(2);
    expect(getArticle(article.id, db)?.status).toBe("draft_generated");
  });

  it("rejects clean draft generation from another article's AI style check", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const { article: otherArticle } = await createArticleWithDraft(db);
    const check = await runAIStyleCheck(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);

    await expect(reviseFromAIStyleCheck(otherArticle.id, { checkId: check.id }, new CleanDraftClient(), db)).rejects.toThrow(
      "文案清洁检查记录不存在"
    );
  });

  it("runs AI style checks against generated publish HTML without changing draft history", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "wechat-html-style-check-"));
    markFinalDraft(article.id, { draftVersionId: draft.id }, db);
    markReadyToPublish(article.id, db);
    const htmlAsset = renderWechatHtmlAsset(article.id, db, { assetRoot });

    const check = await runPublishHTMLAIStyleCheck(article.id, { htmlAssetId: htmlAsset.id }, new FakeAIClient(), db);
    const sourceDraft = db.select().from(draftVersions).where(eq(draftVersions.id, draft.id)).get();

    expect(check.sourceType).toBe("publish_html");
    expect(check.draftVersionId).toBe(draft.id);
    expect(check.issueCount).toBeGreaterThan(0);
    expect(sourceDraft?.markdown).toBe(draft.markdown);
  });
});
