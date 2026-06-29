import { describe, expect, it } from "vitest";

import { createTestDatabase } from "@/test/test-db";

import { aiStyleChecks, articleProjects, draftVersions } from "./schema";

describe("database migrations", () => {
  it("creates ai style check storage with queryable defaults", () => {
    const { db, sqlite } = createTestDatabase();

    const columns = sqlite.prepare("PRAGMA table_info(ai_style_checks)").all() as Array<{ name: string }>;
    const indexes = sqlite.prepare("PRAGMA index_list(ai_style_checks)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "article_id",
        "draft_version_id",
        "source_invocation_id",
        "source_type",
        "cleanliness_verdict",
        "score",
        "issue_count",
        "summary_markdown",
        "issues_json",
        "custom_instruction_snapshot",
        "created_by"
      ])
    );
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["ai_style_checks_article_created_index", "ai_style_checks_draft_created_index"])
    );

    db.insert(articleProjects)
      .values({
        id: "article-ai-style-check",
        ownerId: "local_user",
        title: "测试文章",
        topic: "测试文章"
      })
      .run();
    db.insert(draftVersions)
      .values({
        id: "draft-ai-style-check",
        articleId: "article-ai-style-check",
        ownerId: "local_user",
        versionNo: 1,
        draftType: "initial",
        markdown: "这是一段有点空泛的文案。",
        createdBy: "user"
      })
      .run();

    db.insert(aiStyleChecks)
      .values({
        id: "check-ai-style",
        articleId: "article-ai-style-check",
        ownerId: "local_user",
        draftVersionId: "draft-ai-style-check",
        cleanlinessVerdict: "needs_cleanup",
        summaryMarkdown: "有一处表达水分。"
      })
      .run();

    const check = db.select().from(aiStyleChecks).get();

    expect(check?.sourceType).toBe("draft_version");
    expect(check?.score).toBeNull();
    expect(check?.issueCount).toBe(0);
    expect(check?.issuesJson).toBe("[]");
    expect(check?.createdBy).toBe("ai");
  });
});
