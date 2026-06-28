import { describe, expect, it } from "vitest";

import { createTestDatabase } from "@/test/test-db";

import { FakeAIClient } from "./ai";
import { createArticle, createManualAngle, generateDraft, generateOutline, runDbsContent, selectAngle, acceptOutline } from "./articles";
import { requireDiagnosis, requireDraft, requireOutline } from "./article-records";

async function createArticleWithDraft(db: ReturnType<typeof createTestDatabase>["db"]) {
  const article = createArticle({ topic: "跨境支付通" }, db);
  const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
  selectAngle(article.id, angle.id, db);
  const outline = await generateOutline(article.id, new FakeAIClient(), db);
  acceptOutline(article.id, outline.id, db);
  const draft = await generateDraft(article.id, new FakeAIClient(), db);
  return { article, outline, draft };
}

describe("article record helpers", () => {
  it("returns records scoped to the current article", async () => {
    const { db } = createTestDatabase();
    const { article, outline, draft } = await createArticleWithDraft(db);
    const diagnosis = await runDbsContent(article.id, { draftVersionId: draft.id }, new FakeAIClient(), db);

    expect(requireOutline(article.id, outline.id, db).id).toBe(outline.id);
    expect(requireDraft(article.id, draft.id, db).id).toBe(draft.id);
    expect(requireDiagnosis(article.id, diagnosis.id, db).id).toBe(diagnosis.id);
  });

  it("rejects records that belong to another article", async () => {
    const { db } = createTestDatabase();
    const source = await createArticleWithDraft(db);
    const other = createArticle({ topic: "另一篇文章" }, db);

    expect(() => requireOutline(other.id, source.outline.id, db)).toThrow("提纲版本不存在");
    expect(() => requireDraft(other.id, source.draft.id, db)).toThrow("文案版本不存在");
  });
});
