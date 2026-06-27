export type PromptTask =
  | "generate_angles"
  | "generate_outline"
  | "generate_draft"
  | "dbs_content"
  | "revise_from_diagnosis"
  | "pre_publish_check"
  | "review_check";

const templates: Record<PromptTask, string> = {
  generate_angles: [
    "你是公众号内容策划助手。",
    "请根据主题生成至少 5 个写作角度。",
    "主题：{{topic}}",
    "目标读者：{{targetReader}}",
    "核心问题：{{coreProblem}}",
    "热点锚点：{{hotAnchor}}",
    "每个角度必须包含 angleTitle、readerPain、promise、risk。"
  ].join("\n"),
  generate_outline: [
    "你是公众号文章主线编辑。",
    "请根据文章主题和选中角度生成一句主线判断和 Markdown 提纲。",
    "主题：{{topic}}",
    "角度：{{angleTitle}}",
    "读者痛点：{{readerPain}}",
    "文章承诺：{{promise}}"
  ].join("\n"),
  generate_draft: [
    "你是公众号初稿写作助手。",
    "请根据主线和提纲生成一篇 Markdown 初稿。",
    "主题：{{topic}}",
    "主线：{{mainline}}",
    "提纲：{{outlineMarkdown}}"
  ].join("\n"),
  dbs_content: [
    "你是 dontbesilent 的内容创作诊断 AI，只诊断，不代写。",
    "请按 dbs-content 五维框架诊断这篇公众号 Markdown 文案。",
    "主题：{{topic}}",
    "文案版本：v{{versionNo}}",
    "Markdown 文案：",
    "{{markdown}}",
    "",
    "必须输出 JSON，字段包括：",
    "diagnosisMarkdown：完整 Markdown 诊断报告。",
    "textCleanliness：文字洁癖判断，包含 ✅/⚠️/❌ 和一句说明。",
    "titleCover：封面/标题判断，包含 ✅/⚠️/❌ 和一句说明。",
    "expressionEfficiency：表达效率判断，包含 ✅/⚠️/❌ 和一句说明。",
    "cognitiveGap：认知落差判断，包含 ✅/⚠️/❌ 和一句说明。",
    "aiTrace：AI 痕迹判断，包含 ✅/⚠️/❌ 和一句说明。",
    "firstFix：如果只改一步，第一步具体改什么。"
  ].join("\n"),
  revise_from_diagnosis: [
    "你是公众号文章修改助手。",
    "请基于 dbs-content 诊断生成一个新的 Markdown 修改稿。",
    "要求：保留原文核心判断；优先处理诊断中指出的第一处问题；减少空泛表达、连续提问和重复判断。",
    "主题：{{topic}}",
    "原文案版本：v{{versionNo}}",
    "原 Markdown 文案：",
    "{{markdown}}",
    "",
    "dbs-content 诊断：",
    "{{diagnosisMarkdown}}",
    "",
    "必须输出 JSON，字段包括 markdown。"
  ].join("\n"),
  pre_publish_check: [
    "你是公众号发布前检查助手。",
    "请基于最终稿和发布资产生成一份发布前检查摘要。",
    "主题：{{topic}}",
    "标题：{{title}}",
    "最终稿版本：v{{versionNo}}",
    "HTML 资产数：{{htmlAssetCount}}",
    "封面资产数：{{coverAssetCount}}",
    "草稿箱状态：{{uploadStatus}}",
    "Markdown 文案：",
    "{{markdown}}",
    "",
    "必须检查：标题是否有今天点开的理由、首屏是否资料化、是否准备转发理由、是否记录预期阅读来源。",
    "必须输出 JSON，字段包括 summaryMarkdown。"
  ].join("\n"),
  review_check: [
    "你是公众号复盘助手。",
    "请生成一份发布后复盘归因检查清单。",
    "主题：{{topic}}",
    "标题：{{title}}",
    "最终稿版本：v{{versionNo}}",
    "当前状态：{{status}}",
    "草稿箱状态：{{uploadStatus}}",
    "Markdown 文案：",
    "{{markdown}}",
    "",
    "复盘顺序：先看触达，再看分享，再看标题承诺和首屏，最后才看正文表达。",
    "必须输出 JSON，字段包括 summaryMarkdown。"
  ].join("\n")
};

export function renderPrompt(task: PromptTask, variables: Record<string, string | null | undefined>): string {
  return templates[task].replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in variables)) {
      throw new Error(`Missing prompt variable: ${key}`);
    }
    return variables[key] || "未填写";
  });
}

export type PromptRequirement = {
  label: string;
  promptFragment: string;
  priority?: number | null;
};

export function buildLayeredPrompt(
  basePrompt: string,
  input: {
    stageDefaultPrompt?: string | null;
    selectedRequirements?: PromptRequirement[];
    customInstruction?: string | null;
  } = {}
): string {
  const sections = [basePrompt.trim()];
  const stageDefaultPrompt = input.stageDefaultPrompt?.trim();
  const customInstruction = input.customInstruction?.trim();
  const selectedRequirements = (input.selectedRequirements || [])
    .filter((requirement) => requirement.promptFragment.trim().length > 0)
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));

  if (stageDefaultPrompt) {
    sections.push(["## 阶段默认生成要求", stageDefaultPrompt].join("\n"));
  }

  if (selectedRequirements.length > 0) {
    sections.push(
      [
        "## 本次必须遵守的生成要求",
        ...selectedRequirements.map((requirement) => `- ${requirement.label}：${requirement.promptFragment.trim()}`)
      ].join("\n")
    );
  }

  if (customInstruction) {
    sections.push(["## 用户本次额外约束", customInstruction].join("\n"));
  }

  return sections.join("\n\n");
}
