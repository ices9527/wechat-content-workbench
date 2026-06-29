import { describe, expect, it } from "vitest";

import { createTestDatabase } from "@/test/test-db";

import { aiStyleChecks, articleProjects, draftVersions, illustrationPlans } from "./schema";

describe("database migrations", () => {
  it("creates ai style check storage with queryable defaults", () => {
    const { db, sqlite } = createTestDatabase();

    const columns = sqlite.prepare("PRAGMA table_info(ai_style_checks)").all() as Array<{ name: string }>;
    const draftColumns = sqlite.prepare("PRAGMA table_info(draft_versions)").all() as Array<{ name: string }>;
    const indexes = sqlite.prepare("PRAGMA index_list(ai_style_checks)").all() as Array<{ name: string }>;

    expect(draftColumns.map((column) => column.name)).toEqual(expect.arrayContaining(["source_ai_style_check_id"]));
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

  it("creates illustration plan storage with queryable defaults", () => {
    const { db, sqlite } = createTestDatabase();

    const columns = sqlite.prepare("PRAGMA table_info(illustration_plans)").all() as Array<{ name: string }>;
    const indexes = sqlite.prepare("PRAGMA index_list(illustration_plans)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "article_id",
        "final_draft_version_id",
        "source_invocation_id",
        "status",
        "plan_json",
        "summary_markdown",
        "created_by",
        "updated_at"
      ])
    );
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["illustration_plans_article_created_index", "illustration_plans_draft_created_index"])
    );

    db.insert(articleProjects)
      .values({
        id: "article-illustration-plan",
        ownerId: "local_user",
        title: "测试文章",
        topic: "测试文章"
      })
      .run();
    db.insert(draftVersions)
      .values({
        id: "draft-illustration-plan",
        articleId: "article-illustration-plan",
        ownerId: "local_user",
        versionNo: 1,
        draftType: "initial",
        markdown: "这是一段最终稿。",
        isFinal: true,
        createdBy: "user"
      })
      .run();
    db.insert(illustrationPlans)
      .values({
        id: "plan-illustration",
        articleId: "article-illustration-plan",
        ownerId: "local_user",
        finalDraftVersionId: "draft-illustration-plan",
        planJson: JSON.stringify({ items: [] }),
        summaryMarkdown: "暂无配图规划。"
      })
      .run();

    const plan = db.select().from(illustrationPlans).get();
    expect(plan?.status).toBe("draft");
    expect(plan?.createdBy).toBe("ai");
  });
});
