import { describe, expect, it } from "vitest";

import { stageContractPayloadSchema } from "./stage-contracts";

describe("stage contract payload", () => {
  it("accepts a structured contract with its quality gate", () => {
    const parsed = stageContractPayloadSchema.parse({
      stage: "topic",
      decision: "这个选题值得继续，但必须限定为跨境家庭的真实资金路径。",
      readerPromise: "帮助读者判断自己的资金路径是否讲得清楚。",
      constraints: ["不提供绕监管路径"],
      risks: ["容易写成开户攻略"],
      mustCarryForward: ["资金来源、用途和去向必须一致"],
      doNotDo: ["不承诺开户结果"],
      openQuestions: [],
      evidenceNeeds: ["近期银行审核变化"],
      downstreamHints: { angle: ["从家庭场景切入"] },
      qualityGate: {
        stage: "topic",
        verdict: "pass",
        ownedChecks: [
          {
            checkId: "topic.value",
            status: "pass",
            evidence: "读者和行动价值明确。",
            suggestion: null
          }
        ],
        upstreamRework: [],
        summaryForDownstream: "围绕家庭资金路径生成差异化角度。"
      }
    });

    expect(parsed.stage).toBe("topic");
    expect(parsed.qualityGate?.verdict).toBe("pass");
  });

  it("rejects a quality gate owned by another domain stage", () => {
    const result = stageContractPayloadSchema.safeParse({
      stage: "outline",
      decision: "主线成立。",
      readerPromise: null,
      constraints: [],
      risks: [],
      mustCarryForward: [],
      doNotDo: [],
      openQuestions: [],
      evidenceNeeds: [],
      downstreamHints: {},
      qualityGate: {
        stage: "topic",
        verdict: "pass",
        ownedChecks: [],
        upstreamRework: [],
        summaryForDownstream: "错误阶段。"
      }
    });

    expect(result.success).toBe(false);
  });

  it("normalizes omitted optional collections to stable defaults", () => {
    const parsed = stageContractPayloadSchema.parse({
      stage: "final",
      decision: "v3 已由用户确认为最终稿。"
    });

    expect(parsed).toMatchObject({
      readerPromise: null,
      constraints: [],
      risks: [],
      mustCarryForward: [],
      doNotDo: [],
      openQuestions: [],
      evidenceNeeds: [],
      downstreamHints: {},
      qualityGate: null
    });
  });
});
