import { describe, expect, it } from "vitest";

import { createTestDatabase } from "@/test/test-db";

import { migrateDatabase } from "./migrate";
import {
  aiStyleChecks,
  articleAssets,
  articleProjects,
  draftVersions,
  illustrationPlans,
  stageContracts,
  stageRuns,
  topicVersions,
  wechatDraftUploadImages,
  wechatDraftUploads
} from "./schema";

describe("database migrations", () => {
  it("creates idempotent stage run and stage contract storage", () => {
    const { db, sqlite } = createTestDatabase();

    migrateDatabase(sqlite);
    migrateDatabase(sqlite);

    const runColumns = sqlite.prepare("PRAGMA table_info(stage_runs)").all() as Array<{ name: string }>;
    const contractColumns = sqlite.prepare("PRAGMA table_info(stage_contracts)").all() as Array<{ name: string }>;
    const runIndexes = sqlite.prepare("PRAGMA index_list(stage_runs)").all() as Array<{ name: string }>;
    const contractIndexes = sqlite.prepare("PRAGMA index_list(stage_contracts)").all() as Array<{ name: string }>;

    expect(runColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "article_id",
        "owner_id",
        "stage",
        "version_no",
        "status",
        "input_refs_json",
        "source_invocation_id",
        "output_artifact_type",
        "output_artifact_id",
        "started_at",
        "completed_at"
      ])
    );
    expect(contractColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "article_id",
        "owner_id",
        "stage_run_id",
        "stage",
        "version_no",
        "source_artifact_type",
        "source_artifact_id",
        "source_invocation_id",
        "contract_json",
        "created_by"
      ])
    );
    expect(runIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["stage_runs_article_stage_version_unique", "stage_runs_article_stage_status_index"])
    );
    expect(contractIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["stage_contracts_stage_run_unique", "stage_contracts_article_stage_version_index"])
    );
    expect(db.select().from(stageRuns).all()).toEqual([]);
    expect(db.select().from(stageContracts).all()).toEqual([]);
  });

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

  it("creates article asset inline illustration metadata with ready defaults", () => {
    const { db, sqlite } = createTestDatabase();

    const columns = sqlite.prepare("PRAGMA table_info(article_assets)").all() as Array<{ name: string }>;
    const indexes = sqlite.prepare("PRAGMA index_list(article_assets)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "source_plan_id",
        "source_plan_item_id",
        "status",
        "prompt_snapshot",
        "provider",
        "error_message",
        "generated_at"
      ])
    );
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "article_assets_article_type_created_index",
        "article_assets_source_plan_index",
        "article_assets_plan_item_created_index"
      ])
    );

    db.insert(articleProjects)
      .values({
        id: "article-inline-asset",
        ownerId: "local_user",
        title: "测试文章",
        topic: "测试文章"
      })
      .run();
    db.insert(articleAssets)
      .values({
        id: "asset-inline",
        articleId: "article-inline-asset",
        ownerId: "local_user",
        assetType: "inline_illustration",
        path: "/tmp/inline.svg"
      })
      .run();

    const asset = db.select().from(articleAssets).get();
    expect(asset?.status).toBe("ready");
    expect(asset?.sourcePlanId).toBeNull();
    expect(asset?.provider).toBeNull();
  });

  it("creates WeChat draft body image upload summary storage", () => {
    const { db, sqlite } = createTestDatabase();

    const columns = sqlite.prepare("PRAGMA table_info(wechat_draft_upload_images)").all() as Array<{ name: string }>;
    const indexes = sqlite.prepare("PRAGMA index_list(wechat_draft_upload_images)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "upload_id",
        "article_id",
        "draft_version_id",
        "html_asset_id",
        "asset_id",
        "original_src",
        "wechat_url",
        "status",
        "occurrence_count",
        "alt_texts_json",
        "uploaded_at"
      ])
    );
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "wechat_draft_upload_images_upload_index",
        "wechat_draft_upload_images_article_created_index",
        "wechat_draft_upload_images_asset_index"
      ])
    );

    db.insert(articleProjects)
      .values({
        id: "article-wechat-upload-image",
        ownerId: "local_user",
        title: "测试文章",
        topic: "测试文章"
      })
      .run();
    db.insert(draftVersions)
      .values({
        id: "draft-wechat-upload-image",
        articleId: "article-wechat-upload-image",
        ownerId: "local_user",
        versionNo: 1,
        draftType: "final",
        markdown: "最终稿",
        isFinal: true,
        createdBy: "user"
      })
      .run();
    db.insert(articleAssets)
      .values({
        id: "asset-wechat-upload-image",
        articleId: "article-wechat-upload-image",
        ownerId: "local_user",
        draftVersionId: "draft-wechat-upload-image",
        assetType: "inline_illustration",
        path: "/tmp/body.png"
      })
      .run();
    db.insert(wechatDraftUploads)
      .values({
        id: "upload-wechat-image",
        articleId: "article-wechat-upload-image",
        ownerId: "local_user",
        draftVersionId: "draft-wechat-upload-image",
        status: "success"
      })
      .run();
    db.insert(wechatDraftUploadImages)
      .values({
        id: "upload-image-1",
        uploadId: "upload-wechat-image",
        articleId: "article-wechat-upload-image",
        ownerId: "local_user",
        draftVersionId: "draft-wechat-upload-image",
        assetId: "asset-wechat-upload-image",
        originalSrc: "/api/articles/article-wechat-upload-image/assets/asset-wechat-upload-image/file",
        status: "success"
      })
      .run();

    const record = db.select().from(wechatDraftUploadImages).get();

    expect(record?.occurrenceCount).toBe(1);
    expect(record?.altTextsJson).toBe("[]");
  });

  it("creates topic version storage and backfills existing articles once", () => {
    const { db, sqlite } = createTestDatabase();

    const columns = sqlite.prepare("PRAGMA table_info(topic_versions)").all() as Array<{ name: string }>;
    const indexes = sqlite.prepare("PRAGMA index_list(topic_versions)").all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "article_id",
        "owner_id",
        "version_no",
        "topic",
        "target_reader",
        "core_problem",
        "hot_anchor",
        "created_by",
        "created_at"
      ])
    );
    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["topic_versions_article_version_index"]));

    db.insert(articleProjects)
      .values({
        id: "article-topic-backfill",
        ownerId: "local_user",
        title: "旧文章",
        topic: "旧文章",
        targetReader: "跨境家庭",
        coreProblem: "旧问题",
        hotAnchor: "旧热点",
        createdAt: "2026-07-01T00:00:00.000Z"
      })
      .run();

    migrateDatabase(sqlite);
    migrateDatabase(sqlite);

    const versions = db.select().from(topicVersions).all();

    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      articleId: "article-topic-backfill",
      versionNo: 1,
      topic: "旧文章",
      targetReader: "跨境家庭",
      coreProblem: "旧问题",
      hotAnchor: "旧热点",
      createdBy: "initial",
      createdAt: "2026-07-01T00:00:00.000Z"
    });
  });
});
