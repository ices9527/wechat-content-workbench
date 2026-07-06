import type { createTestDatabase } from "@/test/test-db";
import type { QualityGateResult } from "@/domain/quality-gates";

import { FakeAIClient, type GeneratedTopicDiagnosis } from "./ai";
import { acceptOutline, createArticle, createManualAngle, generateDraft, generateOutline, selectAngle } from "./articles";

type TestDatabase = ReturnType<typeof createTestDatabase>["db"];

export { FakeAIClient };

export async function createArticleWithDraft(db: TestDatabase) {
  const article = createArticle({ topic: "跨境支付通" }, db);
  const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
  selectAngle(article.id, angle.id, db);
  const outline = await generateOutline(article.id, new FakeAIClient(), db);
  acceptOutline(article.id, outline.id, db);
  const draft = await generateDraft(article.id, new FakeAIClient(), db);
  return { article, draft };
}

export class FailingTopicDiagnosisClient extends FakeAIClient {
  async diagnoseTopic(): Promise<never> {
    throw new Error("topic diagnosis unavailable");
  }
}

function topicQualityGate(verdict: GeneratedTopicDiagnosis["verdict"], summaryForDownstream: string): QualityGateResult {
  const hasIssue = verdict === "revise" || verdict === "hold" || verdict === "drop";
  return {
    stage: "topic",
    verdict,
    ownedChecks: [
      {
        checkId: "topic.precondition",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "前置条件仍需补充。" : "前置条件充分。",
        suggestion: hasIssue ? "补清楚目标读者和真实问题。" : null
      },
      {
        checkId: "topic.value",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "选题价值需要收敛。" : "选题价值明确。",
        suggestion: hasIssue ? "把选题压到可行动判断。" : null
      }
    ],
    upstreamRework: [],
    summaryForDownstream
  };
}

function outlineQualityGate(verdict: QualityGateResult["verdict"], summaryForDownstream: string): QualityGateResult {
  const hasIssue = verdict === "revise" || verdict === "hold" || verdict === "drop";
  return {
    stage: "outline",
    verdict,
    ownedChecks: [
      {
        checkId: "outline.cognitive_gap",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "认知落差不够清楚。" : "认知落差成立。",
        suggestion: hasIssue ? "补清楚旧理解和新判断。" : null
      },
      {
        checkId: "outline.mainline_judgment",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "主线还不够像一句判断。" : "主线是一句判断。",
        suggestion: hasIssue ? "把主线改成一句判断。" : null
      },
      {
        checkId: "outline.structure_load",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "结构不能承载主线。" : "结构能承载主线。",
        suggestion: hasIssue ? "调整章节顺序。" : null
      }
    ],
    upstreamRework: [],
    summaryForDownstream
  };
}

export class PassTopicDiagnosisClient extends FakeAIClient {
  async diagnoseTopic(): Promise<GeneratedTopicDiagnosis> {
    return {
      verdict: "pass",
      targetReaderCheck: "目标读者具体。",
      readerProblemCheck: "真实问题成立。",
      timelinessCheck: "今天有明确点开理由。",
      actionabilityCheck: "可以进入后续内容生产。",
      riskSummary: "选题可以继续推进。",
      suggestionsMarkdown: "## 通过\n- 保持当前边界。",
      nextAction: "进入角度生成。",
      qualityGate: topicQualityGate("pass", "选题可进入角度生成，角度要承接家庭现金流和合规边界。")
    };
  }
}

export class HoldTopicDiagnosisClient extends FakeAIClient {
  async diagnoseTopic(): Promise<GeneratedTopicDiagnosis> {
    return {
      verdict: "hold",
      targetReaderCheck: "目标读者还不够具体。",
      readerProblemCheck: "真实问题没有压实。",
      timelinessCheck: "今天点开的理由不足。",
      actionabilityCheck: "暂时不适合进入后续生产流程。",
      riskSummary: "继续写容易变成资料解释。",
      suggestionsMarkdown: "## 暂缓建议\n- 先补清楚读者为什么今天要看。",
      nextAction: "修改主题或重新运行选题诊断。",
      qualityGate: topicQualityGate("hold", "暂缓进入角度生成；先补清楚读者为什么今天要看。")
    };
  }
}

export class DropTopicDiagnosisClient extends FakeAIClient {
  async diagnoseTopic(): Promise<GeneratedTopicDiagnosis> {
    return {
      verdict: "drop",
      targetReaderCheck: "目标读者不成立。",
      readerProblemCheck: "真实问题不成立。",
      timelinessCheck: "没有今天点开的理由。",
      actionabilityCheck: "不适合进入生产线。",
      riskSummary: "继续写会变成空泛解释。",
      suggestionsMarkdown: "## 放弃建议\n- 换一个更具体的选题。",
      nextAction: "放弃当前选题。",
      qualityGate: topicQualityGate("drop", "放弃当前选题，重新立一个具体读者和真实问题都成立的主题。")
    };
  }
}

export class IncompleteOutlineClient extends FakeAIClient {
  async generateOutline() {
    return {
      mainline: "",
      outlineMarkdown: "## 只有提纲，没有主线",
      qualityGate: outlineQualityGate("revise", "主线为空，不能生成文案。")
    };
  }
}

export class ReviseOutlineQualityGateClient extends FakeAIClient {
  async generateOutline() {
    return {
      mainline: "这篇文章暂时只是资料主题，还没有形成判断。",
      outlineMarkdown: "## 一、资料背景\n- 还没有形成判断推进。",
      qualityGate: outlineQualityGate("revise", "主线仍像资料主题，必须先改成一句判断，再生成文案。")
    };
  }
}

export class EmptyDraftClient extends FakeAIClient {
  async generateDraft() {
    return {
      markdown: ""
    };
  }
}
