import type { RequirementStage } from "@/domain/stages";

export const STAGE_PROMPT_UI: Record<
  RequirementStage,
  {
    eyebrow: string;
    title: string;
    defaultPromptLabel: string;
    customPlaceholder: string;
    savedNotice: string;
  }
> = {
  angle: {
    eyebrow: "Angle Prompt",
    title: "角度提示词设置",
    defaultPromptLabel: "角度默认提示词",
    customPlaceholder: "例如：只生成能落到家庭跨境资金安排的角度，不要宏大趋势角度",
    savedNotice: "已保存角度默认提示词"
  },
  outline: {
    eyebrow: "Outline Prompt",
    title: "主线提纲提示词设置",
    defaultPromptLabel: "主线提纲默认提示词",
    customPlaceholder: "例如：不要强调到账速度，强调家庭现金流安排",
    savedNotice: "已保存主线提纲默认提示词"
  },
  draft: {
    eyebrow: "Draft Prompt",
    title: "Markdown 文案提示词设置",
    defaultPromptLabel: "Markdown 文案默认提示词",
    customPlaceholder: "例如：开头不要用热点追问，先从家庭生活场景进入",
    savedNotice: "已保存 Markdown 文案默认提示词"
  },
  dbs: {
    eyebrow: "DBS Prompt",
    title: "dbs-content 提示词设置",
    defaultPromptLabel: "dbs-content 默认提示词",
    customPlaceholder: "例如：这次重点检查标题承诺、首屏判断和 AI 味，不要先改正文",
    savedNotice: "已保存 dbs-content 默认提示词"
  },
  pre_publish: {
    eyebrow: "Pre-publish Prompt",
    title: "发布前检查提示词设置",
    defaultPromptLabel: "发布前默认提示词",
    customPlaceholder: "例如：重点检查首屏、标题点开理由、转发理由和预期阅读来源",
    savedNotice: "已保存发布前默认提示词"
  },
  review: {
    eyebrow: "Review Prompt",
    title: "复盘提示词设置",
    defaultPromptLabel: "复盘默认提示词",
    customPlaceholder: "例如：先判断是不是触达问题，再判断标题和正文，不要直接归因文案差",
    savedNotice: "已保存复盘默认提示词"
  }
};
