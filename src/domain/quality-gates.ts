export const QUALITY_GATE_STAGES = [
  "local",
  "topic",
  "angle",
  "research",
  "outline",
  "draft",
  "illustration_plan",
  "pre_publish"
] as const;

export type QualityGateStage = (typeof QUALITY_GATE_STAGES)[number];

export const QUALITY_BLOCKING_LEVELS = ["block", "warn", "inform"] as const;

export type QualityBlockingLevel = (typeof QUALITY_BLOCKING_LEVELS)[number];

export type QualityCheck = {
  id: string;
  ownerStage: QualityGateStage;
  label: string;
  description: string;
  blockingLevel: QualityBlockingLevel;
};

export const QUALITY_CHECKS = [
  {
    id: "local.input_completeness",
    ownerStage: "local",
    label: "输入完整性",
    description: "每个节点只检查自己运行所需输入是否齐全。",
    blockingLevel: "block"
  },
  {
    id: "topic.precondition",
    ownerStage: "topic",
    label: "前置条件",
    description: "判断这篇内容是否具备可写前提，缺资料、缺对象、缺真实问题时应阻断或 hold。",
    blockingLevel: "block"
  },
  {
    id: "topic.value",
    ownerStage: "topic",
    label: "选题价值",
    description: "判断主题是否有明确读者、问题、时机和行动价值。",
    blockingLevel: "block"
  },
  {
    id: "angle.distinctness",
    ownerStage: "angle",
    label: "角度差异",
    description: "判断角度是否真正不同，是否指向具体读者和真实场景。",
    blockingLevel: "warn"
  },
  {
    id: "research.fact_boundary",
    ownerStage: "research",
    label: "事实与边界",
    description: "补充事实、条件、限制、风险和可写资料，不判断成稿表达。",
    blockingLevel: "warn"
  },
  {
    id: "outline.cognitive_gap",
    ownerStage: "outline",
    label: "认知落差",
    description: "判断文章是否能让读者从旧理解走向新理解。",
    blockingLevel: "block"
  },
  {
    id: "outline.mainline_judgment",
    ownerStage: "outline",
    label: "主线判断",
    description: "判断主线是否是一句话判断，而不是资料主题或宽泛口号。",
    blockingLevel: "block"
  },
  {
    id: "outline.structure_load",
    ownerStage: "outline",
    label: "结构承载",
    description: "判断提纲是否能支撑主线，顺序是否清楚，章节是否只承载一个判断。",
    blockingLevel: "warn"
  },
  {
    id: "draft.text_cleanliness",
    ownerStage: "draft",
    label: "文字洁癖",
    description: "删除空话、绕话、泛泛判断、重复铺垫和无效形容。",
    blockingLevel: "warn"
  },
  {
    id: "draft.expression_efficiency",
    ownerStage: "draft",
    label: "表达效率",
    description: "判断同样信息能否用更短、更直接、更具体的表达完成。",
    blockingLevel: "warn"
  },
  {
    id: "draft.ai_trace",
    ownerStage: "draft",
    label: "AI 痕迹",
    description: "检查 AI 味、模板感、车轱辘话、过度总结和机械转折。",
    blockingLevel: "warn"
  },
  {
    id: "pre_publish.title_cover_alignment",
    ownerStage: "pre_publish",
    label: "标题封面一致性",
    description: "判断标题、封面和正文承诺是否一致，不能制造正文不支持的期待。",
    blockingLevel: "block"
  },
  {
    id: "illustration_plan.image_necessity",
    ownerStage: "illustration_plan",
    label: "配图必要性",
    description: "判断每张正文图是否服务理解，不做装饰性堆图。",
    blockingLevel: "warn"
  },
  {
    id: "pre_publish.release_risk",
    ownerStage: "pre_publish",
    label: "发布风险",
    description: "检查发布包、微信正文图、HTML、草稿箱上传和人工发布边界。",
    blockingLevel: "block"
  }
] as const satisfies readonly QualityCheck[];

export type QualityCheckId = (typeof QUALITY_CHECKS)[number]["id"];

export function listQualityChecks(ownerStage?: QualityGateStage): QualityCheck[] {
  const checks = [...QUALITY_CHECKS];
  if (!ownerStage) {
    return checks;
  }
  return checks.filter((check) => check.ownerStage === ownerStage);
}

export function getQualityCheck(id: string): QualityCheck | undefined {
  return QUALITY_CHECKS.find((check) => check.id === id);
}

export function hasDuplicateQualityCheckIds(checks: readonly Pick<QualityCheck, "id">[]): boolean {
  return new Set(checks.map((check) => check.id)).size !== checks.length;
}
