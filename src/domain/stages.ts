import { z } from "zod";

export const REQUIREMENT_STAGES = [
  "topic",
  "angle",
  "research",
  "outline",
  "draft",
  "ai_style_check",
  "dbs",
  "illustration_plan",
  "pre_publish",
  "review"
] as const;

export const STAGE_PROMPT_STAGES = [
  "angle",
  "research",
  "outline",
  "draft",
  "ai_style_check",
  "dbs",
  "illustration_plan",
  "pre_publish",
  "review"
] as const;

export const FUTURE_REQUIREMENT_STAGES = [] as const;

export const requirementStageSchema = z.enum(REQUIREMENT_STAGES);
export const stagePromptStageSchema = z.enum(STAGE_PROMPT_STAGES);

export type RequirementStage = z.infer<typeof requirementStageSchema>;
export type StagePromptStage = z.infer<typeof stagePromptStageSchema>;

export const STAGE_PROMPT_LABELS: Record<StagePromptStage, string> = {
  angle: "角度默认提示词",
  research: "内容研究默认提示词",
  outline: "主线提纲默认提示词",
  draft: "Markdown 文案默认提示词",
  ai_style_check: "文案清洁检查默认提示词",
  dbs: "dbs-content 默认提示词",
  illustration_plan: "配图规划默认提示词",
  pre_publish: "发布前默认提示词",
  review: "复盘默认提示词"
};

export function defaultStagePromptLabel(stage: StagePromptStage): string {
  return STAGE_PROMPT_LABELS[stage];
}
