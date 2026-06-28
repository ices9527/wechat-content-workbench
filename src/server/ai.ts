import { readAppConfig } from "@/config/env";

import { normalizeGeneratedDraft, normalizeGeneratedOutline, normalizeGeneratedTopicDiagnosis } from "./ai-normalizers";

export { normalizeGeneratedDraft, normalizeGeneratedOutline, normalizeGeneratedTopicDiagnosis } from "./ai-normalizers";

export type GeneratedAngle = {
  angleTitle: string;
  readerPain: string;
  promise: string;
  risk: string;
};

export type GeneratedOutline = {
  mainline: string;
  outlineMarkdown: string;
};

export type GeneratedDraft = {
  markdown: string;
};

export type GeneratedDiagnosis = {
  diagnosisMarkdown: string;
  textCleanliness: string;
  titleCover: string;
  expressionEfficiency: string;
  cognitiveGap: string;
  aiTrace: string;
  firstFix: string;
};

export type TopicDiagnosisVerdict = "pass" | "revise" | "hold" | "drop";

export type GeneratedTopicDiagnosis = {
  verdict: TopicDiagnosisVerdict;
  targetReaderCheck: string;
  readerProblemCheck: string;
  timelinessCheck: string;
  actionabilityCheck: string;
  riskSummary: string;
  suggestionsMarkdown: string;
  nextAction: string;
};

export type GeneratedPromptArtifact = {
  summaryMarkdown: string;
};

export type AIClient = {
  model: string;
  baseUrl?: string;
  generateAngles(prompt: string): Promise<GeneratedAngle[]>;
  diagnoseTopic(prompt: string): Promise<GeneratedTopicDiagnosis>;
  generateOutline(prompt: string): Promise<GeneratedOutline>;
  generateDraft(prompt: string): Promise<GeneratedDraft>;
  diagnoseContent(prompt: string): Promise<GeneratedDiagnosis>;
  reviseDraft(prompt: string): Promise<GeneratedDraft>;
  generatePrePublishCheck(prompt: string): Promise<GeneratedPromptArtifact>;
  generateReviewCheck(prompt: string): Promise<GeneratedPromptArtifact>;
};

function parseJsonContent(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed) as Record<string, unknown>;
}

export class FakeAIClient implements AIClient {
  model = "fake-content-model";
  baseUrl = "fake://local";

  async generateAngles(): Promise<GeneratedAngle[]> {
    return [
      {
        angleTitle: "速度只是第一眼，真正变化在资金路径",
        readerPain: "读者只看到到账快，但不知道这件事改变了什么",
        promise: "把热闹新闻翻译成家庭资产配置判断",
        risk: "避免夸大成跨境资金完全自由流动"
      },
      {
        angleTitle: "家长该看懂的不是工具，而是规则边界",
        readerPain: "家庭跨境安排容易把工具便利误解为规则放松",
        promise: "帮读者分清便利、额度和合规责任",
        risk: "需要提示具体限额和监管边界以后续核验为准"
      },
      {
        angleTitle: "跨境支付通不是理财通道，是生活资金通道",
        readerPain: "读者可能把支付便利当作投资通道",
        promise: "澄清使用场景，降低错误决策",
        risk: "标题不能写得像金融产品推荐"
      },
      {
        angleTitle: "对香港身份家庭，支付效率会改变什么",
        readerPain: "读者关心自己家是否用得上",
        promise: "落到学费、生活费、家庭备用金等场景",
        risk: "不能替代个案合规判断"
      },
      {
        angleTitle: "从到账速度看大湾区金融基础设施",
        readerPain: "读者看不到单个功能背后的基础设施意义",
        promise: "把单点新闻放进长期趋势里理解",
        risk: "不要写成宏大叙事而缺少行动建议"
      }
    ];
  }

  async diagnoseTopic(): Promise<GeneratedTopicDiagnosis> {
    return {
      verdict: "revise",
      targetReaderCheck: "目标读者有方向，但需要再具体到正在处理跨境资金安排的家庭。",
      readerProblemCheck: "真实问题不是能不能开户，而是资金路径、用途边界和家庭现金流安排能否解释清楚。",
      timelinessCheck: "有今天点开的理由，但标题需要把热点和家庭决策关系压得更明确。",
      actionabilityCheck: "可以继续进入角度阶段，但角度必须落在生活场景、额度核验和合规边界。",
      riskSummary: "主要风险是写成资料解释或工具宣传，弱化了读者自己的决策问题。",
      suggestionsMarkdown: [
        "## 修改建议",
        "- 把目标读者收窄到已经有香港账户、留学缴费或跨境生活安排的家庭。",
        "- 标题不要只问能不能开，要直接指出真正变化在资金路径。",
        "- 后续角度优先检查生活场景、额度边界和用途边界。"
      ].join("\n"),
      nextAction: "先补一句读者场景，再生成角度。"
    };
  }

  async generateOutline(): Promise<GeneratedOutline> {
    return {
      mainline: "这篇文章不追问到账有多快，而是追问这个工具把哪些家庭跨境资金动作变得更可操作。",
      outlineMarkdown: [
        "## 一、先把热闹放回正确位置",
        "- 到账速度是最容易被看见的变化。",
        "- 但速度不是决策的全部。",
        "",
        "## 二、真正要看的三个边界",
        "- 使用场景边界。",
        "- 额度和合规边界。",
        "- 家庭现金流安排边界。",
        "",
        "## 三、对家庭有什么实际意义",
        "- 学费、生活费、备用金。",
        "- 香港身份和跨境生活安排。",
        "- 不把支付工具误读成投资通道。",
        "",
        "## 四、最后给一个判断框架",
        "- 能不能用。",
        "- 该不该用。",
        "- 用之前要核验什么。"
      ].join("\n")
    };
  }

  async generateDraft(): Promise<GeneratedDraft> {
    return {
      markdown: [
        "# 跨境支付通火了，到账速度只是第一眼",
        "",
        "很多人看到跨境支付通，第一反应是：终于快了。",
        "",
        "但如果只盯着到账速度，这件事就被看浅了。对家庭来说，更重要的问题不是“几秒到账”，而是这个工具到底把哪些原本麻烦的跨境资金动作，变得更可操作。",
        "",
        "## 速度只是入口",
        "",
        "支付工具的价值，表面上是效率，背后其实是路径。路径稳定，家庭才敢把学费、生活费、备用金这些安排放进日常规划里。",
        "",
        "## 不要把工具误读成通道",
        "",
        "它首先是生活资金工具，不是投资通道。越是方便，越要分清使用场景、额度边界和合规责任。",
        "",
        "## 家庭真正该看的",
        "",
        "- 这笔钱是不是生活场景需要？",
        "- 使用前要不要核验额度和身份条件？",
        "- 它能不能减少家庭现金流安排里的摩擦？",
        "",
        "把这三个问题想清楚，比单纯讨论速度更有意义。"
      ].join("\n")
    };
  }

  async diagnoseContent(): Promise<GeneratedDiagnosis> {
    return {
      diagnosisMarkdown: [
        "# 内容创作诊断报告：跨境支付通",
        "",
        "## 推荐形式",
        "- 内容形式：公众号文章",
        "- 推荐平台：公众号",
        "- 理由：这是一个需要解释规则边界的长逻辑题。",
        "",
        "## 五维诊断",
        "| 维度 | 判断 | 说明 |",
        "|------|------|------|",
        "| 文字洁癖 | ⚠️ 有 AI 味需要清洗 | 开头判断还可以更直接，少用泛化表达。 |",
        "| 封面/标题 | ⚠️ 需要优化 | 标题有信息，但缺少一个明确的读者利益。 |",
        "| 表达效率 | ⚠️ 有冗余 | 部分段落在重复“速度不是重点”。 |",
        "| 认知落差 | ✅ 有明显落差 | 能把支付工具和家庭现金流安排连接起来。 |",
        "| AI 痕迹 | ⚠️ 需要清洗 | 个别句子像模型总结，需要换成具体判断。 |",
        "",
        "## 如果要做，第一步是什么",
        "把第一段改成一个直接判断：跨境支付通真正改变的不是到账速度，而是家庭安排跨境生活资金的摩擦。",
        "",
        "## 一句话",
        "这篇文章有判断，但还需要把判断压得更硬。"
      ].join("\n"),
      textCleanliness: "文字洁癖：⚠️ 有 AI 味需要清洗，少用泛化表达，增加具体判断。",
      titleCover: "⚠️ 需要优化：标题需要给出更明确的读者利益。",
      expressionEfficiency: "⚠️ 有冗余：部分段落重复强调速度不是重点。",
      cognitiveGap: "✅ 有明显落差：能把支付工具和家庭现金流连接起来。",
      aiTrace: "AI 痕迹：⚠️ 需要清洗，个别句子像模型总结。",
      firstFix: "把第一段改成一个直接判断，先压住文章主线。"
    };
  }

  async reviseDraft(): Promise<GeneratedDraft> {
    return {
      markdown: [
        "# 跨境支付通火了，真正变的不是到账速度",
        "",
        "跨境支付通最容易被看见的变化，是快。",
        "",
        "但对一个已经在做跨境生活安排的家庭来说，真正重要的不是几秒到账，而是生活资金的路径变得更低摩擦。",
        "",
        "这件事不能被写成“跨境资金更自由了”。它首先还是生活支付工具，不是投资通道，也不是绕开规则的办法。",
        "",
        "## 速度只是表层",
        "",
        "速度会让人兴奋，但稳定路径才会改变家庭决策。学费、生活费、备用金这些钱，如果每次安排都很麻烦，家庭就只能临时处理。",
        "",
        "## 边界比工具更重要",
        "",
        "- 用在什么生活场景？",
        "- 额度和身份条件怎么核验？",
        "- 这笔钱是否真的属于日常现金流安排？",
        "",
        "先回答这三个问题，再谈工具效率。这样看，跨境支付通的意义就不是“快”，而是把一部分原本高摩擦的家庭动作，变成可以提前规划的动作。"
      ].join("\n")
    };
  }

  async generatePrePublishCheck(): Promise<GeneratedPromptArtifact> {
    return {
      summaryMarkdown: [
        "# 发布前检查摘要",
        "",
        "- 标题：需要确认是否有今天点开的理由。",
        "- 首屏：避免资料化开头，优先给出读者关系和核心判断。",
        "- 转发理由：建议准备一句适合朋友圈或社群转发的话。",
        "- 阅读来源：发布前记录预期来源，例如订阅通知、朋友圈、社群或私聊。"
      ].join("\n")
    };
  }

  async generateReviewCheck(): Promise<GeneratedPromptArtifact> {
    return {
      summaryMarkdown: [
        "# 复盘归因检查清单",
        "",
        "- 先查触达：是否通知订阅用户，是否有二次分发。",
        "- 再查分享：分享为 0 时，不先怪正文文笔。",
        "- 再查标题承诺：标题是否说明读者能得到什么判断。",
        "- 最后查正文：是否解释型过重，缺少行动翻译。"
      ].join("\n")
    };
  }
}

export class OpenAICompatibleClient implements AIClient {
  model: string;
  baseUrl?: string;
  private apiKey: string;

  constructor(config = readAppConfig()) {
    if (!config.openaiApiKey || !config.openaiModel) {
      throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required for real AI calls.");
    }
    this.apiKey = config.openaiApiKey;
    this.model = config.openaiModel;
    this.baseUrl = config.openaiBaseUrl || "https://api.openai.com/v1";
  }

  async generateAngles(prompt: string): Promise<GeneratedAngle[]> {
    const json = await this.completeJson(prompt);
    if (!Array.isArray(json.angles)) {
      throw new Error("AI response missing angles array.");
    }
    return json.angles as GeneratedAngle[];
  }

  async diagnoseTopic(prompt: string): Promise<GeneratedTopicDiagnosis> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedTopicDiagnosis(json);
  }

  async generateOutline(prompt: string): Promise<GeneratedOutline> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedOutline(json);
  }

  async generateDraft(prompt: string): Promise<GeneratedDraft> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedDraft(json);
  }

  async diagnoseContent(prompt: string): Promise<GeneratedDiagnosis> {
    const json = await this.completeJson(prompt);
    return {
      diagnosisMarkdown: String(json.diagnosisMarkdown || ""),
      textCleanliness: String(json.textCleanliness || ""),
      titleCover: String(json.titleCover || ""),
      expressionEfficiency: String(json.expressionEfficiency || ""),
      cognitiveGap: String(json.cognitiveGap || ""),
      aiTrace: String(json.aiTrace || ""),
      firstFix: String(json.firstFix || "")
    };
  }

  async reviseDraft(prompt: string): Promise<GeneratedDraft> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedDraft(json);
  }

  async generatePrePublishCheck(prompt: string): Promise<GeneratedPromptArtifact> {
    const json = await this.completeJson(prompt);
    return {
      summaryMarkdown: String(json.summaryMarkdown || "")
    };
  }

  async generateReviewCheck(prompt: string): Promise<GeneratedPromptArtifact> {
    const json = await this.completeJson(prompt);
    return {
      summaryMarkdown: String(json.summaryMarkdown || "")
    };
  }

  private async completeJson(prompt: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: `${prompt}\n\n请只返回 JSON。` }],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI response missing content.");
    }
    return parseJsonContent(content);
  }
}

export function getAIClient(): AIClient {
  const config = readAppConfig();
  if (process.env.NODE_ENV === "test" || process.env.WORKBENCH_USE_FAKE_AI === "1" || !config.openaiApiKey || !config.openaiModel) {
    return new FakeAIClient();
  }
  return new OpenAICompatibleClient(config);
}
