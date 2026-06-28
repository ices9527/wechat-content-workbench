import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { aiInvocations, contentDiagnoses, draftVersions, workflowEvents } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticleWithDraft, FakeAIClient } from "./articles-test-utils";
import {
  createArticle,
  generateDraft,
  getArticle,
  listDiagnoses,
  reviseFromDiagnosis,
  runDbsContent
} from "./articles";

describe("article dbs, publish, and review service", () => {
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

  it("regenerates a markdown draft after a revision and keeps previous drafts as history", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    await reviseFromDiagnosis(article.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db);

    const regenerated = await generateDraft(article.id, new FakeAIClient(), db);
    const drafts = db.select().from(draftVersions).where(eq(draftVersions.articleId, article.id)).all();
    const reworkEvent = db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.eventType, "generate_draft"))
      .all()
      .find((event) => event.fromStatus === "revision_generated" && event.toStatus === "draft_generated");

    expect(regenerated.versionNo).toBe(3);
    expect(regenerated.draftType).toBe("initial");
    expect(drafts).toHaveLength(3);
    expect(getArticle(article.id, db)?.status).toBe("draft_generated");
    expect(reworkEvent).toBeDefined();
  });

  it("rejects revision when the diagnosis belongs to another article", async () => {
    const { db } = createTestDatabase();
    const { article, draft } = await createArticleWithDraft(db);
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    await expect(reviseFromDiagnosis(other.id, { diagnosisId: diagnosis.id }, new FakeAIClient(), db)).rejects.toThrow("诊断记录不存在");
  });
});
