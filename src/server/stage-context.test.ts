import { describe, expect, it } from "vitest";

import { createTestDatabase } from "@/test/test-db";

import { createArticle } from "./articles";
import { buildStageContext } from "./stage-context";
import { completeStageRun, markDownstreamStageRunsStale, startStageRun } from "./stage-runs";

function saveContract(
  articleId: string,
  stage: "topic" | "angle" | "research" | "outline" | "draft" | "final" | "illustration",
  decision: string,
  db: ReturnType<typeof createTestDatabase>["db"]
) {
  const run = startStageRun({ articleId, stage }, db);
  return completeStageRun(
    {
      articleId,
      runId: run.id,
      status: stage === "angle" || stage === "outline" || stage === "final" || stage === "illustration" ? "approved" : "completed",
      outputArtifact: { type: `${stage}_artifact`, id: `${stage}-artifact-${run.versionNo}` },
      contract: {
        stage,
        decision,
        mustCarryForward: [`${stage} 必须继续保留`],
        doNotDo: [`${stage} 禁止偏离`]
      }
    },
    db
  );
}

describe("stage context compiler", () => {
  it("compiles required upstream contracts in canonical order", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "上下文编译" }, db);
    const topic = saveContract(article.id, "topic", "选题成立。", db);
    const angle = saveContract(article.id, "angle", "从家庭决策切入。", db);
    const research = saveContract(article.id, "research", "事实边界已整理。", db);
    const outline = saveContract(article.id, "outline", "主线是一句判断。", db);

    const context = buildStageContext(article.id, "draft", db);

    expect(context.missingRequiredStages).toEqual([]);
    expect(context.contracts.map((item) => item.stage)).toEqual(["topic", "angle", "research", "outline"]);
    expect(context.contracts.map((item) => item.contractId)).toEqual([
      topic.stageContract.id,
      angle.stageContract.id,
      research.stageContract.id,
      outline.stageContract.id
    ]);
    expect(context.promptText).toContain("选题成立");
    expect(context.promptText).toContain("outline 必须继续保留");
    expect(context.snapshot.targetStage).toBe("draft");
    expect(context.snapshot.contracts).toHaveLength(4);
  });

  it("reports missing required stages and treats publish illustrations as optional", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "缺失上下文" }, db);
    saveContract(article.id, "final", "最终稿已确认。", db);

    const publishContext = buildStageContext(article.id, "publish", db);
    const draftContext = buildStageContext(article.id, "draft", db);

    expect(publishContext.missingRequiredStages).toEqual([]);
    expect(publishContext.missingOptionalStages).toEqual(["illustration"]);
    expect(publishContext.contracts.map((item) => item.stage)).toEqual(["final"]);
    expect(draftContext.missingRequiredStages).toEqual(["topic", "angle", "research", "outline"]);
  });

  it("does not compile stale or failed current runs", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "过期上下文" }, db);
    saveContract(article.id, "topic", "选题成立。", db);
    saveContract(article.id, "angle", "旧角度。", db);
    saveContract(article.id, "research", "旧研究。", db);
    saveContract(article.id, "outline", "旧提纲。", db);

    markDownstreamStageRunsStale(article.id, "angle", db);
    const context = buildStageContext(article.id, "draft", db);

    expect(context.contracts.map((item) => item.stage)).toEqual(["topic", "angle"]);
    expect(context.missingRequiredStages).toEqual(["research", "outline"]);
  });

  it("does not compile pending, running, or needs-input contracts as usable upstream context", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "尚未确认的上游" }, db);
    const topicRun = startStageRun({ articleId: article.id, stage: "topic" }, db);
    completeStageRun(
      {
        articleId: article.id,
        runId: topicRun.id,
        status: "needs_input",
        contract: { stage: "topic", decision: "主题已修改，等待重新诊断。" }
      },
      db
    );

    const context = buildStageContext(article.id, "angle", db);

    expect(context.contracts).toEqual([]);
    expect(context.missingRequiredStages).toEqual(["topic"]);
  });

  it("never reads contracts from another article", () => {
    const { db } = createTestDatabase();
    const first = createArticle({ topic: "第一篇" }, db);
    const second = createArticle({ topic: "第二篇" }, db);
    saveContract(first.id, "topic", "第一篇选题。", db);

    const context = buildStageContext(second.id, "angle", db);

    expect(context.contracts).toEqual([]);
    expect(context.missingRequiredStages).toEqual(["topic"]);
  });
});
