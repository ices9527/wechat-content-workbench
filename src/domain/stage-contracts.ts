import { z } from "zod";

import {
  QUALITY_CHECK_RESULT_STATUSES,
  QUALITY_GATE_STAGES,
  QUALITY_GATE_VERDICTS,
  findQualityGateResultContractIssues,
  getQualityCheck,
  type QualityGateResult
} from "./quality-gates";
import { DOMAIN_STAGES, type DomainStage } from "./workflow-stages";

const qualityCheckResultSchema = z.object({
  checkId: z.string().refine((value) => Boolean(getQualityCheck(value)), "Unknown quality check"),
  status: z.enum(QUALITY_CHECK_RESULT_STATUSES),
  evidence: z.string().nullable().default(null),
  suggestion: z.string().nullable().default(null)
});

const upstreamReworkSchema = z.object({
  targetStage: z.enum(QUALITY_GATE_STAGES),
  checkId: z.string().refine((value) => Boolean(getQualityCheck(value)), "Unknown quality check"),
  reason: z.string().min(1),
  suggestedAction: z.string().min(1)
});

export const qualityGateResultSchema = z
  .object({
    stage: z.enum(QUALITY_GATE_STAGES),
    verdict: z.enum(QUALITY_GATE_VERDICTS),
    ownedChecks: z.array(qualityCheckResultSchema).default([]),
    upstreamRework: z.array(upstreamReworkSchema).default([]),
    summaryForDownstream: z.string().default("")
  })
  .superRefine((value, context) => {
    for (const issue of findQualityGateResultContractIssues(value as QualityGateResult)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: issue });
    }
  });

const QUALITY_GATE_STAGE_BY_DOMAIN_STAGE: Partial<Record<DomainStage, QualityGateResult["stage"]>> = {
  topic: "topic",
  angle: "angle",
  research: "research",
  outline: "outline",
  draft: "draft",
  illustration: "illustration_plan",
  publish: "pre_publish"
};

export const stageContractPayloadSchema = z
  .object({
    stage: z.enum(DOMAIN_STAGES),
    decision: z.string().min(1),
    readerPromise: z.string().nullable().default(null),
    constraints: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    mustCarryForward: z.array(z.string()).default([]),
    doNotDo: z.array(z.string()).default([]),
    openQuestions: z.array(z.string()).default([]),
    evidenceNeeds: z.array(z.string()).default([]),
    downstreamHints: z.record(z.array(z.string())).default({}),
    qualityGate: qualityGateResultSchema.nullable().default(null)
  })
  .superRefine((value, context) => {
    if (!value.qualityGate) {
      return;
    }
    const expectedStage = QUALITY_GATE_STAGE_BY_DOMAIN_STAGE[value.stage];
    if (!expectedStage || value.qualityGate.stage !== expectedStage) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qualityGate", "stage"],
        message: `QualityGate ${value.qualityGate.stage} does not belong to domain stage ${value.stage}`
      });
    }
  });

export type StageContractPayload = z.infer<typeof stageContractPayloadSchema>;
