export const ARTICLE_STATUSES = [
  "topic_created",
  "topic_diagnosed",
  "angles_generated",
  "angle_selected",
  "outline_generated",
  "outline_review",
  "draft_generated",
  "dbs_checking",
  "revision_generated",
  "human_review",
  "ready_to_publish",
  "publish_package_generated",
  "cover_generated",
  "uploaded_to_draft_box",
  "published_manually",
  "review_pending",
  "review_recorded"
] as const;

export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  topic_created: "已建主题",
  topic_diagnosed: "选题已诊断",
  angles_generated: "待选角度",
  angle_selected: "已选角度",
  outline_generated: "待确认提纲",
  outline_review: "提纲已确认",
  draft_generated: "待诊断文案",
  dbs_checking: "诊断中",
  revision_generated: "待检查修改稿",
  human_review: "人工检查",
  ready_to_publish: "待发布",
  publish_package_generated: "已生成发布包",
  cover_generated: "已生成封面",
  uploaded_to_draft_box: "已上传草稿箱",
  published_manually: "已人工发布",
  review_pending: "待复盘",
  review_recorded: "已复盘"
};

export const NEXT_ACTION_LABELS: Record<ArticleStatus, string> = {
  topic_created: "生成角度或手动创建角度",
  topic_diagnosed: "生成角度或手动创建角度",
  angles_generated: "选择一个写作角度",
  angle_selected: "生成主线和提纲",
  outline_generated: "确认提纲",
  outline_review: "生成 Markdown 文案",
  draft_generated: "运行 dbs-content",
  dbs_checking: "根据诊断生成修改稿",
  revision_generated: "检查并标记最终稿",
  human_review: "标记待发布",
  ready_to_publish: "进入发布队列",
  publish_package_generated: "生成封面",
  cover_generated: "上传草稿箱",
  uploaded_to_draft_box: "等待人工发布",
  published_manually: "录入复盘数据",
  review_pending: "确认复盘快照",
  review_recorded: "查看复盘结论"
};

const ALLOWED_TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  topic_created: ["topic_diagnosed", "angles_generated", "angle_selected"],
  topic_diagnosed: ["angles_generated", "angle_selected"],
  angles_generated: ["angle_selected"],
  angle_selected: ["outline_generated"],
  outline_generated: ["outline_review", "angle_selected"],
  outline_review: ["draft_generated", "angle_selected"],
  draft_generated: ["dbs_checking", "angle_selected"],
  dbs_checking: ["revision_generated", "draft_generated", "angle_selected"],
  revision_generated: ["human_review", "dbs_checking", "draft_generated", "angle_selected"],
  human_review: ["ready_to_publish"],
  ready_to_publish: ["publish_package_generated"],
  publish_package_generated: ["cover_generated"],
  cover_generated: ["uploaded_to_draft_box"],
  uploaded_to_draft_box: ["published_manually"],
  published_manually: ["review_pending"],
  review_pending: ["review_recorded"],
  review_recorded: []
};

export function getNextAction(status: ArticleStatus): string {
  return NEXT_ACTION_LABELS[status];
}

export function getStatusLabel(status: ArticleStatus): string {
  return ARTICLE_STATUS_LABELS[status];
}

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertCanTransition(from: ArticleStatus, to: ArticleStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot transition article from ${from} to ${to}.`);
  }
}

export function isPublishQueueStatus(status: ArticleStatus): boolean {
  return [
    "ready_to_publish",
    "publish_package_generated",
    "cover_generated",
    "uploaded_to_draft_box",
    "published_manually",
    "review_pending"
  ].includes(status);
}
