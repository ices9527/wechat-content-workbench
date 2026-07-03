import type { ArticleProject, DraftVersion } from "@/db/schema";

import type { IllustrationPlanItem } from "./illustration-plans";

export type RealInlineIllustrationPromptInput = {
  article: ArticleProject;
  draft: DraftVersion;
  item: IllustrationPlanItem;
  width: number;
  height: number;
};

function nonEmpty(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function buildRealInlineIllustrationPrompt(input: RealInlineIllustrationPromptInput): string {
  const aspectRatio = `${input.width}:${input.height}`;
  return [
    "Generate one standalone 16:9 horizontal Chinese article illustration.",
    "",
    "Visual DNA:",
    "Pure white background. Minimalist black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space.",
    "Sparse red, orange, and blue handwritten Chinese annotations. Clean absurd product-sketch feeling.",
    "The image should be clear but not instructional, interesting but not childish, strange but clean.",
    "",
    "Recurring IP character required:",
    "小黑, a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious expression, slightly uneven hand-drawn body shape.",
    "小黑 must perform the core conceptual action, not decorate the scene.",
    "",
    "Article context:",
    `Title: ${input.article.title}`,
    `Topic: ${input.article.topic}`,
    `Target reader: ${nonEmpty(input.article.targetReader, "未填写")}`,
    `Core problem: ${nonEmpty(input.article.coreProblem, "未填写")}`,
    "",
    "Inline illustration item:",
    `Canvas: ${input.width}x${input.height}, aspect ratio ${aspectRatio}`,
    `Image type: ${input.item.imageType}`,
    `Insert position: ${input.item.position}`,
    `Purpose: ${input.item.purpose}`,
    `Visual brief: ${input.item.visualBrief}`,
    `Prompt 简报: ${input.item.promptBrief}`,
    `Do not visualize: ${nonEmpty(input.item.doNotVisualize, "不要画收益承诺、开户承诺、身份承诺或规避监管暗示。")}`,
    `Risk notes: ${nonEmpty(input.item.riskNotes, "保留条件、边界和风险提醒，不把工具画成确定路径。")}`,
    "",
    "Composition rules:",
    "Choose one structure type only: workflow, system detail, before-after contrast, role state, concept metaphor, method layers, map route, or short comic panels.",
    "One image explains only one core action, structure, state, or metaphor.",
    "Keep the main subject around 40%-60% of the canvas and preserve at least 35% blank white space.",
    "Use at most 5-8 short handwritten Chinese labels; each label should be 2-8 Chinese characters when possible.",
    "Use black for main line art and 小黑. Use orange for the main flow, path, or arrows. Use red only for warnings, problems, or key results. Use blue only for secondary notes.",
    "",
    "Hard constraints:",
    "Do not make a PPT infographic, commercial illustration, course slide, dense explainer, cute mascot poster, children's illustration, realistic UI, or complex architecture diagram.",
    "Do not write a title in the top-left corner. Do not write the structure type on the image.",
    "Do not include long paragraphs, dense nodes, many arrows, gradients, shadows, paper texture, beige background, screenshots, or tech UI.",
    "Do not promise收益、开户、身份、审批、到账、交易、投资结果, or imply regulatory bypass.",
    "Do not include the words Fake SVG, placeholder, Sprint 13B-A, test card, or any testing watermark.",
    "Do not copy prior examples or reuse known case compositions; invent a fresh visual metaphor for this article."
  ].join("\n");
}
