import type { GeneratedContentResearch, GeneratedDraft, GeneratedOutline, GeneratedTopicDiagnosis, TopicDiagnosisVerdict } from "./ai";

function stringifyPromptValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyPromptValue(item))
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = stringifyPromptValue(item);
        return text ? `## ${key}\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function firstPromptValue(json: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringifyPromptValue(json[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function outlineObjectToMarkdown(json: Record<string, unknown>): string {
  const ignoredKeys = new Set([
    "mainline",
    "mainLine",
    "articleMainline",
    "文章主线",
    "主线",
    "核心主线",
    "主线判断"
  ]);
  return Object.entries(json)
    .map(([key, value]) => {
      if (ignoredKeys.has(key)) {
        return "";
      }
      const text = stringifyPromptValue(value);
      return text ? `## ${key}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function draftObjectToMarkdown(json: Record<string, unknown>): string {
  const ignoredKeys = new Set(["id", "metadata", "meta", "status", "状态", "说明"]);
  return Object.entries(json)
    .map(([key, value]) => {
      if (ignoredKeys.has(key)) {
        return "";
      }
      const text = stringifyPromptValue(value);
      return text ? `## ${key}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function topicDiagnosisObjectToMarkdown(json: Record<string, unknown>): string {
  const ignoredKeys = new Set([
    "verdict",
    "decision",
    "conclusion",
    "status",
    "结论",
    "选题结论",
    "诊断结论",
    "targetReaderCheck",
    "target_reader_check",
    "targetReader",
    "目标读者判断",
    "目标读者",
    "readerProblemCheck",
    "reader_problem_check",
    "realProblemCheck",
    "读者问题判断",
    "真实问题",
    "核心问题判断",
    "timelinessCheck",
    "timeliness",
    "clickReasonCheck",
    "点击理由判断",
    "今天点开的理由",
    "actionabilityCheck",
    "actionability",
    "行动建议判断",
    "行动性判断",
    "可行动性",
    "riskSummary",
    "risks",
    "主要风险",
    "风险",
    "nextAction",
    "next_action",
    "推荐下一步",
    "下一步"
  ]);
  return Object.entries(json)
    .map(([key, value]) => {
      if (ignoredKeys.has(key)) {
        return "";
      }
      const text = stringifyPromptValue(value);
      return text ? `## ${key}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function contentResearchObjectToMarkdown(json: Record<string, unknown>): string {
  const ignoredKeys = new Set([
    "factsMarkdown",
    "facts_markdown",
    "核心事实",
    "事实",
    "backgroundMarkdown",
    "background_markdown",
    "关键背景",
    "背景",
    "readerQuestionsMarkdown",
    "reader_questions_markdown",
    "读者问题",
    "读者真实问题",
    "boundariesMarkdown",
    "boundaries_markdown",
    "边界",
    "表达边界",
    "合规边界",
    "writeableDirectionsMarkdown",
    "writableDirectionsMarkdown",
    "writeable_directions_markdown",
    "writable_directions_markdown",
    "可写方向",
    "可以写的方向",
    "avoidDirectionsMarkdown",
    "avoid_directions_markdown",
    "不建议写的方向",
    "避免方向",
    "summaryMarkdown",
    "summary_markdown",
    "摘要",
    "材料摘要"
  ]);
  return Object.entries(json)
    .map(([key, value]) => {
      if (ignoredKeys.has(key)) {
        return "";
      }
      const text = stringifyPromptValue(value);
      return text ? `## ${key}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeGeneratedOutline(json: Record<string, unknown>): GeneratedOutline {
  const mainline = firstPromptValue(json, [
    "mainline",
    "mainLine",
    "articleMainline",
    "文章主线",
    "主线",
    "核心主线",
    "主线判断"
  ]);
  const outlineMarkdown =
    firstPromptValue(json, [
      "outlineMarkdown",
      "outline_markdown",
      "markdownOutline",
      "outline",
      "markdown",
      "Markdown 提纲",
      "提纲",
      "文章提纲"
    ]) || outlineObjectToMarkdown(json);

  return { mainline, outlineMarkdown };
}

export function normalizeGeneratedDraft(json: Record<string, unknown>): GeneratedDraft {
  const markdown =
    firstPromptValue(json, [
      "markdown",
      "draftMarkdown",
      "draft_markdown",
      "articleMarkdown",
      "contentMarkdown",
      "wechatMarkdown",
      "公众号Markdown",
      "Markdown 文案",
      "markdown文案",
      "Markdown 初稿",
      "Markdown初稿",
      "draft",
      "content",
      "article",
      "body",
      "text",
      "文案",
      "正文",
      "初稿",
      "文章",
      "公众号文案"
    ]) || draftObjectToMarkdown(json);

  return { markdown };
}

function normalizeTopicDiagnosisVerdict(value: string): TopicDiagnosisVerdict {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized.includes("修改后通过") || normalized.includes("revise") || normalized.includes("修改") || normalized.includes("待改")) {
    return "revise";
  }
  if (normalized.includes("暂缓") || normalized.includes("hold") || normalized.includes("暂停") || normalized.includes("观望")) {
    return "hold";
  }
  if (normalized.includes("放弃") || normalized.includes("drop") || normalized.includes("不建议") || normalized.includes("不要做")) {
    return "drop";
  }
  if (normalized.includes("通过") || normalized.includes("pass") || normalized.includes("可以做") || normalized.includes("值得做")) {
    return "pass";
  }
  return "revise";
}

export function normalizeGeneratedTopicDiagnosis(json: Record<string, unknown>): GeneratedTopicDiagnosis {
  const verdict = normalizeTopicDiagnosisVerdict(
    firstPromptValue(json, ["verdict", "decision", "conclusion", "status", "结论", "选题结论", "诊断结论"])
  );
  const targetReaderCheck = firstPromptValue(json, [
    "targetReaderCheck",
    "target_reader_check",
    "targetReader",
    "目标读者判断",
    "目标读者"
  ]);
  const readerProblemCheck = firstPromptValue(json, [
    "readerProblemCheck",
    "reader_problem_check",
    "realProblemCheck",
    "读者问题判断",
    "真实问题",
    "核心问题判断"
  ]);
  const timelinessCheck = firstPromptValue(json, [
    "timelinessCheck",
    "timeliness",
    "clickReasonCheck",
    "点击理由判断",
    "今天点开的理由"
  ]);
  const actionabilityCheck = firstPromptValue(json, [
    "actionabilityCheck",
    "actionability",
    "行动建议判断",
    "行动性判断",
    "可行动性"
  ]);
  const riskSummary = firstPromptValue(json, ["riskSummary", "risks", "主要风险", "风险"]);
  const suggestionsMarkdown =
    firstPromptValue(json, ["suggestionsMarkdown", "suggestions", "修改建议", "建议"]) || topicDiagnosisObjectToMarkdown(json);
  const nextAction = firstPromptValue(json, ["nextAction", "next_action", "推荐下一步", "下一步"]);

  return {
    verdict,
    targetReaderCheck,
    readerProblemCheck,
    timelinessCheck,
    actionabilityCheck,
    riskSummary,
    suggestionsMarkdown,
    nextAction
  };
}

export function normalizeGeneratedContentResearch(json: Record<string, unknown>): GeneratedContentResearch {
  const factsMarkdown = firstPromptValue(json, ["factsMarkdown", "facts_markdown", "核心事实", "事实"]);
  const backgroundMarkdown = firstPromptValue(json, ["backgroundMarkdown", "background_markdown", "关键背景", "背景"]);
  const readerQuestionsMarkdown = firstPromptValue(json, [
    "readerQuestionsMarkdown",
    "reader_questions_markdown",
    "readerProblemsMarkdown",
    "读者问题",
    "读者真实问题"
  ]);
  const boundariesMarkdown = firstPromptValue(json, [
    "boundariesMarkdown",
    "boundaries_markdown",
    "complianceBoundariesMarkdown",
    "边界",
    "表达边界",
    "合规边界"
  ]);
  const writeableDirectionsMarkdown = firstPromptValue(json, [
    "writeableDirectionsMarkdown",
    "writableDirectionsMarkdown",
    "writeable_directions_markdown",
    "writable_directions_markdown",
    "可写方向",
    "可以写的方向"
  ]);
  const avoidDirectionsMarkdown = firstPromptValue(json, [
    "avoidDirectionsMarkdown",
    "avoid_directions_markdown",
    "directionsToAvoidMarkdown",
    "不建议写的方向",
    "避免方向"
  ]);
  const objectFallbackMarkdown = contentResearchObjectToMarkdown(json);
  const summaryMarkdown =
    firstPromptValue(json, ["summaryMarkdown", "summary_markdown", "materialsSummaryMarkdown", "摘要", "材料摘要"]) ||
    objectFallbackMarkdown ||
    [factsMarkdown, backgroundMarkdown, readerQuestionsMarkdown, boundariesMarkdown, writeableDirectionsMarkdown, avoidDirectionsMarkdown]
      .filter(Boolean)
      .join("\n\n");

  const normalized = {
    factsMarkdown,
    backgroundMarkdown,
    readerQuestionsMarkdown,
    boundariesMarkdown,
    writeableDirectionsMarkdown,
    avoidDirectionsMarkdown,
    summaryMarkdown
  };

  if (!Object.values(normalized).some((value) => value.trim().length > 0)) {
    throw new Error("AI 返回的研究资料包为空");
  }

  return normalized;
}
