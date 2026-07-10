import { describe, expect, it } from "vitest";

import { stageContracts, stageRuns } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

import { createArticle } from "./articles";
import {
  completeStageRun,
  getLatestStageContract,
  getLatestStageRun,
  markDownstreamStageRunsStale,
  startStageRun
} from "./stage-runs";

function contract(stage: "topic" | "angle" | "research" | "outline" | "draft" | "final", decision: string) {
  return { stage, decision };
}

describe("stage run service", () => {
  it("starts and completes a versioned stage run with a validated contract", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "跨境家庭资金路径" }, db);

    const running = startStageRun(
      {
        articleId: article.id,
        stage: "topic",
        inputRefs: [{ type: "topic_version", id: "topic-v1" }]
      },
      db
    );
    const completed = completeStageRun(
      {
        articleId: article.id,
        runId: running.id,
        status: "approved",
        outputArtifact: { type: "topic_diagnosis", id: "diagnosis-1" },
        contract: contract("topic", "选题成立，可以进入角度。")
      },
      db
    );

    expect(completed.stageRun).toMatchObject({
      articleId: article.id,
      ownerId: article.ownerId,
      stage: "topic",
      versionNo: 1,
      status: "approved",
      outputArtifactType: "topic_diagnosis",
      outputArtifactId: "diagnosis-1"
    });
    expect(completed.stageContract).toMatchObject({
      articleId: article.id,
      stage: "topic",
      stageRunId: running.id,
      versionNo: 1
    });
    expect(JSON.parse(completed.stageContract.contractJson)).toMatchObject({
      stage: "topic",
      decision: "选题成立，可以进入角度。"
    });
    expect(getLatestStageRun(article.id, "topic", db)?.id).toBe(running.id);
    expect(getLatestStageContract(article.id, "topic", db)?.stageRunId).toBe(running.id);
  });

  it("increments versions and rejects cross-article or stage-mismatched completion", () => {
    const { db } = createTestDatabase();
    const firstArticle = createArticle({ topic: "文章一" }, db);
    const secondArticle = createArticle({ topic: "文章二" }, db);
    const first = startStageRun({ articleId: firstArticle.id, stage: "outline" }, db);
    const second = startStageRun({ articleId: firstArticle.id, stage: "outline" }, db);

    expect([first.versionNo, second.versionNo]).toEqual([1, 2]);
    expect(() =>
      completeStageRun(
        {
          articleId: secondArticle.id,
          runId: second.id,
          status: "completed",
          contract: contract("outline", "不应跨文章完成。")
        },
        db
      )
    ).toThrow("阶段运行记录不存在");
    expect(() =>
      completeStageRun(
        {
          articleId: firstArticle.id,
          runId: second.id,
          status: "completed",
          contract: contract("draft", "阶段不匹配。")
        },
        db
      )
    ).toThrow("StageContract 阶段与 StageRun 不一致");
  });

  it("marks only the latest downstream runs stale and preserves history", () => {
    const { db } = createTestDatabase();
    const article = createArticle({ topic: "返工传播" }, db);

    const oldOutline = startStageRun({ articleId: article.id, stage: "outline" }, db);
    completeStageRun(
      {
        articleId: article.id,
        runId: oldOutline.id,
        status: "approved",
        contract: contract("outline", "旧提纲。")
      },
      db
    );
    const currentOutline = startStageRun({ articleId: article.id, stage: "outline" }, db);
    completeStageRun(
      {
        articleId: article.id,
        runId: currentOutline.id,
        status: "approved",
        contract: contract("outline", "当前提纲。")
      },
      db
    );
    const draft = startStageRun({ articleId: article.id, stage: "draft" }, db);
    completeStageRun(
      {
        articleId: article.id,
        runId: draft.id,
        status: "completed",
        contract: contract("draft", "当前文案。")
      },
      db
    );

    const staleIds = markDownstreamStageRunsStale(article.id, "angle", db, "用户重新选择了角度。");
    const storedRuns = db.select().from(stageRuns).all();

    expect(staleIds).toEqual(expect.arrayContaining([currentOutline.id, draft.id]));
    expect(storedRuns.find((run) => run.id === oldOutline.id)?.status).toBe("approved");
    expect(storedRuns.find((run) => run.id === currentOutline.id)?.status).toBe("stale");
    expect(storedRuns.find((run) => run.id === draft.id)?.status).toBe("stale");
    expect(storedRuns.find((run) => run.id === currentOutline.id)).toMatchObject({
      invalidatedByStage: "angle",
      invalidationReason: "用户重新选择了角度。",
      invalidatedAt: expect.any(String)
    });
    expect(db.select().from(stageContracts).all()).toHaveLength(3);
  });
});
