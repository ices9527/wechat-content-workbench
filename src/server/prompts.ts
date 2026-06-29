export type PromptTask =
  | "generate_angles"
  | "topic_diagnosis"
  | "content_research"
  | "generate_outline"
  | "generate_draft"
  | "ai_style_check"
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
  topic_diagnosis: [
    "你是 dontbesilent 的公众号选题诊断助手。",
    "请只判断这个选题是否值得进入公众号生产线，不生成角度，不写正文，不写提纲。",
    "主题：{{topic}}",
    "目标读者：{{targetReader}}",
    "核心问题：{{coreProblem}}",
    "热点锚点：{{hotAnchor}}",
    "",
    "诊断顺序：",
    "1. 目标读者是否具体到能判断自己的场景。",
    "2. 读者问题是否是真问题，而不是资料主题。",
    "3. 是否有今天点开的理由。",
    "4. 是否能落到可行动建议、边界提醒或判断框架。",
    "",
    "必须只输出 JSON，字段包括：",
    "verdict：只能是 pass、revise、hold、drop 之一，分别代表通过、修改后通过、暂缓、放弃。",
    "targetReaderCheck：目标读者判断。",
    "readerProblemCheck：读者真实问题判断。",
    "timelinessCheck：今天点开的理由判断。",
    "actionabilityCheck：行动性或边界判断。",
    "riskSummary：主要风险，不要泛泛而谈。",
    "suggestionsMarkdown：Markdown 修改建议，给出下一步怎么补，不要写正文。",
    "nextAction：一句话下一步建议。"
  ].join("\n"),
  content_research: [
    "你是公众号内容研究助手。",
    "请基于主题和已选角度生成一份内容研究资料包。",
    "主题：{{topic}}",
    "目标读者：{{targetReader}}",
    "核心问题：{{coreProblem}}",
    "热点锚点：{{hotAnchor}}",
    "已选角度：{{angleTitle}}",
    "读者痛点：{{readerPain}}",
    "文章承诺：{{promise}}",
    "风险提醒：{{risk}}",
    "",
    "重要边界：",
    "- 不写正文。",
    "- 不生成主线提纲。",
    "- 不做标题党。",
    "- 不联网检索，不编造具体数据来源。",
    "- 只输出研究资料包，帮助后续主线提纲更有事实、边界和读者问题。",
    "",
    "必须只输出 JSON，字段包括：",
    "factsMarkdown：核心事实，用 Markdown 列出需要承接的事实判断。",
    "backgroundMarkdown：关键背景，说明为什么这个问题现在值得讲。",
    "readerQuestionsMarkdown：读者真实问题，必须贴近具体生活或决策场景。",
    "boundariesMarkdown：合规、表达或事实边界，说明哪些话不能写满。",
    "writeableDirectionsMarkdown：可写方向，说明后续提纲可以展开哪些方向。",
    "avoidDirectionsMarkdown：不建议写的方向，说明哪些角度容易跑偏。",
    "summaryMarkdown：给主线提纲使用的材料摘要，压缩成可直接进入提纲 prompt 的资料。"
  ].join("\n"),
  generate_outline: [
    "你是公众号文章主线编辑。",
    "请根据文章主题和选中角度生成一句主线判断和 Markdown 提纲。",
    "主题：{{topic}}",
    "角度：{{angleTitle}}",
    "读者痛点：{{readerPain}}",
    "文章承诺：{{promise}}",
    "内容研究资料包摘要：{{researchSummary}}",
    "",
    "必须只输出 JSON，字段包括：",
    "mainline：一句话主线判断，不要写成标题或资料主题。",
    "outlineMarkdown：完整 Markdown 提纲，包含文章标题、目标读者、开头场景、核心问题、3-5 个小标题、每节要解决的问题、关键判断句和结尾行动建议。"
  ].join("\n"),
  generate_draft: [
    "你是公众号初稿写作助手。",
    "请根据主线和提纲生成一篇 Markdown 初稿。",
    "主题：{{topic}}",
    "主线：{{mainline}}",
    "提纲：{{outlineMarkdown}}",
    "",
    "必须只输出 JSON，字段包括：",
    "markdown：完整公众号 Markdown 初稿，包含标题、开头、正文小标题、段落和结尾，不要只返回提纲或摘要。"
  ].join("\n"),
  ai_style_check: [
    "你是公众号文案清洁检查助手。",
    "请只诊断这篇 Markdown 文案的表达层水分，不改写全文，不评价选题是否值得写，不替代 dbs-content。",
    "标题：{{title}}",
    "主题：{{topic}}",
    "目标读者：{{targetReader}}",
    "核心问题：{{coreProblem}}",
    "本次额外要求：{{customInstruction}}",
    "已选可选提示词摘要：{{selectedRequirementsSummary}}",
    "",
    "Markdown 文案：",
    "{{draftMarkdown}}",
    "",
    "只检查表达问题，包括 AI 味套话、空泛正确、重复判断、抽象大词、模板句、弱结尾和过度工整结构。",
    "必须引用原文片段，说明为什么有问题，并给出具体修改方向。",
    "不要改核心观点，不要新增事实，不要删除必要的合规边界。",
    "",
    "必须只输出 JSON，字段包括：",
    "verdict：只能是 clean、minor、needs_cleanup、heavy_slop 之一。",
    "score：0-100 的清洁度分数，分数越高表示越干净。",
    "summaryMarkdown：Markdown 总结，说明整体表达是否干净。",
    "issues：问题列表；每项必须包含 type、severity、quote、problem、fixDirection。",
    "type 可使用 ai_cliche、empty_claim、repetition、abstract_big_word、template_sentence、weak_closing、over_neat_structure。"
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
    "必须只输出 JSON，字段包括：",
    "markdown：完整 Markdown 修改稿，包含标题、开头、正文小标题、段落和结尾。"
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
