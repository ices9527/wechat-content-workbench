import { readAppConfig } from "@/config/env";
import type { QualityGateResult } from "@/domain/quality-gates";

import {
  normalizeGeneratedContentResearch,
  normalizeGeneratedDraft,
  normalizeGeneratedAIStyleCheck,
  normalizeGeneratedIllustrationPlan,
  normalizeGeneratedOutline,
  normalizeGeneratedTopicDiagnosis
} from "./ai-normalizers";

export {
  normalizeGeneratedContentResearch,
  normalizeGeneratedDraft,
  normalizeGeneratedAIStyleCheck,
  normalizeGeneratedIllustrationPlan,
  normalizeGeneratedOutline,
  normalizeGeneratedTopicDiagnosis
} from "./ai-normalizers";

export type GeneratedAngle = {
  angleTitle: string;
  readerPain: string;
  promise: string;
  risk: string;
};

export type GeneratedOutline = {
  mainline: string;
  outlineMarkdown: string;
  qualityGate: QualityGateResult;
};

export type GeneratedDraft = {
  markdown: string;
  qualityGate?: QualityGateResult;
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
  qualityGate: QualityGateResult;
};

export type GeneratedContentResearch = {
  factsMarkdown: string;
  backgroundMarkdown: string;
  readerQuestionsMarkdown: string;
  boundariesMarkdown: string;
  writeableDirectionsMarkdown: string;
  avoidDirectionsMarkdown: string;
  summaryMarkdown: string;
};

export type GeneratedIllustrationPlanItem = {
  position: string;
  purpose: string;
  imageType: string;
  visualBrief: string;
  promptBrief: string;
  doNotVisualize: string;
  riskNotes: string;
};

export type GeneratedIllustrationPlan = {
  summary: string;
  items: GeneratedIllustrationPlanItem[];
};

export type GeneratedPromptArtifact = {
  summaryMarkdown: string;
};

export type AIStyleCheckVerdict = "clean" | "minor" | "needs_cleanup" | "heavy_slop";

export type GeneratedAIStyleCheckIssue = {
  type: string;
  severity: string;
  quote: string;
  problem: string;
  fixDirection: string;
};

export type GeneratedAIStyleCheck = {
  verdict: AIStyleCheckVerdict;
  score: number | null;
  summaryMarkdown: string;
  issues: GeneratedAIStyleCheckIssue[];
  qualityGate: QualityGateResult;
};

export type AIClient = {
  model: string;
  baseUrl?: string;
  generateAngles(prompt: string): Promise<GeneratedAngle[]>;
  diagnoseTopic(prompt: string): Promise<GeneratedTopicDiagnosis>;
  generateContentResearch(prompt: string): Promise<GeneratedContentResearch>;
  generateOutline(prompt: string): Promise<GeneratedOutline>;
  generateDraft(prompt: string): Promise<GeneratedDraft>;
  runAIStyleCheck(prompt: string): Promise<GeneratedAIStyleCheck>;
  generateIllustrationPlan(prompt: string): Promise<GeneratedIllustrationPlan>;
  reviseDraft(prompt: string): Promise<GeneratedDraft>;
  generatePrePublishCheck(prompt: string): Promise<GeneratedPromptArtifact>;
  generateReviewCheck(prompt: string): Promise<GeneratedPromptArtifact>;
};

function parseJsonContent(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed) as Record<string, unknown>;
}

function fakeTopicQualityGate(verdict: TopicDiagnosisVerdict, summaryForDownstream: string): QualityGateResult {
  const hasIssue = verdict === "revise" || verdict === "hold" || verdict === "drop";
  return {
    stage: "topic",
    verdict,
    ownedChecks: [
      {
        checkId: "topic.precondition",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "选题前置条件需要补强。" : "选题具备进入后续生产线的前置条件。",
        suggestion: hasIssue ? "先补齐读者、真实问题和今天点开的理由。" : null
      },
      {
        checkId: "topic.value",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "选题价值需要进一步收敛。" : "选题具备明确读者、问题和行动价值。",
        suggestion: hasIssue ? "把主题压到家庭现金流、用途边界和合规核验。" : null
      }
    ],
    upstreamRework: [],
    summaryForDownstream
  };
}

function fakeOutlineQualityGate(verdict: QualityGateResult["verdict"], summaryForDownstream: string): QualityGateResult {
  const hasIssue = verdict === "revise" || verdict === "hold" || verdict === "drop";
  return {
    stage: "outline",
    verdict,
    ownedChecks: [
      {
        checkId: "outline.cognitive_gap",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "认知落差还需要压实。" : "文章能从旧理解推进到新判断。",
        suggestion: hasIssue ? "先明确读者原本误解和文章要替换成的新判断。" : null
      },
      {
        checkId: "outline.mainline_judgment",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "主线还不够像一句判断。" : "主线是一句可承载全文的判断。",
        suggestion: hasIssue ? "把主线改成一句判断，不写成资料主题。" : null
      },
      {
        checkId: "outline.structure_load",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "提纲结构还不能充分承载主线。" : "提纲章节顺序可以承载主线推进。",
        suggestion: hasIssue ? "让每一节只承载一个判断，并按读者理解顺序推进。" : null
      }
    ],
    upstreamRework: [],
    summaryForDownstream
  };
}

function fakeDraftQualityGate(verdict: QualityGateResult["verdict"], summaryForDownstream: string): QualityGateResult {
  const hasIssue = verdict === "revise" || verdict === "hold" || verdict === "drop";
  return {
    stage: "draft",
    verdict,
    ownedChecks: [
      {
        checkId: "draft.text_cleanliness",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "文案仍有空话、绕话或重复铺垫。" : "文案表达相对克制，没有明显空话和绕话。",
        suggestion: hasIssue ? "删掉泛泛判断和重复铺垫，保留具体场景判断。" : null
      },
      {
        checkId: "draft.expression_efficiency",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "部分句子可以更短、更直接。" : "核心信息表达直接，段落推进清楚。",
        suggestion: hasIssue ? "把长句拆短，减少同义重复。" : null
      },
      {
        checkId: "draft.ai_trace",
        status: hasIssue ? "issue" : "pass",
        evidence: hasIssue ? "存在模板化转折或 AI 味总结。" : "没有明显模板化 AI 表达。",
        suggestion: hasIssue ? "替换“不是……而是……”等机械转折，改成更具体的家庭判断。" : null
      }
    ],
    upstreamRework: [],
    summaryForDownstream
  };
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

  async diagnoseTopic(prompt = ""): Promise<GeneratedTopicDiagnosis> {
    const normalizedPrompt = prompt.toLowerCase();
    if (prompt.includes("强制暂缓") || normalizedPrompt.includes("force hold") || normalizedPrompt.includes("verdict: hold")) {
      return {
        verdict: "hold",
        targetReaderCheck: "目标读者还不够具体。",
        readerProblemCheck: "真实问题没有压实。",
        timelinessCheck: "今天点开的理由不足。",
        actionabilityCheck: "暂时不适合进入后续生产流程。",
        riskSummary: "继续写容易变成资料解释。",
        suggestionsMarkdown: "## 暂缓建议\n- 先补清楚读者为什么今天要看。",
        nextAction: "修改主题或重新运行选题诊断。",
        qualityGate: fakeTopicQualityGate("hold", "暂缓进入角度生成；先补清楚目标读者、真实问题和今天点开的理由。")
      };
    }
    if (prompt.includes("强制放弃") || normalizedPrompt.includes("force drop") || normalizedPrompt.includes("verdict: drop")) {
      return {
        verdict: "drop",
        targetReaderCheck: "目标读者过于泛化。",
        readerProblemCheck: "读者问题不成立。",
        timelinessCheck: "没有今天点开的理由。",
        actionabilityCheck: "不建议进入后续生产流程。",
        riskSummary: "继续写会变成无明确读者的资料整理。",
        suggestionsMarkdown: "## 放弃建议\n- 换一个更具体的主题。",
        nextAction: "放弃当前主题，重新立题。",
        qualityGate: fakeTopicQualityGate("drop", "放弃当前主题；重新立一个有明确读者和真实问题的选题。")
      };
    }
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
      nextAction: "先补一句读者场景，再生成角度。",
      qualityGate: fakeTopicQualityGate("revise", "角度生成必须聚焦跨境家庭的生活资金路径、用途边界和合规核验，不要写成开户攻略。")
    };
  }

  async generateContentResearch(): Promise<GeneratedContentResearch> {
    return {
      factsMarkdown: [
        "- 跨境支付工具首先改变的是生活资金安排的摩擦，而不是投资路径。",
        "- 家庭读者需要同时核验使用场景、身份条件、额度和合规边界。",
        "- 支付效率可以降低安排成本，但不能替代资金来源和用途解释。"
      ].join("\n"),
      backgroundMarkdown: [
        "- 热点容易被写成到账速度变化。",
        "- 对已经有跨境生活安排的家庭，真正问题是资金路径是否更稳定、更可解释。"
      ].join("\n"),
      readerQuestionsMarkdown: [
        "- 这件事和我家的学费、生活费、备用金安排有没有关系？",
        "- 便利是不是代表规则放松？",
        "- 使用前需要核验哪些边界？"
      ].join("\n"),
      boundariesMarkdown: [
        "- 不写成跨境资金自由流动。",
        "- 不暗示可以绕开监管或额度限制。",
        "- 不承诺具体到账、开户、收益或审批结果。"
      ].join("\n"),
      writeableDirectionsMarkdown: [
        "- 从家庭现金流安排解释工具意义。",
        "- 从使用场景、额度边界、合规责任三个层次展开。",
        "- 把热点翻译成读者可以自查的问题。"
      ].join("\n"),
      avoidDirectionsMarkdown: [
        "- 避免只罗列政策或工具功能。",
        "- 避免把支付工具写成投资通道。",
        "- 避免把速度当成唯一主线。"
      ].join("\n"),
      summaryMarkdown: [
        "这篇文章应把热点从“到账速度”转回“家庭跨境生活资金路径”。",
        "后续提纲要围绕使用场景、额度和合规边界、家庭现金流安排展开，提醒读者先核验边界再使用工具。"
      ].join("\n")
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
      ].join("\n"),
      qualityGate: fakeOutlineQualityGate(
        "pass",
        "文案必须围绕“到账速度只是表层，家庭跨境资金路径更可操作”展开，并按场景边界、额度合规边界、家庭现金流安排推进。"
      )
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
      ].join("\n"),
      qualityGate: fakeDraftQualityGate(
        "pass",
        "初稿可进入文案清洁检查；后续重点压缩重复判断，继续保持生活场景、额度边界和合规责任。"
      )
    };
  }

  async runAIStyleCheck(prompt = ""): Promise<GeneratedAIStyleCheck> {
    if (prompt.includes("强制重度水分") || prompt.toLowerCase().includes("force heavy slop")) {
      return {
        verdict: "heavy_slop",
        score: 34,
        summaryMarkdown: "存在明显表达水分，进入最终稿前建议先清理。",
        issues: [
          {
            type: "ai_cliche",
            severity: "high",
            quote: "真正重要的不是几秒到账，而是生活资金的路径变得更低摩擦。",
            problem: "使用高频 AI 转折结构承载主判断，读起来像模板总结。",
            fixDirection: "改成更直接的家庭场景判断，保留资金路径边界。"
          }
        ],
        qualityGate: fakeDraftQualityGate("revise", "文案存在明显 AI 味和模板化转折，生成清洁版时优先改写成具体家庭场景判断。")
      };
    }
    return {
      verdict: "needs_cleanup",
      score: 68,
      summaryMarkdown: "整体能读，但有重复判断和 AI 味句式，需要清理后再进入最终稿。",
      issues: [
        {
          type: "ai_cliche",
          severity: "medium",
          quote: "真正重要的不是几秒到账，而是生活资金的路径变得更低摩擦。",
          problem: "句式接近常见 AI 转折，判断成立但表达过于模板化。",
          fixDirection: "直接写家庭为什么在意路径稳定，少用“不是……而是……”结构。"
        },
        {
          type: "repetition",
          severity: "low",
          quote: "速度只是表层",
          problem: "前文已经表达过速度不是重点，这里再次出现会降低信息密度。",
          fixDirection: "保留一个判断句，后面直接进入使用场景、额度和合规边界。"
        }
      ],
      qualityGate: fakeDraftQualityGate(
        "revise",
        "文案整体能读，但需要删除重复判断和 AI 味转折；清洁版应更直接地写家庭为什么在意资金路径稳定。"
      )
    };
  }

  async generateIllustrationPlan(): Promise<GeneratedIllustrationPlan> {
    return {
      summary: "建议使用 2 张正文配图：一张解释资金路径，一张提示合规边界。",
      items: [
        {
          position: "放在第一节“速度只是入口”之后",
          purpose: "帮助读者把到账速度和家庭资金路径区分开。",
          imageType: "流程示意图",
          visualBrief: "用三段式流程展示家庭从生活资金需求到支付工具再到用途核验的关系。",
          promptBrief: "克制的公众号正文流程图，展示家庭生活资金需求、跨境支付工具、用途和额度核验三个节点。",
          doNotVisualize: "不要画成投资收益通道，不要暗示资金自由流动。",
          riskNotes: "需要避免出现收益、审批、开户或绕开监管的视觉暗示。"
        },
        {
          position: "放在“边界比工具更重要”小节前",
          purpose: "让读者先看到使用场景、额度条件和合规责任三个边界。",
          imageType: "边界清单图",
          visualBrief: "三列清单分别写生活场景、额度条件、合规责任，整体留白充足。",
          promptBrief: "简洁克制的中文信息图，三列展示生活场景、额度条件、合规责任，适合公众号正文插图。",
          doNotVisualize: "不要出现银行卡堆叠、钞票飞出、暴涨箭头。",
          riskNotes: "文案要条件化，不能写成保证可用或一定到账。"
        }
      ]
    };
  }

  async reviseDraft(prompt?: string): Promise<GeneratedDraft> {
    void prompt;
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

  async generateContentResearch(prompt: string): Promise<GeneratedContentResearch> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedContentResearch(json);
  }

  async generateOutline(prompt: string): Promise<GeneratedOutline> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedOutline(json);
  }

  async generateDraft(prompt: string): Promise<GeneratedDraft> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedDraft(json);
  }

  async runAIStyleCheck(prompt: string): Promise<GeneratedAIStyleCheck> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedAIStyleCheck(json);
  }

  async generateIllustrationPlan(prompt: string): Promise<GeneratedIllustrationPlan> {
    const json = await this.completeJson(prompt);
    return normalizeGeneratedIllustrationPlan(json);
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
