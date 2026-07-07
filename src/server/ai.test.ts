import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FakeAIClient,
  OpenAICompatibleClient,
  normalizeGeneratedContentResearch,
  normalizeGeneratedDraft,
  normalizeGeneratedAIStyleCheck,
  normalizeGeneratedIllustrationPlan,
  normalizeGeneratedOutline,
  normalizeGeneratedTopicDiagnosis
} from "./ai";

afterEach(() => {
  vi.unstubAllGlobals();
});

function draftQualityGate(verdict: "pass" | "revise" = "revise") {
  return {
    stage: "draft" as const,
    verdict,
    ownedChecks: [
      {
        checkId: "draft.text_cleanliness" as const,
        status: verdict === "pass" ? ("pass" as const) : ("issue" as const),
        evidence: "文字仍有绕话。",
        suggestion: "删掉绕话。"
      },
      {
        checkId: "draft.expression_efficiency" as const,
        status: verdict === "pass" ? ("pass" as const) : ("issue" as const),
        evidence: "表达可以更短。",
        suggestion: "压缩表达。"
      },
      {
        checkId: "draft.ai_trace" as const,
        status: verdict === "pass" ? ("pass" as const) : ("issue" as const),
        evidence: "有 AI 味句式。",
        suggestion: "改成具体判断。"
      }
    ],
    upstreamRework: [],
    summaryForDownstream: "清洁版要删掉绕话和 AI 味句式。"
  };
}

describe("fake AI client", () => {
  it("generates at least five structured angles", async () => {
    const client = new FakeAIClient();
    const angles = await client.generateAngles();
    expect(angles.length).toBeGreaterThanOrEqual(5);
    expect(angles[0]).toHaveProperty("angleTitle");
    expect(angles[0]).toHaveProperty("readerPain");
  });

  it("generates outline and draft content", async () => {
    const client = new FakeAIClient();
    const topicDiagnosis = await client.diagnoseTopic();
    const outline = await client.generateOutline();
    const draft = await client.generateDraft();

    expect(topicDiagnosis.verdict).toBe("revise");
    expect(topicDiagnosis.targetReaderCheck).toContain("目标读者");
    expect(outline.mainline).toContain("这篇文章");
    expect(draft.markdown).toContain("#");
    expect(draft.qualityGate?.stage).toBe("draft");
  });

  it("generates stable content research", async () => {
    const client = new FakeAIClient();
    const research = await client.generateContentResearch();

    expect(research.factsMarkdown).toContain("跨境支付");
    expect(research.boundariesMarkdown).toContain("监管");
    expect(research.summaryMarkdown).toContain("家庭");
  });

  it("normalizes content research responses with standard fields", () => {
    const research = normalizeGeneratedContentResearch({
      factsMarkdown: "- 事实一",
      backgroundMarkdown: "- 背景一",
      readerQuestionsMarkdown: "- 问题一",
      boundariesMarkdown: "- 边界一",
      writeableDirectionsMarkdown: "- 可写方向一",
      avoidDirectionsMarkdown: "- 不建议方向一",
      summaryMarkdown: "给提纲的摘要"
    });

    expect(research.factsMarkdown).toContain("事实一");
    expect(research.summaryMarkdown).toContain("摘要");
  });

  it("normalizes content research responses with Chinese fields", () => {
    const research = normalizeGeneratedContentResearch({
      核心事实: "- 工具是生活支付工具",
      关键背景: "- 热点容易被写浅",
      读者真实问题: "- 我家是否用得上",
      边界: "- 不能写成投资通道",
      可写方向: "- 家庭现金流",
      不建议写的方向: "- 只讲速度",
      摘要: "后续提纲围绕家庭现金流展开"
    });

    expect(research.boundariesMarkdown).toContain("投资通道");
    expect(research.writeableDirectionsMarkdown).toContain("家庭现金流");
    expect(research.summaryMarkdown).toContain("后续提纲");
  });

  it("builds content research summary from structured object responses", () => {
    const research = normalizeGeneratedContentResearch({
      资料来源判断: ["不要编造来源", "只做内部研究"],
      场景拆解: {
        学费: "需要核验额度",
        生活费: "需要说明用途边界"
      }
    });

    expect(research.summaryMarkdown).toContain("## 资料来源判断");
    expect(research.summaryMarkdown).toContain("## 场景拆解");
  });

  it("rejects empty content research responses", () => {
    expect(() => normalizeGeneratedContentResearch({})).toThrow("AI 返回的研究资料包为空");
  });

  it("normalizes outline responses with Chinese field names", () => {
    const outline = normalizeGeneratedOutline({
      artifact: {
        文章标题: "香港账户还能不能开",
        目标读者: "一线城市中产家庭",
        文章主线: "真正变了的不是开户，而是资金路径能不能解释清楚。",
        提纲: "## 一、账户不是终点\n- 路径才是长期问题。"
      },
      qualityGate: {
        stage: "outline",
        verdict: "pass",
        ownedChecks: [
          {
            checkId: "outline.cognitive_gap",
            status: "pass",
            evidence: "从开户问题推进到资金路径。",
            suggestion: null
          },
          {
            checkId: "outline.mainline_judgment",
            status: "pass",
            evidence: "主线是一句判断。",
            suggestion: null
          },
          {
            checkId: "outline.structure_load",
            status: "pass",
            evidence: "提纲能承载主线。",
            suggestion: null
          }
        ],
        upstreamRework: [],
        summaryForDownstream: "文案要围绕资金路径展开。"
      }
    });

    expect(outline.mainline).toContain("资金路径");
    expect(outline.outlineMarkdown).toContain("账户不是终点");
    expect(outline.qualityGate.summaryForDownstream).toContain("资金路径");
  });

  it("builds outline markdown from structured object responses", () => {
    const outline = normalizeGeneratedOutline({
      artifact: {
        主线判断: "账户只是工具，路径才是判断。",
        文章标题: "香港账户还能不能开",
        开头场景: "很多人先问还能不能开户。",
        小标题: ["账户不是终点", "入金和长期使用是两件事"]
      },
      qualityGate: {
        stage: "outline",
        verdict: "pass",
        ownedChecks: [
          {
            checkId: "outline.cognitive_gap",
            status: "pass",
            evidence: "认知落差成立。",
            suggestion: null
          },
          {
            checkId: "outline.mainline_judgment",
            status: "pass",
            evidence: "主线是一句判断。",
            suggestion: null
          },
          {
            checkId: "outline.structure_load",
            status: "pass",
            evidence: "结构承载成立。",
            suggestion: null
          }
        ],
        upstreamRework: [],
        summaryForDownstream: "文案要按账户工具到资金路径判断推进。"
      }
    });

    expect(outline.mainline).toContain("路径");
    expect(outline.outlineMarkdown).toContain("## 文章标题");
    expect(outline.outlineMarkdown).toContain("## 小标题");
  });

  it("normalizes draft responses with non-standard markdown fields", () => {
    const draft = normalizeGeneratedDraft({
      文案: "# 香港账户还能不能开\n\n真正变了的不是开户，而是资金路径。"
    });

    expect(draft.markdown).toContain("# 香港账户还能不能开");
    expect(draft.markdown).toContain("资金路径");
  });

  it("builds draft markdown from structured object responses", () => {
    const draft = normalizeGeneratedDraft({
      标题: "香港账户还能不能开",
      开头: "很多人先问还能不能开户。",
      正文结构: [
        {
          小标题: "账户不是终点",
          内容: "真正要解释清楚的是资金来源、用途和回流路径。"
        }
      ]
    });

    expect(draft.markdown).toContain("## 标题");
    expect(draft.markdown).toContain("香港账户还能不能开");
    expect(draft.markdown).toContain("账户不是终点");
  });

  it("normalizes topic diagnosis responses with artifact and qualityGate", () => {
    const diagnosis = normalizeGeneratedTopicDiagnosis({
      artifact: {
        目标读者判断: "读者太泛，需要收窄。",
        真实问题: "还没有落到家庭正在处理的问题。",
        今天点开的理由: "热点存在，但和读者关系不够强。",
        可行动性: "需要补充边界和下一步。",
        风险: "容易写成资料罗列。",
        建议: ["先收窄读者", "再补场景"],
        下一步: "改完再生成角度。"
      },
      qualityGate: {
        stage: "topic",
        verdict: "暂缓",
        ownedChecks: [
          {
            checkId: "topic.precondition",
            status: "issue",
            evidence: "读者太泛。",
            suggestion: "先收窄读者。"
          },
          {
            checkId: "topic.value",
            status: "issue",
            evidence: "今天点开的理由不够强。",
            suggestion: "补场景。"
          }
        ],
        upstreamRework: [],
        summaryForDownstream: "先收窄读者，再补场景后才能生成角度。"
      }
    });

    expect(diagnosis.verdict).toBe("hold");
    expect(diagnosis.qualityGate.verdict).toBe("hold");
    expect(diagnosis.qualityGate.summaryForDownstream).toContain("生成角度");
    expect(diagnosis.targetReaderCheck).toContain("收窄");
    expect(diagnosis.suggestionsMarkdown).toContain("先收窄读者");
    expect(diagnosis.nextAction).toContain("生成角度");
  });

  it("generates structured diagnosis and revised draft content", async () => {
    const client = new FakeAIClient();
    const diagnosis = await client.diagnoseContent();
    const revised = await client.reviseDraft();

    expect(diagnosis.diagnosisMarkdown).toContain("内容创作诊断报告");
    expect(diagnosis.textCleanliness).toContain("文字");
    expect(diagnosis.titleCover).toContain("标题");
    expect(diagnosis.expressionEfficiency).toContain("冗余");
    expect(diagnosis.cognitiveGap).toContain("落差");
    expect(diagnosis.aiTrace).toContain("AI");
    expect(revised.markdown).toContain("#");
  });

  it("generates prompt artifacts for publish and review checks", async () => {
    const client = new FakeAIClient();
    const prePublish = await client.generatePrePublishCheck();
    const review = await client.generateReviewCheck();

    expect(prePublish.summaryMarkdown).toContain("发布前检查摘要");
    expect(review.summaryMarkdown).toContain("复盘归因检查清单");
  });

  it("generates stable AI style check output", async () => {
    const client = new FakeAIClient();
    const check = await client.runAIStyleCheck();

    expect(check.verdict).toBe("needs_cleanup");
    expect(check.summaryMarkdown).toContain("重复判断");
    expect(check.issues.length).toBeGreaterThan(0);
    expect(check.issues[0].quote).toBeTruthy();
    expect(check.qualityGate.ownedChecks.map((item) => item.checkId)).toContain("draft.ai_trace");
  });

  it("generates stable illustration planning output", async () => {
    const client = new FakeAIClient();
    const plan = await client.generateIllustrationPlan();

    expect(plan.summary).toContain("正文配图");
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items[0].position).toContain("速度");
    expect(plan.items[0].promptBrief).toContain("流程图");
  });

  it("normalizes illustration plans with standard fields", () => {
    const plan = normalizeGeneratedIllustrationPlan({
      summary: "建议两张图。",
      items: [
        {
          position: "第一节后",
          purpose: "解释路径",
          imageType: "流程图",
          visualBrief: "三个节点",
          promptBrief: "克制流程图",
          doNotVisualize: "不要钞票飞出",
          riskNotes: "不承诺结果"
        }
      ]
    });

    expect(plan.summary).toContain("两张图");
    expect(plan.items[0].imageType).toBe("流程图");
    expect(plan.items[0].riskNotes).toContain("不承诺");
  });

  it("normalizes illustration plans with Chinese fields", () => {
    const plan = normalizeGeneratedIllustrationPlan({
      规划摘要: "建议一张边界图。",
      配图项: [
        {
          插入位置: "边界小节前",
          图片作用: "提醒使用条件",
          图片类型: "边界清单图",
          画面描述: "三列清单",
          生成提示词: "中文信息图",
          不要画什么: "不要收益箭头",
          风险提醒: "不要暗示开户承诺"
        }
      ]
    });

    expect(plan.summary).toContain("边界图");
    expect(plan.items[0].position).toContain("边界");
    expect(plan.items[0].promptBrief).toContain("信息图");
  });

  it("rejects empty illustration plans", () => {
    expect(() => normalizeGeneratedIllustrationPlan({ items: [] })).toThrow("AI 返回的配图规划为空");
    expect(() => normalizeGeneratedIllustrationPlan({ 配图项: [{ 图片作用: "缺位置" }] })).toThrow("AI 返回的配图规划缺少关键字段");
  });

  it("normalizes AI style check responses with standard fields", () => {
    const check = normalizeGeneratedAIStyleCheck({
      artifact: {
        verdict: "heavy_slop",
        score: 42,
        summaryMarkdown: "有明显表达水分。",
        issues: [
          {
            type: "ai_cliche",
            severity: "high",
            quote: "真正改变的不是速度，而是路径。",
            problem: "句式模板化。",
            fixDirection: "改成具体家庭场景。"
          }
        ]
      },
      qualityGate: draftQualityGate("revise")
    });

    expect(check.verdict).toBe("heavy_slop");
    expect(check.score).toBe(42);
    expect(check.issues[0].type).toBe("ai_cliche");
    expect(check.qualityGate.summaryForDownstream).toContain("清洁版");
  });

  it("normalizes AI style check responses with Chinese fields", () => {
    const check = normalizeGeneratedAIStyleCheck({
      artifact: {
        清洁度判断: "需要清理",
        分数: "68 分",
        摘要: "有重复判断。",
        问题列表: [
          {
            问题类型: "repetition",
            严重程度: "medium",
            原文片段: "速度只是表层",
            问题说明: "前面已经说过。",
            修改方向: "合并到上一段。"
          }
        ]
      },
      qualityGate: draftQualityGate("revise")
    });

    expect(check.verdict).toBe("needs_cleanup");
    expect(check.score).toBe(68);
    expect(check.summaryMarkdown).toContain("重复判断");
    expect(check.issues[0].fixDirection).toContain("合并");
  });

  it("rejects high-risk AI style checks without issues", () => {
    expect(() =>
      normalizeGeneratedAIStyleCheck({
        artifact: {
          清洁度判断: "重度水分",
          摘要: "有明显问题。",
          问题列表: []
        },
        qualityGate: draftQualityGate("revise")
      })
    ).toThrow("AI 返回的问题列表为空");
  });

  it("parses fenced JSON from OpenAI compatible responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "```json\n{\"markdown\":\"# 香港账户还能不能开\\n\\n路径才是重点。\"}\n```"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAICompatibleClient({
      databaseUrl: "file::memory:",
      openaiApiKey: "test-key",
      openaiBaseUrl: "http://llm.example/v1",
      openaiModel: "test-model"
    });
    const draft = await client.generateDraft("生成文案");

    expect(draft.markdown).toContain("路径才是重点");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://llm.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("surfaces OpenAI compatible request failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 }))
    );

    const client = new OpenAICompatibleClient({
      databaseUrl: "file::memory:",
      openaiApiKey: "test-key",
      openaiBaseUrl: "http://llm.example/v1",
      openaiModel: "test-model"
    });

    await expect(client.generateDraft("生成文案")).rejects.toThrow("AI request failed: 401");
  });
});
