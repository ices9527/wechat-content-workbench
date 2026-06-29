import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FakeAIClient,
  OpenAICompatibleClient,
  normalizeGeneratedContentResearch,
  normalizeGeneratedDraft,
  normalizeGeneratedAIStyleCheck,
  normalizeGeneratedOutline,
  normalizeGeneratedTopicDiagnosis
} from "./ai";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
      文章标题: "香港账户还能不能开",
      目标读者: "一线城市中产家庭",
      文章主线: "真正变了的不是开户，而是资金路径能不能解释清楚。",
      提纲: "## 一、账户不是终点\n- 路径才是长期问题。"
    });

    expect(outline.mainline).toContain("资金路径");
    expect(outline.outlineMarkdown).toContain("账户不是终点");
  });

  it("builds outline markdown from structured object responses", () => {
    const outline = normalizeGeneratedOutline({
      主线判断: "账户只是工具，路径才是判断。",
      文章标题: "香港账户还能不能开",
      开头场景: "很多人先问还能不能开户。",
      小标题: ["账户不是终点", "入金和长期使用是两件事"]
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

  it("normalizes topic diagnosis responses with Chinese field names", () => {
    const diagnosis = normalizeGeneratedTopicDiagnosis({
      选题结论: "暂缓",
      目标读者判断: "读者太泛，需要收窄。",
      真实问题: "还没有落到家庭正在处理的问题。",
      今天点开的理由: "热点存在，但和读者关系不够强。",
      可行动性: "需要补充边界和下一步。",
      风险: "容易写成资料罗列。",
      建议: ["先收窄读者", "再补场景"],
      下一步: "改完再生成角度。"
    });

    expect(diagnosis.verdict).toBe("hold");
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
  });

  it("normalizes AI style check responses with standard fields", () => {
    const check = normalizeGeneratedAIStyleCheck({
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
    });

    expect(check.verdict).toBe("heavy_slop");
    expect(check.score).toBe(42);
    expect(check.issues[0].type).toBe("ai_cliche");
  });

  it("normalizes AI style check responses with Chinese fields", () => {
    const check = normalizeGeneratedAIStyleCheck({
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
    });

    expect(check.verdict).toBe("needs_cleanup");
    expect(check.score).toBe(68);
    expect(check.summaryMarkdown).toContain("重复判断");
    expect(check.issues[0].fixDirection).toContain("合并");
  });

  it("rejects high-risk AI style checks without issues", () => {
    expect(() =>
      normalizeGeneratedAIStyleCheck({
        清洁度判断: "重度水分",
        摘要: "有明显问题。",
        问题列表: []
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
