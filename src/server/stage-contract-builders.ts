import type {
  AngleCandidate,
  ArticleProject,
  DraftVersion,
  IllustrationPlan,
  OutlineVersion,
  ResearchVersion
} from "@/db/schema";
import type { StageContractPayload } from "@/domain/stage-contracts";
import type { QualityGateResult } from "@/domain/quality-gates";

import type { GeneratedTopicDiagnosis } from "./ai";

function compact(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim() || "").filter(Boolean);
}

export function buildTopicStageContract(
  article: Pick<ArticleProject, "topic" | "targetReader" | "coreProblem" | "hotAnchor">,
  diagnosis: GeneratedTopicDiagnosis
): StageContractPayload {
  return {
    stage: "topic",
    decision: diagnosis.qualityGate.summaryForDownstream || diagnosis.nextAction || diagnosis.riskSummary,
    readerPromise: article.coreProblem || null,
    constraints: compact([diagnosis.actionabilityCheck, article.hotAnchor ? `热点锚点：${article.hotAnchor}` : null]),
    risks: compact([diagnosis.riskSummary]),
    mustCarryForward: compact([
      diagnosis.qualityGate.summaryForDownstream,
      article.targetReader ? `目标读者：${article.targetReader}` : null,
      article.coreProblem ? `核心问题：${article.coreProblem}` : null
    ]),
    doNotDo: ["不要把选题扩写成与目标读者无关的资料百科。"],
    openQuestions: diagnosis.qualityGate.verdict === "pass" ? [] : compact([diagnosis.nextAction]),
    evidenceNeeds: [],
    downstreamHints: {
      angle: compact([diagnosis.qualityGate.summaryForDownstream]),
      research: compact([diagnosis.riskSummary])
    },
    qualityGate: diagnosis.qualityGate
  };
}

export function buildAngleStageContract(angle: AngleCandidate): StageContractPayload {
  return {
    stage: "angle",
    decision: `已选择“${angle.angleTitle}”作为当前写作角度。`,
    readerPromise: angle.promise || null,
    constraints: compact([angle.readerPain ? `读者问题：${angle.readerPain}` : null]),
    risks: compact([angle.risk]),
    mustCarryForward: compact([angle.angleTitle, angle.readerPain, angle.promise]),
    doNotDo: compact([angle.risk]),
    openQuestions: [],
    evidenceNeeds: [],
    downstreamHints: {
      research: compact([angle.readerPain, angle.risk]),
      outline: compact([angle.promise])
    },
    qualityGate: null
  };
}

export function buildAngleCandidatesStageContract(count: number): StageContractPayload {
  return {
    stage: "angle",
    decision: `已生成 ${count} 个候选角度，等待用户选择。`,
    readerPromise: null,
    constraints: ["选择一个角度后才能进入内容研究。"],
    risks: [],
    mustCarryForward: [],
    doNotDo: [],
    openQuestions: ["用户尚未选择当前写作角度。"],
    evidenceNeeds: [],
    downstreamHints: {},
    qualityGate: null
  };
}

export function buildResearchStageContract(research: ResearchVersion): StageContractPayload {
  return {
    stage: "research",
    decision: research.summaryMarkdown,
    readerPromise: null,
    constraints: compact([research.boundariesMarkdown]),
    risks: compact([research.boundariesMarkdown]),
    mustCarryForward: compact([research.summaryMarkdown, research.writeableDirectionsMarkdown]),
    doNotDo: compact([research.avoidDirectionsMarkdown]),
    openQuestions: [],
    evidenceNeeds: compact([research.factsMarkdown]),
    downstreamHints: { outline: compact([research.summaryMarkdown, research.writeableDirectionsMarkdown]) },
    qualityGate: null
  };
}

export function buildOutlineStageContract(outline: OutlineVersion, qualityGate: QualityGateResult | null): StageContractPayload {
  return {
    stage: "outline",
    decision: outline.mainline,
    readerPromise: null,
    constraints: [],
    risks: qualityGate?.ownedChecks.filter((item) => item.status === "issue").flatMap((item) => compact([item.evidence])) || [],
    mustCarryForward: compact([outline.mainline, qualityGate?.summaryForDownstream]),
    doNotDo: [],
    openQuestions: qualityGate?.upstreamRework.map((item) => item.reason) || ["提纲尚未生成质量门结果。"],
    evidenceNeeds: [],
    downstreamHints: { draft: compact([qualityGate?.summaryForDownstream]) },
    qualityGate
  };
}

export function buildDraftStageContract(draft: DraftVersion, qualityGate: QualityGateResult | null): StageContractPayload {
  return {
    stage: "draft",
    decision: qualityGate?.summaryForDownstream || `Markdown 文案 v${draft.versionNo} 已生成。`,
    readerPromise: null,
    constraints: [],
    risks: qualityGate?.ownedChecks.filter((item) => item.status === "issue").flatMap((item) => compact([item.evidence])) || [],
    mustCarryForward: compact([qualityGate?.summaryForDownstream]),
    doNotDo: [],
    openQuestions: qualityGate?.upstreamRework.map((item) => item.reason) || ["当前文案版本尚未经过质量门检查。"],
    evidenceNeeds: [],
    downstreamHints: { final: compact([qualityGate?.summaryForDownstream]) },
    qualityGate
  };
}

export function buildFinalStageContract(draft: DraftVersion): StageContractPayload {
  return {
    stage: "final",
    decision: `Markdown 文案 v${draft.versionNo} 已由用户确认为最终稿。`,
    readerPromise: null,
    constraints: ["发布、配图和复盘必须绑定该最终稿版本。"],
    risks: [],
    mustCarryForward: [`最终稿版本：v${draft.versionNo}`, `最终稿 ID：${draft.id}`],
    doNotDo: ["不得静默使用其他文案版本生成发布包。"],
    openQuestions: [],
    evidenceNeeds: [],
    downstreamHints: { illustration: [`读取最终稿 v${draft.versionNo}`], publish: [`读取最终稿 v${draft.versionNo}`] },
    qualityGate: null
  };
}

export function buildIllustrationStageContract(plan: IllustrationPlan): StageContractPayload {
  return {
    stage: "illustration",
    decision: plan.summaryMarkdown,
    readerPromise: null,
    constraints: ["每张正文图必须服务正文理解并绑定插入位置。"],
    risks: [],
    mustCarryForward: [`配图规划 ID：${plan.id}`],
    doNotDo: ["不允许测试占位图进入公众号草稿箱。"],
    openQuestions: plan.status === "confirmed" ? [] : ["配图规划尚未确认。"],
    evidenceNeeds: [],
    downstreamHints: { publish: [plan.summaryMarkdown] },
    qualityGate: null
  };
}

export function buildPublishStageContract(input: {
  decision: string;
  finalDraft: Pick<DraftVersion, "id" | "versionNo">;
  constraints?: string[];
  risks?: string[];
  openQuestions?: string[];
  artifactReferences?: string[];
}): StageContractPayload {
  return {
    stage: "publish",
    decision: input.decision,
    readerPromise: null,
    constraints: input.constraints || [],
    risks: input.risks || [],
    mustCarryForward: [
      `最终稿版本：v${input.finalDraft.versionNo}`,
      `最终稿 ID：${input.finalDraft.id}`,
      ...(input.artifactReferences || [])
    ],
    doNotDo: ["不得静默切换最终稿或忽略发布阻断提示。"],
    openQuestions: input.openQuestions || [],
    evidenceNeeds: [],
    downstreamHints: { review: [input.decision] },
    qualityGate: null
  };
}
