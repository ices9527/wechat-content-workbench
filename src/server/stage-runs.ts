import { randomUUID } from "node:crypto";

import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";

import { getDatabase, type WorkbenchDatabase } from "@/db/client";
import {
  articleProjects,
  stageContracts,
  stageRuns,
  type ArticleProject,
  type StageContract,
  type StageRun
} from "@/db/schema";
import { stageContractPayloadSchema, type StageContractPayload } from "@/domain/stage-contracts";
import {
  DOMAIN_STAGES,
  STAGE_RUN_STATUSES,
  listDownstreamStages,
  type DomainStage,
  type StageRunStatus
} from "@/domain/workflow-stages";

const inputReferenceSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  versionNo: z.number().int().positive().optional(),
  contractId: z.string().min(1).optional()
});

export type StageInputReference = z.infer<typeof inputReferenceSchema>;

function requireArticle(articleId: string, db: WorkbenchDatabase): ArticleProject {
  const article = db.select().from(articleProjects).where(eq(articleProjects.id, articleId)).get();
  if (!article) {
    throw new Error("文章不存在");
  }
  return article;
}

function requireStageRun(articleId: string, runId: string, db: WorkbenchDatabase): StageRun {
  const run = db
    .select()
    .from(stageRuns)
    .where(and(eq(stageRuns.id, runId), eq(stageRuns.articleId, articleId)))
    .get();
  if (!run) {
    throw new Error("阶段运行记录不存在");
  }
  return run;
}

function nextStageVersion(articleId: string, stage: DomainStage, db: WorkbenchDatabase): number {
  const result = db
    .select({ value: max(stageRuns.versionNo) })
    .from(stageRuns)
    .where(and(eq(stageRuns.articleId, articleId), eq(stageRuns.stage, stage)))
    .get();
  return (result?.value || 0) + 1;
}

export function startStageRun(
  input: {
    articleId: string;
    stage: DomainStage;
    inputRefs?: StageInputReference[];
    sourceInvocationId?: string | null;
    status?: Extract<StageRunStatus, "pending" | "running" | "needs_input">;
  },
  db: WorkbenchDatabase = getDatabase().db
): StageRun {
  const article = requireArticle(input.articleId, db);
  const stage = z.enum(DOMAIN_STAGES).parse(input.stage);
  const inputRefs = z.array(inputReferenceSchema).parse(input.inputRefs || []);
  const run: StageRun = {
    id: randomUUID(),
    articleId: article.id,
    ownerId: article.ownerId,
    stage,
    versionNo: nextStageVersion(article.id, stage, db),
    status: input.status || "running",
    inputRefsJson: JSON.stringify(inputRefs),
    sourceInvocationId: input.sourceInvocationId || null,
    outputArtifactType: null,
    outputArtifactId: null,
    errorMessage: null,
    invalidatedByStage: null,
    invalidationReason: null,
    invalidatedAt: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.insert(stageRuns).values(run).run();
  return run;
}

export function completeStageRun(
  input: {
    articleId: string;
    runId: string;
    status: Extract<StageRunStatus, "needs_input" | "revise" | "approved" | "completed">;
    outputArtifact?: { type: string; id: string } | null;
    sourceInvocationId?: string | null;
    contract: StageContractPayload | z.input<typeof stageContractPayloadSchema>;
    createdBy?: "user" | "ai" | "system";
  },
  db: WorkbenchDatabase = getDatabase().db
): { stageRun: StageRun; stageContract: StageContract } {
  const run = requireStageRun(input.articleId, input.runId, db);
  if (input.contract.stage !== run.stage) {
    throw new Error("StageContract 阶段与 StageRun 不一致");
  }
  const contractPayload = stageContractPayloadSchema.parse(input.contract);
  const completedAt = new Date().toISOString();
  const contract: StageContract = {
    id: randomUUID(),
    articleId: run.articleId,
    ownerId: run.ownerId,
    stageRunId: run.id,
    stage: run.stage,
    versionNo: run.versionNo,
    sourceArtifactType: input.outputArtifact?.type || null,
    sourceArtifactId: input.outputArtifact?.id || null,
    sourceInvocationId: input.sourceInvocationId ?? run.sourceInvocationId,
    contractJson: JSON.stringify(contractPayload),
    createdBy: input.createdBy || "system",
    createdAt: completedAt
  };

  db.transaction(() => {
    db.update(stageRuns)
      .set({
        status: input.status,
        sourceInvocationId: input.sourceInvocationId ?? run.sourceInvocationId,
        outputArtifactType: input.outputArtifact?.type || null,
        outputArtifactId: input.outputArtifact?.id || null,
        completedAt,
        updatedAt: completedAt
      })
      .where(eq(stageRuns.id, run.id))
      .run();
    db.insert(stageContracts).values(contract).run();
  });

  return {
    stageRun: requireStageRun(input.articleId, run.id, db),
    stageContract: contract
  };
}

export function failStageRun(
  articleId: string,
  runId: string,
  error: string,
  db: WorkbenchDatabase = getDatabase().db,
  sourceInvocationId?: string | null
): StageRun {
  const run = requireStageRun(articleId, runId, db);
  const completedAt = new Date().toISOString();
  db.update(stageRuns)
    .set({
      status: "failed",
      sourceInvocationId: sourceInvocationId ?? run.sourceInvocationId,
      errorMessage: error,
      completedAt,
      updatedAt: completedAt
    })
    .where(eq(stageRuns.id, run.id))
    .run();
  return requireStageRun(articleId, runId, db);
}

export function getLatestStageRun(
  articleId: string,
  stage: DomainStage,
  db: WorkbenchDatabase = getDatabase().db
): StageRun | null {
  return (
    db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.articleId, articleId), eq(stageRuns.stage, stage)))
      .orderBy(desc(stageRuns.versionNo))
      .get() || null
  );
}

export function listLatestStageRuns(articleId: string, db: WorkbenchDatabase = getDatabase().db): StageRun[] {
  requireArticle(articleId, db);
  const latestByStage = new Map<string, StageRun>();
  for (const run of db
    .select()
    .from(stageRuns)
    .where(eq(stageRuns.articleId, articleId))
    .orderBy(desc(stageRuns.versionNo))
    .all()) {
    if (!latestByStage.has(run.stage)) {
      latestByStage.set(run.stage, run);
    }
  }
  return DOMAIN_STAGES.flatMap((stage) => {
    const run = latestByStage.get(stage);
    return run ? [run] : [];
  });
}

export function getLatestStageContract(
  articleId: string,
  stage: DomainStage,
  db: WorkbenchDatabase = getDatabase().db
): StageContract | null {
  return (
    db
      .select()
      .from(stageContracts)
      .where(and(eq(stageContracts.articleId, articleId), eq(stageContracts.stage, stage)))
      .orderBy(desc(stageContracts.versionNo))
      .get() || null
  );
}

export function getStageContractForRun(
  articleId: string,
  stageRunId: string,
  db: WorkbenchDatabase = getDatabase().db
): StageContract | null {
  return (
    db
      .select()
      .from(stageContracts)
      .where(and(eq(stageContracts.articleId, articleId), eq(stageContracts.stageRunId, stageRunId)))
      .get() || null
  );
}

export function markDownstreamStageRunsStale(
  articleId: string,
  changedStage: DomainStage,
  db: WorkbenchDatabase = getDatabase().db,
  reason?: string
): string[] {
  requireArticle(articleId, db);
  const staleIds: string[] = [];
  const now = new Date().toISOString();

  db.transaction(() => {
    for (const stage of listDownstreamStages(changedStage)) {
      const current = getLatestStageRun(articleId, stage, db);
      if (!current || current.status === "stale" || current.status === "failed") {
        continue;
      }
      db.update(stageRuns)
        .set({
          status: "stale",
          invalidatedByStage: changedStage,
          invalidationReason: reason || `${changedStage} 阶段已生成新版本。`,
          invalidatedAt: now,
          updatedAt: now
        })
        .where(eq(stageRuns.id, current.id))
        .run();
      staleIds.push(current.id);
    }
  });

  return staleIds;
}

export function isStageRunStatus(value: string): value is StageRunStatus {
  return (STAGE_RUN_STATUSES as readonly string[]).includes(value);
}
