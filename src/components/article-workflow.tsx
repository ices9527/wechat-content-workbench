"use client";

import { Maximize2, Pencil, ScrollText, Trash2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type {
  AngleCandidate,
  AIStyleCheck,
  ArticleAsset,
  DraftVersion,
  IllustrationPlan,
  OutlineVersion,
  PromptRunArtifact,
  ResearchVersion,
  RequirementPreset,
  StagePromptDefault,
  TopicDiagnosis,
  TopicVersion,
  WechatDraftUpload
} from "@/db/schema";
import type { QualityGateReworkItem } from "@/domain/quality-gate-rework";
import type { ArticleStatus } from "@/domain/status";
import type { RequirementStage } from "@/domain/stages";
import type { WorkflowGuidance } from "@/domain/workflow-guidance";
import type { ArticleListItem } from "@/server/articles";
import type { PromptRecipe } from "@/server/prompt-recipes";
import {
  buildInlineIllustrationPositionOptions,
  resolveInlineIllustrationPosition,
  type InlineIllustrationPositionOption,
  type InlineIllustrationPositionResolution
} from "@/domain/inline-illustration-anchors";
import { MarkdownPreview } from "./markdown-preview";
import { PromptRecipeDialog } from "./prompts/prompt-recipe-dialog";
import { STAGE_PROMPT_UI } from "./prompts/prompt-ui";
import type { RequirementEditorInput } from "./prompts/requirement-selector";
import { StagePromptDialog } from "./prompts/stage-prompt-dialog";
import { QualityGateReworkCard } from "./quality-gate-rework-card";
import {
  AnglesPanel,
  DraftPanel,
  FinalPanel,
  IllustrationPanel,
  OutlinePanel,
  PublishPanel,
  ResearchPanel,
  ReviewPanel,
  WorkflowPanel
} from "./workflow/workflow-panels";
import { defaultTabForStatus, isWorkflowTabId, WORKFLOW_WORKSPACES, type WorkflowTabId } from "./workflow/workflow-tabs";
import { WorkspaceShell } from "./workflow/workspace-shell";
import { WorkflowGuidanceCard } from "./workflow/workflow-guidance-card";

// API helpers

class ApiResponseError extends Error {
  readonly payload: unknown;
  readonly status: number;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.payload = payload;
  }
}

async function postJson<T>(url: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  return parseJsonResponse<T>(response, "操作失败");
}

async function patchJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse<T>(response, "操作失败");
}

async function deleteJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "DELETE"
  });
  return parseJsonResponse<T>(response, "操作失败");
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return parseJsonResponse<T>(response, "操作失败");
}

async function postForm<T>(url: string, payload: FormData): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    body: payload
  });
  return parseJsonResponse<T>(response, "操作失败");
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const result = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new ApiResponseError(result.error || fallbackMessage, response.status, result);
    }
    return result;
  }

  const text = await response.text();
  const title = text.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  const snippet = (title || text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 160);
  if (!response.ok) {
    throw new Error(`${fallbackMessage}（HTTP ${response.status}${snippet ? `：${snippet}` : ""}）`);
  }
  throw new Error(`${fallbackMessage}（服务器返回了非 JSON 响应）`);
}

function isWechatDraftUpload(value: unknown): value is WechatDraftUpload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "articleId" in value &&
      "status" in value &&
      "uploadedAt" in value
  );
}

function failedUploadFromError(error: unknown): WechatDraftUpload | null {
  if (!(error instanceof ApiResponseError) || !error.payload || typeof error.payload !== "object") {
    return null;
  }
  const upload = (error.payload as { upload?: unknown }).upload;
  return isWechatDraftUpload(upload) && upload.status === "failed" ? upload : null;
}

// Formatters and workflow constants

function formatTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

const TOPIC_DIAGNOSIS_VERDICT_LABELS: Record<string, string> = {
  pass: "通过",
  revise: "修改后通过",
  hold: "暂缓",
  drop: "放弃"
};

const TOPIC_DIAGNOSIS_WARNING_COPY: Record<string, string> = {
  revise: "选题诊断建议先补强后再生成角度，你仍然可以继续。",
  hold: "选题诊断建议暂缓。请修改主题或重新运行选题诊断后继续。",
  drop: "选题诊断建议放弃。请修改主题或重新运行选题诊断后继续。"
};

const AI_STYLE_CHECK_VERDICT_LABELS: Record<string, string> = {
  clean: "清洁",
  minor: "少量问题",
  needs_cleanup: "需要清理",
  heavy_slop: "重度水分"
};

type AIStyleCheckIssueView = {
  type: string;
  quote: string;
  problem: string;
  fixDirection: string;
  severity?: string;
};

type IllustrationPlanItemView = {
  itemId: string;
  position: string;
  purpose: string;
  imageType: string;
  visualBrief: string;
  promptBrief: string;
  doNotVisualize: string;
  riskNotes: string;
};

type IllustrationPositionCheck = {
  status: "matched" | "fallback" | "unmatched" | "unavailable";
  label: string;
  className: string;
  targetAnchor: string;
  placementLabel: string;
  matchedLine: string;
  matchTypeLabel: string;
  warning: string | null;
};

function formatTopicDiagnosisVerdict(verdict: string | null | undefined): string {
  if (!verdict) {
    return "未诊断";
  }
  return TOPIC_DIAGNOSIS_VERDICT_LABELS[verdict] || verdict;
}

function formatAIStyleCheckVerdict(verdict: string | null | undefined): string {
  if (!verdict) {
    return "未检查";
  }
  return AI_STYLE_CHECK_VERDICT_LABELS[verdict] || verdict;
}

function isDraftVersionAIStyleCheck(check: AIStyleCheck): boolean {
  return check.sourceType === "draft_version";
}

function isPublishHTMLAIStyleCheck(check: AIStyleCheck): boolean {
  return check.sourceType === "publish_html";
}

function isHighRiskAIStyleCheck(check: AIStyleCheck | null | undefined): boolean {
  return check?.cleanlinessVerdict === "needs_cleanup" || check?.cleanlinessVerdict === "heavy_slop";
}

function requiresFinalDraftConfirmation(check: AIStyleCheck | null | undefined): boolean {
  return check?.cleanlinessVerdict === "heavy_slop";
}

function parseAIStyleCheckIssues(issuesJson: string): AIStyleCheckIssueView[] {
  try {
    const parsed = JSON.parse(issuesJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((issue) => {
      const item = issue && typeof issue === "object" ? (issue as Record<string, unknown>) : {};
      return {
        type: String(item.type || "未分类"),
        quote: String(item.quote || ""),
        problem: String(item.problem || item.explanation || ""),
        fixDirection: String(item.fixDirection || item.fix_direction || item.suggestion || ""),
        severity: item.severity ? String(item.severity) : undefined
      };
    });
  } catch {
    return [];
  }
}

function parseIllustrationPlanItems(planJson: string): IllustrationPlanItemView[] {
  try {
    const parsed = JSON.parse(planJson) as { items?: unknown };
    if (!Array.isArray(parsed.items)) {
      return [];
    }
    return parsed.items.map((item, index) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        itemId: String(record.itemId || `item-${index + 1}`),
        position: String(record.position || ""),
        purpose: String(record.purpose || ""),
        imageType: String(record.imageType || "正文配图"),
        visualBrief: String(record.visualBrief || ""),
        promptBrief: String(record.promptBrief || ""),
        doNotVisualize: String(record.doNotVisualize || ""),
        riskNotes: String(record.riskNotes || "")
      };
    });
  } catch {
    return [];
  }
}

function getIllustrationPlanStatusLabel(status: string): string {
  if (status === "confirmed") {
    return "已确认";
  }
  if (status === "superseded") {
    return "已被替代";
  }
  return "草稿";
}

function inlineIllustrationAssetKey(planId: string, itemId: string): string {
  return `${planId}:${itemId}`;
}

function inlineIllustrationPendingKey(itemId: string): string {
  return `generate-inline-illustration-${itemId}`;
}

function getInlineIllustrationMatchTypeLabel(matchType: InlineIllustrationPositionResolution["matchType"]): string {
  if (matchType === "heading") {
    return "标题";
  }
  if (matchType === "paragraph") {
    return "段落";
  }
  if (matchType === "list_item") {
    return "列表项";
  }
  return "未匹配";
}

function toIllustrationPositionCheck(item: IllustrationPlanItemView, finalDraft: DraftVersion | null): IllustrationPositionCheck {
  if (!finalDraft) {
    return {
      status: "unavailable",
      label: "不可检查",
      className: "unavailable",
      targetAnchor: item.position || "未填写",
      placementLabel: "未确定",
      matchedLine: "请先标记最终稿",
      matchTypeLabel: "无最终稿",
      warning: "没有最终稿，暂时不能检查插入位置。"
    };
  }

  const resolution = resolveInlineIllustrationPosition(finalDraft.markdown, item.position);
  return {
    status: resolution.status,
    label: resolution.status === "matched" ? "已匹配" : resolution.status === "fallback" ? "可能匹配，需确认" : "未匹配",
    className: resolution.status,
    targetAnchor: resolution.anchor || item.position || "未填写",
    placementLabel: resolution.placement === "before" ? "之前" : "之后",
    matchedLine: resolution.matchedLine || "没有匹配到最终稿内容",
    matchTypeLabel: getInlineIllustrationMatchTypeLabel(resolution.matchType),
    warning: resolution.warning
  };
}

function getInlineIllustrationAssetStatusLabel(asset: ArticleAsset | null): string {
  if (!asset) {
    return "未生成";
  }
  if (asset.status === "ready") {
    return "已生成";
  }
  if (asset.status === "failed") {
    return "生成失败";
  }
  if (asset.status === "generating") {
    return "生成中";
  }
  return asset.status;
}

function getInlineIllustrationAssetStatusClass(asset: ArticleAsset | null): string {
  if (!asset) {
    return "missing";
  }
  if (asset.status === "ready") {
    return "ready";
  }
  if (asset.status === "failed") {
    return "failed";
  }
  return "pending";
}

function isPlaceholderInlineIllustrationAsset(asset: ArticleAsset): boolean {
  return asset.assetType === "inline_illustration" && asset.provider === "fake_svg_illustration";
}

function compareAssetCreatedDesc(left: ArticleAsset, right: ArticleAsset): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function formatResearchOptionLabel(research: ResearchVersion): string {
  return `r${research.versionNo} · ${formatTime(research.createdAt)}`;
}

function extractMarkdownSection(markdown: string, headings: string[]): string {
  const lines = markdown.split(/\r?\n/);
  const collected: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1].trim();
      if (collecting) {
        break;
      }
      collecting = headings.some((item) => title.includes(item));
      continue;
    }
    if (collecting) {
      collected.push(line);
    }
  }

  return collected.join("\n").trim();
}

function getResearchCompareValue(research: ResearchVersion, field: "summary" | "boundaries" | "writeable" | "avoid"): string {
  const valueByField = {
    summary: research.summaryMarkdown || extractMarkdownSection(research.researchMarkdown, ["材料摘要", "摘要"]),
    boundaries:
      research.boundariesMarkdown ||
      extractMarkdownSection(research.researchMarkdown, ["边界提醒", "资料包边界提醒", "表达边界", "合规边界", "边界"]),
    writeable:
      research.writeableDirectionsMarkdown || extractMarkdownSection(research.researchMarkdown, ["可写方向", "可写", "写作方向"]),
    avoid:
      research.avoidDirectionsMarkdown ||
      extractMarkdownSection(research.researchMarkdown, ["不建议写的方向", "不建议", "避免", "禁区"])
  };
  return valueByField[field].trim() || "未填写";
}

function isBlockingTopicDiagnosisVerdict(verdict: string | null | undefined): boolean {
  return verdict === "hold" || verdict === "drop";
}

function normalizeTopicValue(value: string | null | undefined): string {
  return (value || "").trim();
}

function isTopicDiagnosisStale(article: ArticleListItem, diagnosis: TopicDiagnosis | null): boolean {
  if (!diagnosis) {
    return false;
  }

  return (
    normalizeTopicValue(article.topic) !== normalizeTopicValue(diagnosis.topicSnapshot) ||
    normalizeTopicValue(article.targetReader) !== normalizeTopicValue(diagnosis.targetReaderSnapshot) ||
    normalizeTopicValue(article.coreProblem) !== normalizeTopicValue(diagnosis.coreProblemSnapshot) ||
    normalizeTopicValue(article.hotAnchor) !== normalizeTopicValue(diagnosis.hotAnchorSnapshot)
  );
}

type TopicFormDraft = {
  topic: string;
  targetReader: string;
  coreProblem: string;
  hotAnchor: string;
};

const PROMPT_STAGES: RequirementStage[] = [
  "topic",
  "angle",
  "research",
  "outline",
  "draft",
  "ai_style_check",
  "illustration_plan",
  "pre_publish",
  "review"
];

const FINAL_DRAFT_LOCKED_STATUSES = new Set<ArticleStatus>([
  "ready_to_publish",
  "publish_package_generated",
  "cover_generated",
  "uploaded_to_draft_box",
  "published_manually",
  "review_pending",
  "review_recorded"
]);

function canMarkFinalDraft(status: ArticleStatus): boolean {
  return !FINAL_DRAFT_LOCKED_STATUSES.has(status);
}

// Stage-specific panel content

function TopicPanel({
  article,
  topicVersions,
  draft,
  editing,
  pending,
  onEdit,
  onCancel,
  onChange,
  onSave
}: {
  article: ArticleListItem;
  topicVersions: TopicVersion[];
  draft: TopicFormDraft;
  editing: boolean;
  pending: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (field: keyof TopicFormDraft, value: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <WorkflowPanel
      tabId="topic"
      title="主题"
      headActions={
        editing ? (
          <span className="status">{article.statusLabel}</span>
        ) : (
          <button className="button secondary compact-button icon-button-text" onClick={onEdit} type="button">
            <Pencil size={17} aria-hidden="true" />
            编辑主题
          </button>
        )
      }
    >
      {editing ? (
        <form className="topic-edit-form" onSubmit={onSave}>
          <label>
            <span className="label">主题</span>
            <input className="input" required value={draft.topic} onChange={(event) => onChange("topic", event.target.value)} />
          </label>
          <label>
            <span className="label">目标读者</span>
            <input className="input" value={draft.targetReader} onChange={(event) => onChange("targetReader", event.target.value)} />
          </label>
          <label>
            <span className="label">核心问题</span>
            <textarea className="textarea" value={draft.coreProblem} onChange={(event) => onChange("coreProblem", event.target.value)} />
          </label>
          <label>
            <span className="label">热点锚点</span>
            <input className="input" value={draft.hotAnchor} onChange={(event) => onChange("hotAnchor", event.target.value)} />
          </label>
          <div className="inline-actions">
            <button className="button" disabled={pending !== null} type="submit">
              {pending === "save-topic" ? "保存中" : "保存主题"}
            </button>
            <button className="button secondary" disabled={pending !== null} onClick={onCancel} type="button">
              取消
            </button>
          </div>
        </form>
      ) : (
        <dl className="detail-grid">
          <div className="detail-item">
            <dt>主题</dt>
            <dd>{article.topic}</dd>
          </div>
          <div className="detail-item">
            <dt>目标读者</dt>
            <dd>{article.targetReader || "未填写"}</dd>
          </div>
          <div className="detail-item">
            <dt>核心问题</dt>
            <dd>{article.coreProblem || "未填写"}</dd>
          </div>
          <div className="detail-item">
            <dt>热点锚点</dt>
            <dd>{article.hotAnchor || "未填写"}</dd>
          </div>
        </dl>
      )}

      <section className="topic-version-history" aria-label="主题版本历史">
        <div className="section-title-row">
          <h3>主题版本历史</h3>
          <span className="source-pill">{topicVersions.length} 个版本</span>
        </div>
        {topicVersions.length > 0 ? (
          <div className="topic-version-list">
            {topicVersions.map((version) => (
              <article className="mini-card topic-version-card" key={version.id}>
                <div className="topic-version-head">
                  <strong>v{version.versionNo}</strong>
                  <span className="source-pill">{version.createdBy === "initial" ? "初始主题" : "人工修改"}</span>
                  <span className="subtle">{formatTime(version.createdAt)}</span>
                </div>
                <dl className="detail-grid compact">
                  <div className="detail-item">
                    <dt>主题</dt>
                    <dd>{version.topic}</dd>
                  </div>
                  <div className="detail-item">
                    <dt>目标读者</dt>
                    <dd>{version.targetReader || "未填写"}</dd>
                  </div>
                  <div className="detail-item">
                    <dt>核心问题</dt>
                    <dd>{version.coreProblem || "未填写"}</dd>
                  </div>
                  <div className="detail-item">
                    <dt>热点锚点</dt>
                    <dd>{version.hotAnchor || "未填写"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="subtle">暂无主题版本记录。</p>
        )}
      </section>
    </WorkflowPanel>
  );
}

function TopicDiagnosisPanel({
  latestTopicDiagnosis,
  topicDiagnoses,
  staleWarning,
  requirements,
  selectedRequirementIds,
  customInstruction,
  pending,
  onSelectedRequirementIdsChange,
  onCustomInstructionChange,
  onRunDiagnosis,
  onOpenPromptRecipe,
  onCreateRequirement,
  onUpdateRequirement,
  onDeleteRequirement
}: {
  latestTopicDiagnosis: TopicDiagnosis | null;
  topicDiagnoses: TopicDiagnosis[];
  staleWarning: string | null;
  requirements: RequirementPreset[];
  selectedRequirementIds: string[];
  customInstruction: string;
  pending: string | null;
  onSelectedRequirementIdsChange: (ids: string[]) => void;
  onCustomInstructionChange: (value: string) => void;
  onRunDiagnosis: () => void;
  onOpenPromptRecipe: (topicDiagnosisId: string) => void;
  onCreateRequirement: (input: RequirementEditorInput) => Promise<void>;
  onUpdateRequirement: (id: string, input: Record<string, unknown>) => Promise<void>;
  onDeleteRequirement: (id: string) => Promise<void>;
}) {
  return (
    <WorkflowPanel
      tabId="topic-diagnosis"
      title="选题诊断"
      status={latestTopicDiagnosis ? formatTopicDiagnosisVerdict(latestTopicDiagnosis.verdict) : "待诊断"}
    >
      <StagePromptDialog
        title={STAGE_PROMPT_UI.topic.title}
        stage="topic"
        defaultPromptLabel={STAGE_PROMPT_UI.topic.defaultPromptLabel}
        defaultPrompt=""
        onDefaultPromptChange={() => undefined}
        onSaveDefaultPrompt={async () => undefined}
        requirements={requirements}
        selectedIds={selectedRequirementIds}
        pending={pending !== null}
        onSelectedIdsChange={onSelectedRequirementIdsChange}
        onCreate={onCreateRequirement}
        onUpdate={onUpdateRequirement}
        onDelete={onDeleteRequirement}
        showDefaultPrompt={false}
      />

      <label className="field prompt-field">
        <span className="label">对当前选题的要求</span>
        <textarea
          className="textarea prompt-textarea"
          placeholder="例如：重点判断是否有今天点开的理由，不要泛泛讲香港账户"
          value={customInstruction}
          onChange={(event) => onCustomInstructionChange(event.target.value)}
        />
      </label>

      <div className="action-row">
        <button className="button" disabled={pending !== null} onClick={onRunDiagnosis} type="button">
          {pending === "run-topic-diagnosis" ? "诊断中" : "运行 DBS 选题诊断"}
        </button>
      </div>

      {staleWarning ? <p className="error">{staleWarning}</p> : null}

      {latestTopicDiagnosis ? (
        <div className="topic-diagnosis-stack">
          <section className={`topic-diagnosis-result verdict-${latestTopicDiagnosis.verdict}`}>
            <div className="mini-card-head">
              <h3>最新诊断</h3>
              <div className="inline-actions">
                <span className="source-pill">{formatTime(latestTopicDiagnosis.createdAt)}</span>
                {latestTopicDiagnosis.sourceInvocationId ? (
                  <button
                    aria-label="查看最新选题诊断提示词配方"
                    className="icon-action"
                    disabled={pending !== null}
                    onClick={() => onOpenPromptRecipe(latestTopicDiagnosis.id)}
                    title="查看提示词配方"
                    type="button"
                  >
                    <ScrollText aria-hidden="true" size={16} />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="topic-verdict-line">
              <strong>{formatTopicDiagnosisVerdict(latestTopicDiagnosis.verdict)}</strong>
              <span>{latestTopicDiagnosis.nextAction || "未记录下一步建议"}</span>
            </div>
            <dl className="detail-grid compact">
              <div className="detail-item">
                <dt>目标读者</dt>
                <dd>{latestTopicDiagnosis.targetReaderCheck || "未记录"}</dd>
              </div>
              <div className="detail-item">
                <dt>真实问题</dt>
                <dd>{latestTopicDiagnosis.readerProblemCheck || "未记录"}</dd>
              </div>
              <div className="detail-item">
                <dt>点开理由</dt>
                <dd>{latestTopicDiagnosis.timelinessCheck || "未记录"}</dd>
              </div>
              <div className="detail-item">
                <dt>行动边界</dt>
                <dd>{latestTopicDiagnosis.actionabilityCheck || "未记录"}</dd>
              </div>
            </dl>
            {latestTopicDiagnosis.riskSummary ? <p className="topic-risk">风险：{latestTopicDiagnosis.riskSummary}</p> : null}
            {latestTopicDiagnosis.suggestionsMarkdown ? <MarkdownPreview markdown={latestTopicDiagnosis.suggestionsMarkdown} /> : null}
          </section>

          {topicDiagnoses.length > 1 ? (
            <section className="diagnosis-list">
              <h3>历史诊断</h3>
              {topicDiagnoses.slice(1).map((diagnosis) => (
                <details className="mini-card topic-diagnosis-history" key={diagnosis.id}>
                  <summary>
                    <span>{formatTopicDiagnosisVerdict(diagnosis.verdict)}</span>
                    <span className="source-pill">{formatTime(diagnosis.createdAt)}</span>
                  </summary>
                  <p>{diagnosis.nextAction || diagnosis.riskSummary || "未记录摘要"}</p>
                  <dl className="detail-grid compact">
                    <div className="detail-item">
                      <dt>主题快照</dt>
                      <dd>{diagnosis.topicSnapshot}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>目标读者快照</dt>
                      <dd>{diagnosis.targetReaderSnapshot || "未填写"}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>核心问题快照</dt>
                      <dd>{diagnosis.coreProblemSnapshot || "未填写"}</dd>
                    </div>
                    <div className="detail-item">
                      <dt>热点锚点快照</dt>
                      <dd>{diagnosis.hotAnchorSnapshot || "未填写"}</dd>
                    </div>
                  </dl>
                  {diagnosis.customInstructionSnapshot ? (
                    <p className="subtle">本次要求：{diagnosis.customInstructionSnapshot}</p>
                  ) : null}
                  {diagnosis.sourceInvocationId ? (
                    <button
                      className="button secondary"
                      disabled={pending !== null}
                      onClick={() => onOpenPromptRecipe(diagnosis.id)}
                      type="button"
                    >
                      提示词配方
                    </button>
                  ) : null}
                </details>
              ))}
            </section>
          ) : null}
        </div>
      ) : (
        <p className="subtle">还没有选题诊断记录。</p>
      )}
    </WorkflowPanel>
  );
}

function ResearchComparisonPanel({
  researchVersions,
  leftId,
  rightId,
  onLeftChange,
  onRightChange
}: {
  researchVersions: ResearchVersion[];
  leftId: string;
  rightId: string;
  onLeftChange: (id: string) => void;
  onRightChange: (id: string) => void;
}) {
  const leftResearch = researchVersions.find((research) => research.id === leftId) || researchVersions[0] || null;
  const rightResearch =
    researchVersions.find((research) => research.id === rightId) ||
    researchVersions.find((research) => research.id !== leftResearch?.id) ||
    null;
  const fields: Array<{ key: "summary" | "boundaries" | "writeable" | "avoid"; label: string }> = [
    { key: "summary", label: "材料摘要" },
    { key: "boundaries", label: "边界提醒" },
    { key: "writeable", label: "可写方向" },
    { key: "avoid", label: "不建议写的方向" }
  ];

  return (
    <section className="research-comparison" aria-label="资料包对比区域">
      <div className="section-title-row">
        <h3>资料包版本对比</h3>
        {researchVersions.length >= 2 ? <p className="subtle">结构化对比，不做逐字 diff。</p> : null}
      </div>

      {researchVersions.length < 2 ? (
        <p className="subtle">至少需要两个研究资料包版本，才能进行对比。</p>
      ) : (
        <>
          <div className="research-compare-selectors">
            <label className="field">
              <span className="label">左侧版本</span>
              <select
                aria-label="左侧对比版本"
                className="input"
                onChange={(event) => onLeftChange(event.target.value)}
                value={leftResearch?.id || ""}
              >
                {researchVersions.map((research) => (
                  <option disabled={research.id === rightResearch?.id} key={research.id} value={research.id}>
                    {formatResearchOptionLabel(research)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">右侧版本</span>
              <select
                aria-label="右侧对比版本"
                className="input"
                onChange={(event) => onRightChange(event.target.value)}
                value={rightResearch?.id || ""}
              >
                {researchVersions.map((research) => (
                  <option disabled={research.id === leftResearch?.id} key={research.id} value={research.id}>
                    {formatResearchOptionLabel(research)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {leftResearch && rightResearch ? (
            <div className="research-compare-list">
              {fields.map((field) => (
                <section className="research-compare-field" key={field.key}>
                  <h4>{field.label}</h4>
                  <div className="research-compare-grid">
                    <article className="research-compare-cell">
                      <strong>r{leftResearch.versionNo}</strong>
                      <MarkdownPreview markdown={getResearchCompareValue(leftResearch, field.key)} />
                    </article>
                    <article className="research-compare-cell">
                      <strong>r{rightResearch.versionNo}</strong>
                      <MarkdownPreview markdown={getResearchCompareValue(rightResearch, field.key)} />
                    </article>
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function IllustrationPositionStatus({ check }: { check: IllustrationPositionCheck }) {
  return (
    <section className={`illustration-position-check ${check.className}`} aria-label="位置匹配状态">
      <div className="illustration-position-check-head">
        <strong>{check.label}</strong>
        <span>{check.matchTypeLabel}</span>
      </div>
      <dl>
        <div>
          <dt>目标锚点</dt>
          <dd>{check.targetAnchor}</dd>
        </div>
        <div>
          <dt>插入方向</dt>
          <dd>{check.placementLabel}</dd>
        </div>
        <div>
          <dt>匹配内容</dt>
          <dd>{check.matchedLine}</dd>
        </div>
      </dl>
      {check.warning ? <p>{check.warning}</p> : null}
    </section>
  );
}

function IllustrationPositionSelector({
  options,
  disabled,
  onSelect
}: {
  options: InlineIllustrationPositionOption[];
  disabled: boolean;
  onSelect: (position: string) => void;
}) {
  return (
    <details className="illustration-position-selector">
      <summary>选择位置</summary>
      {options.length > 0 ? (
        <div className="illustration-position-options">
          {options.map((option) => (
            <div className="illustration-position-option" key={option.id}>
              <span>{option.label}</span>
              <div className="inline-actions">
                <button
                  className="button secondary compact-button"
                  disabled={disabled}
                  onClick={() => onSelect(option.positionBefore)}
                  type="button"
                >
                  之前
                </button>
                <button
                  className="button secondary compact-button"
                  disabled={disabled}
                  onClick={() => onSelect(option.positionAfter)}
                  type="button"
                >
                  之后
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="subtle">当前最终稿没有可选位置。</p>
      )}
    </details>
  );
}

function InlineIllustrationAssetPanel({
  articleId,
  plan,
  item,
  itemIndex,
  assets,
  pending,
  onGenerate
}: {
  articleId: string;
  plan: IllustrationPlan;
  item: IllustrationPlanItemView;
  itemIndex: number;
  assets: ArticleAsset[];
  pending: string | null;
  onGenerate: () => void;
}) {
  const latestAsset = assets[0] || null;
  const historyAssets = assets.slice(1);
  const canGenerate = plan.status === "confirmed";
  const actionPending = pending === inlineIllustrationPendingKey(item.itemId);
  const previewUrl = latestAsset?.status === "ready" ? `/api/articles/${articleId}/assets/${latestAsset.id}/file` : "";
  const latestAssetIsPlaceholder = latestAsset ? isPlaceholderInlineIllustrationAsset(latestAsset) : false;

  return (
    <section className="inline-illustration-assets" aria-label={`配图 ${itemIndex + 1} 图片资产`}>
      <div className="inline-asset-head">
        <div>
          <div className="inline-asset-status-row">
            <span className={`inline-asset-status ${getInlineIllustrationAssetStatusClass(latestAsset)}`}>
              {getInlineIllustrationAssetStatusLabel(latestAsset)}
            </span>
            {latestAssetIsPlaceholder ? <span className="inline-asset-status placeholder">测试占位图</span> : null}
          </div>
          <p>
            {latestAsset
              ? `${latestAsset.provider || "unknown"} · ${latestAsset.generatedAt ? formatTime(latestAsset.generatedAt) : formatTime(latestAsset.createdAt)}`
              : "确认规划后生成正文配图。"}
          </p>
        </div>
        <button
          aria-label={`${assets.length > 0 ? "重新生成" : "生成"}配图 ${itemIndex + 1} 图片`}
          className="button secondary compact-button"
          disabled={!canGenerate || pending !== null}
          onClick={onGenerate}
          type="button"
        >
          {actionPending ? "生成中" : assets.length > 0 ? "重新生成图片" : "生成图片"}
        </button>
      </div>

      {!canGenerate ? <p className="subtle">确认配图规划后可生成正文配图。</p> : null}
      {latestAssetIsPlaceholder ? (
        <p className="inline-asset-warning">这是本地测试占位图，只能用于预览；上传公众号草稿箱前请重新生成真实图片或删除该配图项。</p>
      ) : null}

      {latestAsset?.status === "ready" ? (
        <figure className="inline-asset-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- previewing local generated SVG assets from the workbench API */}
          <img alt={`配图 ${itemIndex + 1} 预览`} src={previewUrl} />
          <figcaption>{latestAsset.path}</figcaption>
        </figure>
      ) : null}

      {latestAsset?.status === "failed" ? (
        <p className="inline-asset-error">生成失败：{latestAsset.errorMessage || "未知错误"}</p>
      ) : null}

      {latestAsset?.promptSnapshot ? (
        <details className="inline-asset-details">
          <summary>查看 prompt</summary>
          <pre>{latestAsset.promptSnapshot}</pre>
        </details>
      ) : null}

      {historyAssets.length > 0 ? (
        <details className="inline-asset-history">
          <summary>历史记录（{historyAssets.length}）</summary>
          <div className="inline-asset-history-list">
            {historyAssets.map((asset) => (
              <div className="inline-asset-history-row" key={asset.id}>
                <span className={`inline-asset-status ${getInlineIllustrationAssetStatusClass(asset)}`}>
                  {getInlineIllustrationAssetStatusLabel(asset)}
                </span>
                <span>{asset.provider || "unknown"}</span>
                <span>{asset.generatedAt ? formatTime(asset.generatedAt) : formatTime(asset.createdAt)}</span>
                {asset.status === "ready" ? (
                  <a href={`/api/articles/${articleId}/assets/${asset.id}/file`} target="_blank" rel="noreferrer">
                    打开图片
                  </a>
                ) : (
                  <span>{asset.errorMessage || "无图片文件"}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function AIStyleCheckResultCard({
  check,
  draftLabel,
  compact = false,
  actionDisabled = false,
  onCreateCleanDraft,
  onOpenRecipe
}: {
  check: AIStyleCheck;
  draftLabel: string;
  compact?: boolean;
  actionDisabled?: boolean;
  onCreateCleanDraft?: (check: AIStyleCheck) => void;
  onOpenRecipe?: (check: AIStyleCheck) => void;
}) {
  const issues = parseAIStyleCheckIssues(check.issuesJson);
  const issueTypeSummary =
    issues.length > 0
      ? Array.from(
          issues.reduce((summary, issue) => {
            summary.set(issue.type, (summary.get(issue.type) || 0) + 1);
            return summary;
          }, new Map<string, number>())
        )
          .map(([type, count]) => `${type} ${count}`)
          .join("、")
      : "无";

  return (
    <article className={compact ? "mini-card ai-style-check-card compact" : "mini-card ai-style-check-card"}>
      <div className="mini-card-head">
        <div>
          <h3>{formatAIStyleCheckVerdict(check.cleanlinessVerdict)}</h3>
          <p>
            {draftLabel} · {formatTime(check.createdAt)}
          </p>
        </div>
        <div className="mini-card-actions ai-style-check-card-actions">
          <strong>{check.issueCount} 个问题</strong>
          {onCreateCleanDraft ? (
            <button
              className="button secondary compact-button"
              disabled={actionDisabled}
              onClick={() => onCreateCleanDraft(check)}
              type="button"
            >
              生成清洁版文案
            </button>
          ) : null}
          {onOpenRecipe ? (
            <button
              aria-label="查看文案清洁检查提示词配方"
              className="button secondary compact-button"
              onClick={() => onOpenRecipe(check)}
              type="button"
            >
              提示词配方
            </button>
          ) : null}
        </div>
      </div>
      <div className="ai-style-check-summary">
        <p>
          <span>问题类型</span>
          {issueTypeSummary}
        </p>
        {check.score !== null ? (
          <p>
            <span>清洁分</span>
            {check.score}
          </p>
        ) : null}
      </div>
      <MarkdownPreview markdown={check.summaryMarkdown} />
      {issues.length > 0 ? (
        <div className="ai-style-check-issues">
          {issues.map((issue, index) => (
            <section className="ai-style-check-issue" key={`${issue.type}-${index}`}>
              <div className="topic-verdict-line">
                <strong>{issue.type}</strong>
                {issue.severity ? <span>{issue.severity}</span> : null}
              </div>
              {issue.quote ? <blockquote>{issue.quote}</blockquote> : null}
              {issue.problem ? <p>{issue.problem}</p> : null}
              {issue.fixDirection ? <p className="first-fix">{issue.fixDirection}</p> : null}
            </section>
          ))}
        </div>
      ) : (
        <p className="subtle">没有具体问题片段。</p>
      )}
    </article>
  );
}

// Stage keyed prompt state helpers

function defaultRequirementIdsFromKey(key: string): string[] {
  return key
    .split("|")
    .filter((item) => item.endsWith(":true"))
    .map((item) => item.slice(0, item.lastIndexOf(":")))
    .filter(Boolean);
}

function createStageRecord<T>(factory: (stage: RequirementStage) => T): Record<RequirementStage, T> {
  const record = {} as Record<RequirementStage, T>;
  for (const stage of PROMPT_STAGES) {
    record[stage] = factory(stage);
  }
  return record;
}

function promptDraftsFromStagePrompts(stagePrompts: StagePromptDefault[]): Record<RequirementStage, string> {
  return createStageRecord((stage) => stagePrompts.find((prompt) => prompt.stage === stage)?.prompt || "");
}

function selectedRequirementIdsFromKeys(requirementKeys: Record<RequirementStage, string>): Record<RequirementStage, string[]> {
  return createStageRecord((stage) => defaultRequirementIdsFromKey(requirementKeys[stage]));
}

// Article workflow composer

export function ArticleWorkflow({
  article,
  angles,
  outlines,
  researchVersions,
  drafts,
  aiStyleChecks,
  illustrationPlans,
  topicDiagnoses,
  topicVersions,
  assets,
  uploads,
  stagePrompts,
  requirementPresets,
  promptArtifacts,
  qualityGateReworkItems,
  workflowGuidance
}: {
  article: ArticleListItem;
  angles: AngleCandidate[];
  outlines: OutlineVersion[];
  researchVersions: ResearchVersion[];
  drafts: DraftVersion[];
  aiStyleChecks: AIStyleCheck[];
  illustrationPlans: IllustrationPlan[];
  topicDiagnoses: TopicDiagnosis[];
  topicVersions: TopicVersion[];
  assets: ArticleAsset[];
  uploads: WechatDraftUpload[];
  stagePrompts: StagePromptDefault[];
  requirementPresets: RequirementPreset[];
  promptArtifacts: PromptRunArtifact[];
  qualityGateReworkItems: QualityGateReworkItem[];
  workflowGuidance: WorkflowGuidance;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const articleStatus = article.status as ArticleStatus;
  const requestedTab = searchParams.get("tab");
  const initialTab = isWorkflowTabId(requestedTab) ? requestedTab : defaultTabForStatus(articleStatus);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkflowTabId>(initialTab);
  const [topicEditing, setTopicEditing] = useState(false);
  const [topicDraft, setTopicDraft] = useState<TopicFormDraft>({
    topic: article.topic,
    targetReader: article.targetReader || "",
    coreProblem: article.coreProblem || "",
    hotAnchor: article.hotAnchor || ""
  });
  const latestOutline = outlines[0] || null;
  const latestResearch = researchVersions[0] || null;
  const acceptedOutline = outlines.find((outline) => outline.accepted) || null;
  const latestDraft = drafts[0] || null;
  const finalDraft = drafts.find((draft) => draft.isFinal) || null;
  const latestIllustrationPlan = illustrationPlans[0] || null;
  const latestTopicDiagnosis = topicDiagnoses[0] || null;
  const [mainline, setMainline] = useState(latestOutline?.mainline || "");
  const [outlineMarkdown, setOutlineMarkdown] = useState(latestOutline?.outlineMarkdown || "");
  const [selectedOutlineId, setSelectedOutlineId] = useState(latestOutline?.id || "");
  const [selectedResearchId, setSelectedResearchId] = useState(latestResearch?.id || "");
  const [compareLeftResearchId, setCompareLeftResearchId] = useState(researchVersions[0]?.id || "");
  const [compareRightResearchId, setCompareRightResearchId] = useState(researchVersions[1]?.id || "");
  const [draftMarkdown, setDraftMarkdown] = useState(latestDraft?.markdown || "");
  const [selectedDraftId, setSelectedDraftId] = useState(latestDraft?.id || "");
  const [selectedIllustrationPlanId, setSelectedIllustrationPlanId] = useState(latestIllustrationPlan?.id || "");
  const [illustrationSummaryMarkdown, setIllustrationSummaryMarkdown] = useState(latestIllustrationPlan?.summaryMarkdown || "");
  const [illustrationPlanItems, setIllustrationPlanItems] = useState<IllustrationPlanItemView[]>(() =>
    latestIllustrationPlan ? parseIllustrationPlanItems(latestIllustrationPlan.planJson) : []
  );
  const stagePromptKey = useMemo(
    () =>
      PROMPT_STAGES.map((stage) => {
        const prompt = stagePrompts.find((item) => item.stage === stage);
        return `${stage}:${prompt?.id || ""}:${prompt?.prompt || ""}`;
      }).join("|"),
    [stagePrompts]
  );
  const requirementsByStage = useMemo(() => {
    const grouped = createStageRecord<RequirementPreset[]>(() => []);
    for (const requirement of requirementPresets) {
      if (requirement.stage in grouped) {
        grouped[requirement.stage as RequirementStage].push(requirement);
      }
    }
    return grouped;
  }, [requirementPresets]);
  const topicRequirements = requirementsByStage.topic;
  const angleRequirements = requirementsByStage.angle;
  const researchRequirements = requirementsByStage.research;
  const outlineRequirements = requirementsByStage.outline;
  const draftRequirements = requirementsByStage.draft;
  const aiStyleCheckRequirements = requirementsByStage.ai_style_check;
  const illustrationPlanRequirements = requirementsByStage.illustration_plan;
  const prePublishRequirements = requirementsByStage.pre_publish;
  const reviewRequirements = requirementsByStage.review;
  const requirementKeys = useMemo(
    () => createStageRecord((stage) => requirementsByStage[stage].map((requirement) => `${requirement.id}:${requirement.defaultEnabled}`).join("|")),
    [requirementsByStage]
  );
  const promptArtifactsByStage = useMemo(
    () => ({
      pre_publish: promptArtifacts.filter((artifact) => artifact.stage === "pre_publish"),
      review: promptArtifacts.filter((artifact) => artifact.stage === "review")
    }),
    [promptArtifacts]
  );
  const latestPrePublishArtifact = promptArtifactsByStage.pre_publish[0] || null;
  const latestReviewArtifact = promptArtifactsByStage.review[0] || null;
  const [defaultPromptDrafts, setDefaultPromptDrafts] = useState<Record<RequirementStage, string>>(() =>
    promptDraftsFromStagePrompts(stagePrompts)
  );
  const [customInstructions, setCustomInstructions] = useState<Record<RequirementStage, string>>(() => createStageRecord(() => ""));
  const [topicDiagnosisCustomInstruction, setTopicDiagnosisCustomInstruction] = useState("");
  const [researchCustomInstruction, setResearchCustomInstruction] = useState("");
  const [researchEditorSourceId, setResearchEditorSourceId] = useState("");
  const [researchEditorMarkdown, setResearchEditorMarkdown] = useState("");
  const [researchSummaryMarkdown, setResearchSummaryMarkdown] = useState("");
  const [selectedRequirementIdsByStage, setSelectedRequirementIdsByStage] = useState<Record<RequirementStage, string[]>>(() =>
    selectedRequirementIdsFromKeys(requirementKeys)
  );
  const [aiStyleCheckList, setAIStyleCheckList] = useState(aiStyleChecks);
  const angleDefaultPrompt = defaultPromptDrafts.angle;
  const researchDefaultPrompt = defaultPromptDrafts.research;
  const outlineDefaultPrompt = defaultPromptDrafts.outline;
  const draftDefaultPrompt = defaultPromptDrafts.draft;
  const aiStyleCheckDefaultPrompt = defaultPromptDrafts.ai_style_check;
  const illustrationPlanDefaultPrompt = defaultPromptDrafts.illustration_plan;
  const prePublishDefaultPrompt = defaultPromptDrafts.pre_publish;
  const reviewDefaultPrompt = defaultPromptDrafts.review;
  const setAngleDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("angle", value);
  const setResearchDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("research", value);
  const setOutlineDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("outline", value);
  const setDraftDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("draft", value);
  const setAIStyleCheckDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("ai_style_check", value);
  const setIllustrationPlanDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("illustration_plan", value);
  const setPrePublishDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("pre_publish", value);
  const setReviewDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("review", value);
  const angleCustomInstruction = customInstructions.angle;
  const outlineCustomInstruction = customInstructions.outline;
  const draftCustomInstruction = customInstructions.draft;
  const aiStyleCheckCustomInstruction = customInstructions.ai_style_check;
  const illustrationPlanCustomInstruction = customInstructions.illustration_plan;
  const prePublishCustomInstruction = customInstructions.pre_publish;
  const reviewCustomInstruction = customInstructions.review;
  const setAngleCustomInstruction = (value: string) => setCustomInstructionForStage("angle", value);
  const setOutlineCustomInstruction = (value: string) => setCustomInstructionForStage("outline", value);
  const setDraftCustomInstruction = (value: string) => setCustomInstructionForStage("draft", value);
  const setAIStyleCheckCustomInstruction = (value: string) => setCustomInstructionForStage("ai_style_check", value);
  const setIllustrationPlanCustomInstruction = (value: string) => setCustomInstructionForStage("illustration_plan", value);
  const setPrePublishCustomInstruction = (value: string) => setCustomInstructionForStage("pre_publish", value);
  const setReviewCustomInstruction = (value: string) => setCustomInstructionForStage("review", value);
  const selectedTopicRequirementIds = selectedRequirementIdsByStage.topic;
  const selectedAngleRequirementIds = selectedRequirementIdsByStage.angle;
  const selectedResearchRequirementIds = selectedRequirementIdsByStage.research;
  const selectedOutlineRequirementIds = selectedRequirementIdsByStage.outline;
  const selectedDraftRequirementIds = selectedRequirementIdsByStage.draft;
  const selectedAIStyleCheckRequirementIds = selectedRequirementIdsByStage.ai_style_check;
  const selectedIllustrationPlanRequirementIds = selectedRequirementIdsByStage.illustration_plan;
  const selectedPrePublishRequirementIds = selectedRequirementIdsByStage.pre_publish;
  const selectedReviewRequirementIds = selectedRequirementIdsByStage.review;
  const setSelectedTopicRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("topic", ids);
  const setSelectedAngleRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("angle", ids);
  const setSelectedResearchRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("research", ids);
  const setSelectedOutlineRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("outline", ids);
  const setSelectedDraftRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("draft", ids);
  const setSelectedAIStyleCheckRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("ai_style_check", ids);
  const setSelectedIllustrationPlanRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("illustration_plan", ids);
  const setSelectedPrePublishRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("pre_publish", ids);
  const setSelectedReviewRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("review", ids);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [optimisticUploads, setOptimisticUploads] = useState<WechatDraftUpload[]>([]);
  const [fullscreenPane, setFullscreenPane] = useState<"editor" | "preview" | null>(null);
  const [promptRecipe, setPromptRecipe] = useState<PromptRecipe | null>(null);
  const [selectedAIStyleCheckDetailId, setSelectedAIStyleCheckDetailId] = useState("");
  const activeArticleIdRef = useRef(article.id);
  const draftEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const fullscreenEditorRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedAngle = useMemo(() => angles.find((angle) => angle.selected), [angles]);
  const researchById = useMemo(() => new Map(researchVersions.map((research) => [research.id, research])), [researchVersions]);
  const selectedResearch = selectedResearchId ? researchById.get(selectedResearchId) || null : latestResearch;
  const outlineById = useMemo(() => new Map(outlines.map((outline) => [outline.id, outline])), [outlines]);
  const selectedOutline = selectedOutlineId ? outlineById.get(selectedOutlineId) || null : latestOutline;
  const draftById = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft])), [drafts]);
  const selectedDraft = selectedDraftId ? draftById.get(selectedDraftId) || null : latestDraft;
  const selectedDraftHasUnsavedChanges = Boolean(selectedDraft && selectedDraft.markdown !== draftMarkdown);
  const illustrationPlanById = useMemo(() => new Map(illustrationPlans.map((plan) => [plan.id, plan])), [illustrationPlans]);
  const selectedIllustrationPlan = selectedIllustrationPlanId
    ? illustrationPlanById.get(selectedIllustrationPlanId) || null
    : latestIllustrationPlan;
  const selectedIllustrationPlanEditable = selectedIllustrationPlan?.status === "draft";
  const selectedDraftAIStyleChecks = useMemo(
    () => aiStyleCheckList.filter((check) => check.draftVersionId === selectedDraftId && isDraftVersionAIStyleCheck(check)),
    [aiStyleCheckList, selectedDraftId]
  );
  const latestSelectedDraftAIStyleCheck = selectedDraftAIStyleChecks[0] || null;
  const latestPublishHTMLAIStyleCheck = useMemo(
    () => aiStyleCheckList.find((check) => isPublishHTMLAIStyleCheck(check)) || null,
    [aiStyleCheckList]
  );
  const selectedAIStyleCheckDetail = selectedAIStyleCheckDetailId
    ? aiStyleCheckList.find((check) => check.id === selectedAIStyleCheckDetailId) || null
    : null;
  const htmlAssets = assets.filter((asset) => asset.assetType === "html");
  const latestHtmlAsset = htmlAssets[0] || null;
  const coverAssets = assets.filter((asset) => asset.assetType === "cover");
  const readyInlineIllustrationAssets = assets.filter((asset) => asset.assetType === "inline_illustration" && asset.status === "ready");
  const placeholderInlineIllustrationAssets = readyInlineIllustrationAssets.filter(isPlaceholderInlineIllustrationAsset);
  const uploadableInlineIllustrationAssets = readyInlineIllustrationAssets.filter((asset) => !isPlaceholderInlineIllustrationAsset(asset));
  const inlineIllustrationAssetsByItem = useMemo(() => {
    const grouped = new Map<string, ArticleAsset[]>();
    for (const asset of assets) {
      if (asset.assetType !== "inline_illustration" || !asset.sourcePlanId || !asset.sourcePlanItemId) {
        continue;
      }
      const key = inlineIllustrationAssetKey(asset.sourcePlanId, asset.sourcePlanItemId);
      const current = grouped.get(key) || [];
      current.push(asset);
      grouped.set(key, current);
    }
    for (const itemAssets of grouped.values()) {
      itemAssets.sort(compareAssetCreatedDesc);
    }
    return grouped;
  }, [assets]);
  const illustrationPositionOptions = useMemo(
    () => (finalDraft ? buildInlineIllustrationPositionOptions(finalDraft.markdown) : []),
    [finalDraft]
  );
  const illustrationPositionChecks = useMemo(
    () => new Map(illustrationPlanItems.map((item) => [item.itemId, toIllustrationPositionCheck(item, finalDraft)])),
    [finalDraft, illustrationPlanItems]
  );
  const selectedIllustrationPlanFinalDraftChanged = Boolean(
    selectedIllustrationPlan && finalDraft && selectedIllustrationPlan.finalDraftVersionId !== finalDraft.id
  );
  const blockedIllustrationPlanItems = illustrationPlanItems.filter(
    (item) => {
      const status = illustrationPositionChecks.get(item.itemId)?.status;
      return status === "unmatched" || status === "unavailable";
    }
  );
  const visibleUploads = useMemo(() => {
    const merged: WechatDraftUpload[] = [];
    const seen = new Set<string>();
    for (const upload of [...optimisticUploads, ...uploads]) {
      if (seen.has(upload.id)) {
        continue;
      }
      seen.add(upload.id);
      merged.push(upload);
    }
    return merged;
  }, [optimisticUploads, uploads]);
  const latestUpload = visibleUploads[0] || null;
  const canMarkFinal = drafts.length > 0 && canMarkFinalDraft(articleStatus);
  const topicDiagnosisIsStale = isTopicDiagnosisStale(article, latestTopicDiagnosis);
  const staleTopicDiagnosisWarning = topicDiagnosisIsStale ? "主题已修改，需要重新运行选题诊断后继续。" : null;
  const topicDiagnosisWarning =
    staleTopicDiagnosisWarning || (latestTopicDiagnosis ? TOPIC_DIAGNOSIS_WARNING_COPY[latestTopicDiagnosis.verdict] || null : null);
  const topicDiagnosisBlocksDownstream = topicDiagnosisIsStale || isBlockingTopicDiagnosisVerdict(latestTopicDiagnosis?.verdict);

  function setDefaultPromptDraftForStage(stage: RequirementStage, value: string) {
    setDefaultPromptDrafts((current) => ({ ...current, [stage]: value }));
  }

  function setCustomInstructionForStage(stage: RequirementStage, value: string) {
    setCustomInstructions((current) => ({ ...current, [stage]: value }));
  }

  function setSelectedRequirementIdsForStage(stage: RequirementStage, ids: string[]) {
    setSelectedRequirementIdsByStage((current) => ({ ...current, [stage]: ids }));
  }

  function getTabMeta(tabId: WorkflowTabId): string {
    if (tabId === "topic") {
      return "已建";
    }
    if (tabId === "topic-diagnosis") {
      if (topicDiagnosisIsStale) {
        return "需重诊";
      }
      return latestTopicDiagnosis ? formatTopicDiagnosisVerdict(latestTopicDiagnosis.verdict) : "待做";
    }
    if (tabId === "angles") {
      return selectedAngle ? "已选" : angles.length > 0 ? `${angles.length} 个` : "待做";
    }
    if (tabId === "research") {
      return latestResearch ? `r${latestResearch.versionNo}` : selectedAngle ? "待生成" : "待选角度";
    }
    if (tabId === "outline") {
      return acceptedOutline ? "已确认" : latestOutline ? "待确认" : "待做";
    }
    if (tabId === "draft") {
      return latestDraft ? `v${latestDraft.versionNo}` : "待做";
    }
    if (tabId === "final") {
      return finalDraft ? `v${finalDraft.versionNo}` : "待做";
    }
    if (tabId === "illustration") {
      if (latestIllustrationPlan?.status === "confirmed") {
        return "已确认";
      }
      if (latestIllustrationPlan) {
        return "待确认";
      }
      return finalDraft ? "待规划" : "待最终稿";
    }
    if (tabId === "publish") {
      if (latestUpload?.status === "success") {
        return "已上传";
      }
      if (coverAssets.length > 0) {
        return "有封面";
      }
      if (htmlAssets.length > 0) {
        return "有 HTML";
      }
      return "待做";
    }
    if (articleStatus === "review_recorded") {
      return "已复盘";
    }
    if (articleStatus === "review_pending") {
      return "待复盘";
    }
    return "待发布";
  }

  function switchWorkflowTab(tabId: WorkflowTabId) {
    setActiveTab(tabId);
    const params = new URLSearchParams(typeof window === "undefined" ? searchParams.toString() : window.location.search);
    params.set("tab", tabId);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    if (topicEditing) {
      return;
    }
    setTopicDraft({
      topic: article.topic,
      targetReader: article.targetReader || "",
      coreProblem: article.coreProblem || "",
      hotAnchor: article.hotAnchor || ""
    });
  }, [article.topic, article.targetReader, article.coreProblem, article.hotAnchor, topicEditing]);

  useEffect(() => {
    setSelectedOutlineId((current) => {
      if (current && outlines.some((outline) => outline.id === current)) {
        return current;
      }
      return latestOutline?.id || "";
    });
  }, [latestOutline?.id, outlines]);

  useEffect(() => {
    setSelectedResearchId((current) => {
      if (current && researchVersions.some((research) => research.id === current)) {
        return current;
      }
      return latestResearch?.id || "";
    });
  }, [latestResearch?.id, researchVersions]);

  useEffect(() => {
    const outline = selectedOutlineId ? outlineById.get(selectedOutlineId) || latestOutline : latestOutline;
    setMainline(outline?.mainline || "");
    setOutlineMarkdown(outline?.outlineMarkdown || "");
  }, [latestOutline, outlineById, selectedOutlineId]);

  useEffect(() => {
    setDefaultPromptDrafts(promptDraftsFromStagePrompts(stagePrompts));
  }, [stagePromptKey, stagePrompts]);

  useEffect(() => {
    setSelectedRequirementIdsByStage(selectedRequirementIdsFromKeys(requirementKeys));
  }, [article.id, requirementKeys]);

  useEffect(() => {
    setOptimisticUploads([]);
  }, [article.id, uploads]);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    const tabFromUrl = isWorkflowTabId(urlTab) ? urlTab : null;
    if (activeArticleIdRef.current !== article.id) {
      activeArticleIdRef.current = article.id;
      setActiveTab(tabFromUrl || defaultTabForStatus(articleStatus));
      return;
    }
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [activeTab, article.id, articleStatus, searchParams]);

  useEffect(() => {
    setDraftMarkdown(latestDraft?.markdown || "");
    setSelectedDraftId(latestDraft?.id || "");
  }, [latestDraft?.id, latestDraft?.markdown]);

  useEffect(() => {
    setSelectedIllustrationPlanId((current) => {
      if (current && illustrationPlans.some((plan) => plan.id === current)) {
        return current;
      }
      return latestIllustrationPlan?.id || "";
    });
  }, [illustrationPlans, latestIllustrationPlan?.id]);

  useEffect(() => {
    const plan = selectedIllustrationPlanId
      ? illustrationPlanById.get(selectedIllustrationPlanId) || latestIllustrationPlan
      : latestIllustrationPlan;
    setIllustrationSummaryMarkdown(plan?.summaryMarkdown || "");
    setIllustrationPlanItems(plan ? parseIllustrationPlanItems(plan.planJson) : []);
  }, [illustrationPlanById, latestIllustrationPlan, selectedIllustrationPlanId]);

  useEffect(() => {
    setAIStyleCheckList(aiStyleChecks);
  }, [aiStyleChecks]);

  useEffect(() => {
    if (!fullscreenPane) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFullscreenPane(null);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullscreenPane]);

  useEffect(() => {
    if (fullscreenPane === "editor") {
      window.requestAnimationFrame(() => fullscreenEditorRef.current?.focus());
    }
  }, [fullscreenPane]);

  useEffect(() => {
    setPromptRecipe(null);
  }, [article.id]);

  useEffect(() => {
    if (!selectedAIStyleCheckDetailId) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedAIStyleCheckDetailId("");
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedAIStyleCheckDetailId]);

  async function runAction(label: string, action: () => Promise<void>, nextTab?: WorkflowTabId) {
    setPending(label);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (nextTab) {
        switchWorkflowTab(nextTab);
      }
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally {
      setPending(null);
    }
  }

  function resetTopicDraft() {
    setTopicDraft({
      topic: article.topic,
      targetReader: article.targetReader || "",
      coreProblem: article.coreProblem || "",
      hotAnchor: article.hotAnchor || ""
    });
  }

  function updateTopicDraft(field: keyof TopicFormDraft, value: string) {
    setTopicDraft((current) => ({ ...current, [field]: value }));
  }

  function startTopicEditing() {
    resetTopicDraft();
    setTopicEditing(true);
  }

  function cancelTopicEditing() {
    resetTopicDraft();
    setTopicEditing(false);
  }

  async function saveTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("save-topic", async () => {
      await patchJson(`/api/articles/${article.id}`, topicDraft);
      setTopicEditing(false);
      setNotice(latestTopicDiagnosis ? "已保存主题。请重新运行选题诊断后继续。" : "已保存主题");
    });
  }

  async function submitManualAngle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (topicDiagnosisBlocksDownstream) {
      setError(topicDiagnosisWarning || "请修改主题或重新运行选题诊断后继续。");
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    await runAction("manual-angle", async () => {
      await postJson(`/api/articles/${article.id}/angles`, {
        angleTitle: String(formData.get("angleTitle") || ""),
        readerPain: String(formData.get("readerPain") || ""),
        promise: String(formData.get("promise") || ""),
        risk: String(formData.get("risk") || "")
      });
      form.reset();
    });
  }

  function getDraftLabel(draftVersionId: string): string {
    const draft = draftById.get(draftVersionId);
    return draft ? `v${draft.versionNo}` : "未知版本";
  }

  function getDraftTypeLabel(draft: DraftVersion): string {
    if (draft.sourceAIStyleCheckId) {
      return "清洁版文案";
    }
    if (draft.draftType === "revision") {
      return "修改稿";
    }
    if (draft.draftType === "initial") {
      return "初稿";
    }
    return "保存稿";
  }

  function getAIStyleChecksForDraft(draftVersionId: string): AIStyleCheck[] {
    return aiStyleCheckList.filter((check) => check.draftVersionId === draftVersionId && isDraftVersionAIStyleCheck(check));
  }

  function getLatestAIStyleCheckForDraft(draftVersionId: string): AIStyleCheck | null {
    return getAIStyleChecksForDraft(draftVersionId)[0] || null;
  }

  function getAIStyleCheckStatusCopy(check: AIStyleCheck | null): string {
    if (!check) {
      return "未运行文案清洁检查";
    }
    if (isHighRiskAIStyleCheck(check)) {
      return `有高风险表达水分：${formatAIStyleCheckVerdict(check.cleanlinessVerdict)}`;
    }
    return `已检查：${formatAIStyleCheckVerdict(check.cleanlinessVerdict)}`;
  }

  function handleCoverFile(event: ChangeEvent<HTMLInputElement>) {
    setCoverFile(event.target.files?.[0] || null);
  }

  function loadDraftIntoEditor(draft: DraftVersion) {
    setDraftMarkdown(draft.markdown);
    setSelectedDraftId(draft.id);
    setError(null);
    setNotice(`已载入文案 v${draft.versionNo} 到编辑器`);
    if (activeTab !== "draft") {
      switchWorkflowTab("draft");
    }
    window.requestAnimationFrame(() => {
      draftEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      draftEditorRef.current?.focus();
    });
  }

  async function createCleanDraftFromCheck(check: AIStyleCheck) {
    await runAction(
      "revise-from-ai-style-check",
      async () => {
        const draft = await postJson<DraftVersion>(`/api/articles/${article.id}/revise-from-ai-style-check`, {
          checkId: check.id
        });
        setDraftMarkdown(draft.markdown);
        setSelectedDraftId(draft.id);
        setSelectedAIStyleCheckDetailId("");
        setNotice(`已生成清洁版文案 v${draft.versionNo}`);
      },
      "draft"
    );
  }

  async function markDraftAsFinal(draft: DraftVersion) {
    const latestCheck = getLatestAIStyleCheckForDraft(draft.id);
    const force = requiresFinalDraftConfirmation(latestCheck);
    if (force && !window.confirm("仍存在明显表达水分，是否继续标记最终稿")) {
      return;
    }
    await postJson<DraftVersion>(`/api/articles/${article.id}/mark-final-draft`, {
      draftVersionId: draft.id,
      force
    });
    setNotice(`已标记最终稿 v${draft.versionNo}`);
  }

  function selectDraftVersion(draftId: string) {
    const draft = draftById.get(draftId);
    if (draft) {
      loadDraftIntoEditor(draft);
    }
  }

  function getOutlineOptionLabel(outline: OutlineVersion): string {
    return outline.accepted ? `v${outline.versionNo} · 已确认` : `v${outline.versionNo}`;
  }

  function getResearchOptionLabel(research: ResearchVersion): string {
    return formatResearchOptionLabel(research);
  }

  function selectResearchVersion(researchId: string) {
    if (researchById.has(researchId)) {
      setSelectedResearchId(researchId);
    }
  }

  function loadResearchIntoEditor(research: ResearchVersion) {
    setResearchEditorSourceId(research.id);
    setResearchEditorMarkdown(research.researchMarkdown);
    setResearchSummaryMarkdown(research.summaryMarkdown);
    setError(null);
    setNotice(`已载入资料包 r${research.versionNo}`);
  }

  function loadOutlineIntoEditor(outline: OutlineVersion) {
    setMainline(outline.mainline);
    setOutlineMarkdown(outline.outlineMarkdown);
    setSelectedOutlineId(outline.id);
    setError(null);
    setNotice(`已载入提纲 v${outline.versionNo}`);
  }

  function selectOutlineVersion(outlineId: string) {
    const outline = outlineById.get(outlineId);
    if (outline) {
      loadOutlineIntoEditor(outline);
    }
  }

  async function saveStagePrompt(stage: RequirementStage, prompt: string) {
    const saved = await patchJson<StagePromptDefault>("/api/stage-prompts", {
      stage,
      prompt
    });
    setDefaultPromptDraftForStage(stage, saved.prompt);
    setNotice(STAGE_PROMPT_UI[stage].savedNotice);
  }

  async function createRequirement(input: {
    stage: RequirementStage;
    category: string;
    type: string;
    label: string;
    description: string;
    promptFragment: string;
    defaultEnabled: boolean;
    priority: number;
  }) {
    await postJson<RequirementPreset>("/api/requirements", input);
    setNotice("已新增可选提示词");
  }

  async function updateRequirement(id: string, input: Record<string, unknown>) {
    await patchJson<RequirementPreset>(`/api/requirements?id=${encodeURIComponent(id)}`, input);
    setNotice("已更新可选提示词");
  }

  async function deleteRequirement(id: string) {
    const result = await deleteJson<{ deleted: boolean; archived: boolean }>(`/api/requirements?id=${encodeURIComponent(id)}`);
    setNotice(result.deleted ? "已删除可选提示词" : "该提示词已有历史使用记录，已归档");
  }

  async function saveCustomInstructionAsRequirement(stage: RequirementStage, prompt: string) {
    const promptFragment = prompt.trim();
    if (!promptFragment) {
      throw new Error("对当前文章的要求为空");
    }
    const label = window.prompt("可选提示词标签");
    if (!label?.trim()) {
      return;
    }
    await createRequirement({
      stage,
      category: "自定义",
      type: "prefer",
      label: label.trim(),
      description: label.trim(),
      promptFragment,
      defaultEnabled: false,
      priority: 500
    });
  }

  async function openPromptRecipe(
    kind: "outline" | "draft" | "topic-diagnosis" | "research" | "ai-style-check" | "illustration-plan" | "invocation",
    targetId: string | null
  ) {
    if (!targetId) {
      return;
    }
    const queryKey =
      kind === "outline"
        ? "outlineVersionId"
        : kind === "draft"
          ? "draftVersionId"
          : kind === "topic-diagnosis"
            ? "topicDiagnosisId"
            : kind === "research"
              ? "researchVersionId"
              : kind === "ai-style-check"
                ? "aiStyleCheckId"
                : kind === "illustration-plan"
                  ? "illustrationPlanId"
                  : "invocationId";
    setPending(`prompt-recipe-${kind}`);
    setError(null);
    setNotice(null);
    try {
      const result = await getJson<{ recipe: PromptRecipe }>(
        `/api/articles/${article.id}/prompt-recipe?${queryKey}=${encodeURIComponent(targetId)}`
      );
      setPromptRecipe(result.recipe);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "读取提示词配方失败");
    } finally {
      setPending(null);
    }
  }

  function updateIllustrationPlanItem(index: number, key: keyof IllustrationPlanItemView, value: string) {
    setIllustrationPlanItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  }

  function removeIllustrationPlanItem(index: number) {
    setIllustrationPlanItems((current) => (current.length <= 1 ? current : current.filter((_item, itemIndex) => itemIndex !== index)));
  }

  function closeFullscreen() {
    setFullscreenPane(null);
  }

  return (
    <div className="workflow-stack">
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <WorkspaceShell
        activeTab={activeTab}
        getTabMeta={getTabMeta}
        onSelectTab={switchWorkflowTab}
        workspaces={WORKFLOW_WORKSPACES}
      >
        <WorkflowGuidanceCard
          guidance={workflowGuidance}
          onJump={(tab) => {
            if (isWorkflowTabId(tab)) {
              switchWorkflowTab(tab);
            }
          }}
        />

        {qualityGateReworkItems.length > 0 ? (
          <details className="workflow-advanced-rework">
            <summary>全部返工建议（{qualityGateReworkItems.length}）</summary>
            <QualityGateReworkCard items={qualityGateReworkItems} onJumpToTab={switchWorkflowTab} />
          </details>
        ) : null}

        <div className="workflow-tab-panels">
        {activeTab === "topic" ? (
          <TopicPanel
            article={article}
            topicVersions={topicVersions}
            draft={topicDraft}
            editing={topicEditing}
            pending={pending}
            onEdit={startTopicEditing}
            onCancel={cancelTopicEditing}
            onChange={updateTopicDraft}
            onSave={saveTopic}
          />
        ) : null}

        {activeTab === "topic-diagnosis" ? (
          <TopicDiagnosisPanel
            latestTopicDiagnosis={latestTopicDiagnosis}
            topicDiagnoses={topicDiagnoses}
            staleWarning={staleTopicDiagnosisWarning}
            requirements={topicRequirements}
            selectedRequirementIds={selectedTopicRequirementIds}
            customInstruction={topicDiagnosisCustomInstruction}
            pending={pending}
            onSelectedRequirementIdsChange={setSelectedTopicRequirementIds}
            onCustomInstructionChange={setTopicDiagnosisCustomInstruction}
            onRunDiagnosis={() =>
              runAction("run-topic-diagnosis", async () => {
                await postJson<{ diagnosis: TopicDiagnosis }>(`/api/articles/${article.id}/run-topic-diagnosis`, {
                  customInstruction: topicDiagnosisCustomInstruction,
                  selectedRequirementIds: selectedTopicRequirementIds
                });
                setNotice("已完成选题诊断");
              })
            }
            onOpenPromptRecipe={(topicDiagnosisId) => void openPromptRecipe("topic-diagnosis", topicDiagnosisId)}
            onCreateRequirement={(input) => runAction("create-topic-requirement", () => createRequirement(input))}
            onUpdateRequirement={(id, input) => runAction("update-topic-requirement", () => updateRequirement(id, input))}
            onDeleteRequirement={(id) => runAction("delete-topic-requirement", () => deleteRequirement(id))}
          />
        ) : null}

        {activeTab === "angles" ? (
          <AnglesPanel selected={Boolean(selectedAngle)}>
          {topicDiagnosisWarning ? (
            <p className={topicDiagnosisBlocksDownstream ? "error" : "notice"}>{topicDiagnosisWarning}</p>
          ) : null}

          <StagePromptDialog
            title={STAGE_PROMPT_UI.angle.title}
            stage="angle"
            defaultPromptLabel={STAGE_PROMPT_UI.angle.defaultPromptLabel}
            defaultPrompt={angleDefaultPrompt}
            onDefaultPromptChange={setAngleDefaultPrompt}
            onSaveDefaultPrompt={() => runAction("save-angle-default-prompt", () => saveStagePrompt("angle", angleDefaultPrompt))}
            requirements={angleRequirements}
            selectedIds={selectedAngleRequirementIds}
            pending={pending !== null}
            onSelectedIdsChange={setSelectedAngleRequirementIds}
            onCreate={(input) => runAction("create-angle-requirement", () => createRequirement(input))}
            onUpdate={(id, input) => runAction("update-angle-requirement", () => updateRequirement(id, input))}
            onDelete={(id) => runAction("delete-angle-requirement", () => deleteRequirement(id))}
          />

          <label className="field prompt-field">
            <span className="label">对当前文章的要求</span>
            <textarea
              className="textarea prompt-textarea"
              placeholder={STAGE_PROMPT_UI.angle.customPlaceholder}
              value={angleCustomInstruction}
              onChange={(event) => setAngleCustomInstruction(event.target.value)}
            />
            <button
              className="button secondary prompt-save-button"
              disabled={pending !== null}
              onClick={() => runAction("save-angle-custom-requirement", () => saveCustomInstructionAsRequirement("angle", angleCustomInstruction))}
              type="button"
            >
              保存为可选提示词
            </button>
          </label>

          <div className="action-row">
            <button
              className="button"
              disabled={pending !== null || topicDiagnosisBlocksDownstream}
              onClick={() =>
                runAction("generate-angles", async () => {
                  await postJson(`/api/articles/${article.id}/generate-angles`, {
                    customInstruction: angleCustomInstruction,
                    selectedRequirementIds: selectedAngleRequirementIds
                  });
                })
              }
              type="button"
            >
              {pending === "generate-angles" ? "生成中" : "AI 生成角度"}
            </button>
          </div>

          <form className="inline-form" onSubmit={submitManualAngle}>
            <input className="input" name="angleTitle" placeholder="手动创建角度标题" required />
            <input className="input" name="readerPain" placeholder="读者痛点，可选" />
            <input className="input" name="promise" placeholder="文章承诺，可选" />
            <input className="input" name="risk" placeholder="风险提醒，可选" />
            <button className="button secondary" disabled={pending !== null || topicDiagnosisBlocksDownstream} type="submit">
              手动创建角度
            </button>
          </form>

          <div className="cards-grid">
            {angles.map((angle) => (
              <article className="mini-card" key={angle.id}>
                <div className="mini-card-head">
                  <h3>{angle.angleTitle}</h3>
                  <span className="source-pill">{angle.source === "ai" ? "AI" : "手动"}</span>
                </div>
                <p>{angle.readerPain || "未填写读者痛点"}</p>
                <p>{angle.promise || "未填写文章承诺"}</p>
                <p>{angle.risk || "未填写风险提醒"}</p>
                <button
                  className={angle.selected ? "button" : "button secondary"}
                  disabled={pending !== null || topicDiagnosisBlocksDownstream}
                  onClick={() =>
                    runAction(
                      "select-angle",
                      () =>
                        postJson(`/api/articles/${article.id}/select-angle`, {
                          angleId: angle.id
                        }),
                      "research"
                    )
                  }
                  type="button"
                >
                  {angle.selected ? "当前角度" : "选择角度"}
                </button>
              </article>
            ))}
          </div>
          </AnglesPanel>
        ) : null}

        {activeTab === "research" ? (
          <ResearchPanel count={researchVersions.length}>
            {topicDiagnosisBlocksDownstream && topicDiagnosisWarning ? <p className="error">{topicDiagnosisWarning}</p> : null}

            {selectedAngle ? (
              <>
                <section className="mini-card selected-angle-summary">
                  <div className="mini-card-head">
                    <h3>{selectedAngle.angleTitle}</h3>
                    <span className="source-pill">当前角度</span>
                  </div>
                  <p>{selectedAngle.readerPain || "未填写读者痛点"}</p>
                  <p>{selectedAngle.promise || "未填写文章承诺"}</p>
                  <p>{selectedAngle.risk || "未填写风险提醒"}</p>
                </section>

                <StagePromptDialog
                  title={STAGE_PROMPT_UI.research.title}
                  stage="research"
                  defaultPromptLabel={STAGE_PROMPT_UI.research.defaultPromptLabel}
                  defaultPrompt={researchDefaultPrompt}
                  onDefaultPromptChange={setResearchDefaultPrompt}
                  onSaveDefaultPrompt={() =>
                    runAction("save-research-default-prompt", () => saveStagePrompt("research", researchDefaultPrompt))
                  }
                  requirements={researchRequirements}
                  selectedIds={selectedResearchRequirementIds}
                  pending={pending !== null}
                  onSelectedIdsChange={setSelectedResearchRequirementIds}
                  onCreate={(input) => runAction("create-research-requirement", () => createRequirement(input))}
                  onUpdate={(id, input) => runAction("update-research-requirement", () => updateRequirement(id, input))}
                  onDelete={(id) => runAction("delete-research-requirement", () => deleteRequirement(id))}
                />

                <label className="field prompt-field">
                  <span className="label">对当前研究的补充要求</span>
                  <textarea
                    className="textarea prompt-textarea"
                    placeholder="例如：重点研究家庭现金流场景，不要写成政策资料罗列"
                    value={researchCustomInstruction}
                    onChange={(event) => setResearchCustomInstruction(event.target.value)}
                  />
                </label>

                <div className="action-row">
                  <button
                    className="button"
                    disabled={pending !== null || topicDiagnosisBlocksDownstream}
                    onClick={() =>
                      runAction("generate-content-research", async () => {
                        const research = await postJson<ResearchVersion>(`/api/articles/${article.id}/generate-content-research`, {
                          customInstruction: researchCustomInstruction,
                          selectedRequirementIds: selectedResearchRequirementIds
                        });
                        setSelectedResearchId(research.id);
                        setCompareLeftResearchId(research.id);
                        setCompareRightResearchId(latestResearch?.id || "");
                        setNotice(`已生成内容研究资料包 r${research.versionNo}`);
                      })
                    }
                    type="button"
                  >
                    {pending === "generate-content-research" ? "生成中" : "生成内容研究资料包"}
                  </button>
                </div>

                {researchVersions.length > 0 ? (
                  <div className="version-block">
                    <label className="field compact-field">
                      <span className="label">研究资料包版本</span>
                      <select
                        className="input"
                        disabled={pending !== null}
                        onChange={(event) => selectResearchVersion(event.target.value)}
                        value={selectedResearchId}
                      >
                        {researchVersions.map((research) => (
                          <option key={research.id} value={research.id}>
                            {getResearchOptionLabel(research)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {selectedResearch ? (
                  <section className="research-preview">
                    <div className="mini-card-head">
                      <h3>当前资料包 r{selectedResearch.versionNo}</h3>
                      <div className="mini-card-actions">
                        <span className="source-pill">{selectedResearch.createdBy === "ai" ? "AI" : "手动"}</span>
                        <button
                          className="button secondary compact-button"
                          disabled={pending !== null}
                          onClick={() => loadResearchIntoEditor(selectedResearch)}
                          type="button"
                        >
                          载入编辑器
                        </button>
                        {selectedResearch.sourceInvocationId ? (
                          <button
                            aria-label="查看研究资料包提示词配方"
                            className="icon-action"
                            disabled={pending !== null}
                            onClick={() => void openPromptRecipe("research", selectedResearch.id)}
                            title="查看提示词配方"
                            type="button"
                          >
                            <ScrollText aria-hidden="true" size={16} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <MarkdownPreview markdown={selectedResearch.researchMarkdown} />
                  </section>
                ) : (
                  <p className="subtle">还没有内容研究资料包。生成后，主线提纲可以引用它。</p>
                )}

                {selectedResearch ? (
                  <section className="manual-research-editor">
                    <h3>人工修正资料包</h3>
                    <label className="field prompt-field">
                      <span className="label">给主线提纲的材料摘要</span>
                      <textarea
                        className="textarea prompt-textarea"
                        placeholder="例如：这篇文章应从家庭现金流和路径边界展开。"
                        value={researchSummaryMarkdown}
                        onChange={(event) => setResearchSummaryMarkdown(event.target.value)}
                      />
                    </label>
                    <label className="field prompt-field">
                      <span className="label">研究资料包 Markdown</span>
                      <textarea
                        className="textarea markdown-textarea"
                        placeholder="先载入当前资料包，再进行人工修正。"
                        value={researchEditorMarkdown}
                        onChange={(event) => setResearchEditorMarkdown(event.target.value)}
                      />
                    </label>
                    <div className="action-row">
                      <button
                        className="button secondary"
                        disabled={pending !== null}
                        onClick={() => loadResearchIntoEditor(selectedResearch)}
                        type="button"
                      >
                        载入当前资料包
                      </button>
                      <button
                        className="button"
                        disabled={pending !== null || !researchEditorSourceId}
                        onClick={() =>
                          runAction("save-manual-research", async () => {
                            const research = await postJson<ResearchVersion>(`/api/articles/${article.id}/research-versions`, {
                              sourceResearchVersionId: researchEditorSourceId,
                              summaryMarkdown: researchSummaryMarkdown,
                              researchMarkdown: researchEditorMarkdown
                            });
                            setSelectedResearchId(research.id);
                            setCompareLeftResearchId(research.id);
                            setCompareRightResearchId(researchEditorSourceId);
                            setResearchEditorSourceId(research.id);
                            setResearchSummaryMarkdown(research.summaryMarkdown);
                            setResearchEditorMarkdown(research.researchMarkdown);
                            setNotice(`已另存为人工资料包 r${research.versionNo}`);
                          })
                        }
                        type="button"
                      >
                        另存人工版本
                      </button>
                    </div>
                    {!researchEditorSourceId ? <p className="subtle">先载入一个资料包，再另存人工版本。</p> : null}
                  </section>
                ) : null}

                <ResearchComparisonPanel
                  researchVersions={researchVersions}
                  leftId={compareLeftResearchId}
                  rightId={compareRightResearchId}
                  onLeftChange={setCompareLeftResearchId}
                  onRightChange={setCompareRightResearchId}
                />
              </>
            ) : (
              <p className="subtle">请先选择角度，再生成内容研究资料包。</p>
            )}
          </ResearchPanel>
        ) : null}

        {activeTab === "outline" ? (
          <OutlinePanel
            headActions={
              outlines.length > 0 ? (
              <>
                <label className="version-switcher">
                  <span className="sr-only">切换提纲版本</span>
                  <select
                    aria-label="切换提纲版本"
                    disabled={pending !== null}
                    onChange={(event) => selectOutlineVersion(event.target.value)}
                    value={selectedOutlineId}
                  >
                    {outlines.map((outline) => (
                      <option key={outline.id} value={outline.id}>
                        {getOutlineOptionLabel(outline)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  aria-label="查看提纲提示词配方"
                  className="icon-action"
                  disabled={!selectedOutlineId || pending !== null}
                  onClick={() => void openPromptRecipe("outline", selectedOutlineId)}
                  title="查看提示词配方"
                  type="button"
                >
                  <ScrollText aria-hidden="true" size={16} />
                </button>
              </>
            ) : acceptedOutline ? (
              <span className="status">已确认</span>
            ) : null
            }
          >
          {topicDiagnosisBlocksDownstream && topicDiagnosisWarning ? <p className="error">{topicDiagnosisWarning}</p> : null}

          {researchVersions.length > 0 ? (
            <label className="field compact-field">
              <span className="label">引用内容研究资料包</span>
              <select
                className="input"
                disabled={pending !== null}
                onChange={(event) => setSelectedResearchId(event.target.value)}
                value={selectedResearchId}
              >
                <option value="">不引用资料包</option>
                {researchVersions.map((research) => (
                  <option key={research.id} value={research.id}>
                    {getResearchOptionLabel(research)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="subtle">没有内容研究资料包时，仍可按旧流程生成主线提纲。</p>
          )}

          <StagePromptDialog
            title="主线提纲提示词设置"
            stage="outline"
            defaultPromptLabel="主线提纲默认提示词"
            defaultPrompt={outlineDefaultPrompt}
            onDefaultPromptChange={setOutlineDefaultPrompt}
            onSaveDefaultPrompt={() => runAction("save-outline-default-prompt", () => saveStagePrompt("outline", outlineDefaultPrompt))}
            requirements={outlineRequirements}
            selectedIds={selectedOutlineRequirementIds}
            pending={pending !== null}
            onSelectedIdsChange={setSelectedOutlineRequirementIds}
            onCreate={(input) => runAction("create-outline-requirement", () => createRequirement(input))}
            onUpdate={(id, input) => runAction("update-outline-requirement", () => updateRequirement(id, input))}
            onDelete={(id) => runAction("delete-outline-requirement", () => deleteRequirement(id))}
          />

          <label className="field prompt-field">
            <span className="label">对当前文章的要求</span>
            <textarea
              className="textarea prompt-textarea"
              placeholder="例如：不要强调到账速度，强调家庭现金流安排"
              value={outlineCustomInstruction}
              onChange={(event) => setOutlineCustomInstruction(event.target.value)}
            />
            <button
              className="button secondary prompt-save-button"
              disabled={pending !== null}
              onClick={() => runAction("save-outline-custom-requirement", () => saveCustomInstructionAsRequirement("outline", outlineCustomInstruction))}
              type="button"
            >
              保存为可选提示词
            </button>
          </label>

          <div className="action-row">
            <button
              className="button"
              disabled={!article.selectedAngleId || pending !== null || topicDiagnosisBlocksDownstream}
              onClick={() =>
                runAction("generate-outline", async () => {
                  const outline = await postJson<OutlineVersion>(`/api/articles/${article.id}/generate-outline`, {
                    customInstruction: outlineCustomInstruction,
                    selectedRequirementIds: selectedOutlineRequirementIds,
                    researchVersionId: selectedResearchId || undefined
                  });
                  setSelectedOutlineId(outline.id);
                  setMainline(outline.mainline);
                  setOutlineMarkdown(outline.outlineMarkdown);
                })
              }
              type="button"
            >
              {pending === "generate-outline" ? "生成中" : "生成主线和提纲"}
            </button>
          </div>

          {selectedOutline ? (
            <div className="editor-grid">
              {selectedOutline.sourceResearchVersionId ? (
                <p className="subtle">
                  引用资料包：
                  {researchById.get(selectedOutline.sourceResearchVersionId)
                    ? `r${researchById.get(selectedOutline.sourceResearchVersionId)?.versionNo}`
                    : selectedOutline.sourceResearchVersionId}
                </p>
              ) : null}
              <label className="field">
                <span className="label">主线判断</span>
                <textarea className="textarea" value={mainline} onChange={(event) => setMainline(event.target.value)} />
              </label>
              <label className="field">
                <span className="label">Markdown 提纲</span>
                <textarea
                  className="textarea tall"
                  value={outlineMarkdown}
                  onChange={(event) => setOutlineMarkdown(event.target.value)}
                />
              </label>
              <div className="action-row">
                <button
                  className="button"
                  disabled={!selectedOutlineId || pending !== null}
                  onClick={() =>
                    runAction("update-outline", async () => {
                      const saved = await patchJson<OutlineVersion>(`/api/articles/${article.id}/outlines`, {
                        outlineVersionId: selectedOutlineId,
                        mainline,
                        outlineMarkdown
                      });
                      setSelectedOutlineId(saved.id);
                      setNotice(`已保存到提纲 v${saved.versionNo}`);
                    })
                  }
                  type="button"
                >
                  保存当前版本
                </button>
                <button
                  className="button secondary"
                  disabled={pending !== null}
                  onClick={() =>
                    runAction("save-outline", async () => {
                      const saved = await postJson<OutlineVersion>(`/api/articles/${article.id}/outlines`, {
                        mainline,
                        outlineMarkdown
                      });
                      setSelectedOutlineId(saved.id);
                      setNotice(`已另存为提纲 v${saved.versionNo}`);
                    })
                  }
                  type="button"
                >
                  另存为新版本
                </button>
                <button
                  className="button"
                  disabled={!selectedOutlineId || pending !== null}
                  onClick={() =>
                    runAction(
                      "accept-outline",
                      () =>
                        postJson(`/api/articles/${article.id}/accept-outline`, {
                          outlineId: selectedOutlineId
                        }),
                      "draft"
                    )
                  }
                  type="button"
                >
                  确认提纲
                </button>
              </div>
            </div>
          ) : (
            <p className="subtle">选择角度后生成主线和提纲。</p>
          )}
          </OutlinePanel>
        ) : null}

        {activeTab === "draft" ? (
          <DraftPanel
            headActions={
              latestDraft ? (
              <>
                <label className="version-switcher">
                  <span className="sr-only">切换文案版本</span>
                  <select
                    aria-label="切换文案版本"
                    disabled={pending !== null}
                    onChange={(event) => selectDraftVersion(event.target.value)}
                    value={selectedDraftId}
                  >
                    {drafts.map((draft) => (
                      <option key={draft.id} value={draft.id}>
                        v{draft.versionNo}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  aria-label="查看文案提示词配方"
                  className="icon-action"
                  disabled={!selectedDraftId || pending !== null}
                  onClick={() => void openPromptRecipe("draft", selectedDraftId)}
                  title="查看提示词配方"
                  type="button"
                >
                  <ScrollText aria-hidden="true" size={16} />
                </button>
              </>
            ) : null
            }
          >
          {topicDiagnosisBlocksDownstream && topicDiagnosisWarning ? <p className="error">{topicDiagnosisWarning}</p> : null}

          <StagePromptDialog
            title="Markdown 文案提示词设置"
            stage="draft"
            defaultPromptLabel="Markdown 文案默认提示词"
            defaultPrompt={draftDefaultPrompt}
            onDefaultPromptChange={setDraftDefaultPrompt}
            onSaveDefaultPrompt={() => runAction("save-draft-default-prompt", () => saveStagePrompt("draft", draftDefaultPrompt))}
            requirements={draftRequirements}
            selectedIds={selectedDraftRequirementIds}
            pending={pending !== null}
            onSelectedIdsChange={setSelectedDraftRequirementIds}
            onCreate={(input) => runAction("create-draft-requirement", () => createRequirement(input))}
            onUpdate={(id, input) => runAction("update-draft-requirement", () => updateRequirement(id, input))}
            onDelete={(id) => runAction("delete-draft-requirement", () => deleteRequirement(id))}
          />

          <label className="field prompt-field">
            <span className="label">对当前文章的要求</span>
            <textarea
              className="textarea prompt-textarea"
              placeholder="例如：开头不要用热点追问，先从家庭生活场景进入"
              value={draftCustomInstruction}
              onChange={(event) => setDraftCustomInstruction(event.target.value)}
            />
            <button
              className="button secondary prompt-save-button"
              disabled={pending !== null}
              onClick={() => runAction("save-draft-custom-requirement", () => saveCustomInstructionAsRequirement("draft", draftCustomInstruction))}
              type="button"
            >
              保存为可选提示词
            </button>
          </label>

          <div className="action-row">
            <button
              className="button"
              disabled={!acceptedOutline || pending !== null || topicDiagnosisBlocksDownstream}
              onClick={() =>
                runAction("generate-draft", async () => {
                  const draft = await postJson<DraftVersion>(`/api/articles/${article.id}/generate-draft`, {
                    customInstruction: draftCustomInstruction,
                    selectedRequirementIds: selectedDraftRequirementIds
                  });
                  setDraftMarkdown(draft.markdown);
                  setSelectedDraftId(draft.id);
                })
              }
              type="button"
            >
              {pending === "generate-draft" ? "生成中" : "生成 Markdown 文案"}
            </button>
          </div>

          {latestDraft ? (
            <section className="ai-style-check-section">
              <div className="ai-style-check-head">
                <div>
                  <h3>文案清洁检查</h3>
                  <p className="subtle">
                    检查当前加载的已保存版本{selectedDraft ? `：v${selectedDraft.versionNo}` : ""}。
                  </p>
                </div>
                <StagePromptDialog
                  title={STAGE_PROMPT_UI.ai_style_check.title}
                  stage="ai_style_check"
                  defaultPromptLabel={STAGE_PROMPT_UI.ai_style_check.defaultPromptLabel}
                  defaultPrompt={aiStyleCheckDefaultPrompt}
                  onDefaultPromptChange={setAIStyleCheckDefaultPrompt}
                  onSaveDefaultPrompt={() =>
                    runAction("save-ai-style-check-default-prompt", () => saveStagePrompt("ai_style_check", aiStyleCheckDefaultPrompt))
                  }
                  requirements={aiStyleCheckRequirements}
                  selectedIds={selectedAIStyleCheckRequirementIds}
                  pending={pending !== null}
                  onSelectedIdsChange={setSelectedAIStyleCheckRequirementIds}
                  onCreate={(input) => runAction("create-ai-style-check-requirement", () => createRequirement(input))}
                  onUpdate={(id, input) => runAction("update-ai-style-check-requirement", () => updateRequirement(id, input))}
                  onDelete={(id) => runAction("delete-ai-style-check-requirement", () => deleteRequirement(id))}
                />
              </div>

              <label className="field prompt-field">
                <span className="label">对当前检查的要求</span>
                <textarea
                  className="textarea prompt-textarea"
                  placeholder={STAGE_PROMPT_UI.ai_style_check.customPlaceholder}
                  value={aiStyleCheckCustomInstruction}
                  onChange={(event) => setAIStyleCheckCustomInstruction(event.target.value)}
                />
                <button
                  className="button secondary prompt-save-button"
                  disabled={pending !== null}
                  onClick={() =>
                    runAction(
                      "save-ai-style-check-custom-requirement",
                      () => saveCustomInstructionAsRequirement("ai_style_check", aiStyleCheckCustomInstruction)
                    )
                  }
                  type="button"
                >
                  保存为可选提示词
                </button>
              </label>

              <div className="action-row ai-style-check-actions">
                <button
                  className="button"
                  disabled={!selectedDraftId || pending !== null || selectedDraftHasUnsavedChanges}
                  onClick={() =>
                    runAction("run-ai-style-check", async () => {
                      const check = await postJson<AIStyleCheck>(`/api/articles/${article.id}/run-ai-style-check`, {
                        draftVersionId: selectedDraftId,
                        customInstruction: aiStyleCheckCustomInstruction,
                        selectedRequirementIds: selectedAIStyleCheckRequirementIds
                      });
                      setAIStyleCheckList((current) => [check, ...current.filter((item) => item.id !== check.id)]);
                      setNotice("已保存文案清洁检查");
                    })
                  }
                  type="button"
                >
                  {pending === "run-ai-style-check" ? "检查中" : "运行文案清洁检查"}
                </button>
                {selectedDraftHasUnsavedChanges ? <p className="subtle">编辑器有未保存修改。请先保存当前版本或另存为新版本后再检查。</p> : null}
              </div>

              {latestSelectedDraftAIStyleCheck ? (
                <div className="ai-style-check-results">
                  <AIStyleCheckResultCard
                    check={latestSelectedDraftAIStyleCheck}
                    draftLabel={getDraftLabel(latestSelectedDraftAIStyleCheck.draftVersionId)}
                    actionDisabled={pending !== null}
                    onCreateCleanDraft={createCleanDraftFromCheck}
                    onOpenRecipe={(check) => void openPromptRecipe("ai-style-check", check.id)}
                  />
                  {selectedDraftAIStyleChecks.length > 1 ? (
                    <details className="ai-style-check-history">
                      <summary>
                        <span>历史检查记录</span>
                        <span>{selectedDraftAIStyleChecks.length - 1} 条</span>
                      </summary>
                      <div className="ai-style-check-history-list">
                        {selectedDraftAIStyleChecks.slice(1).map((check) => (
                          <AIStyleCheckResultCard
                            compact
                            check={check}
                            draftLabel={getDraftLabel(check.draftVersionId)}
                            key={check.id}
                            actionDisabled={pending !== null}
                            onCreateCleanDraft={createCleanDraftFromCheck}
                            onOpenRecipe={(historyCheck) => void openPromptRecipe("ai-style-check", historyCheck.id)}
                          />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : (
                <p className="subtle">当前文案版本还没有文案清洁检查记录。</p>
              )}
            </section>
          ) : (
            <p className="subtle">生成文案后可以运行文案清洁检查。</p>
          )}

          {latestDraft ? (
            <div className="draft-grid">
              <div className="field">
                <div className="pane-label-row">
                  <span className="label">Markdown 编辑</span>
                  <button
                    aria-label="全屏编辑 Markdown"
                    className="icon-action"
                    onClick={() => setFullscreenPane("editor")}
                    title="全屏编辑 Markdown"
                    type="button"
                  >
                    <Maximize2 size={16} aria-hidden />
                  </button>
                </div>
                <textarea
                  aria-label="Markdown 编辑"
                  className="textarea draft-editor"
                  ref={draftEditorRef}
                  value={draftMarkdown}
                  onChange={(event) => setDraftMarkdown(event.target.value)}
                />
              </div>
              <div>
                <div className="pane-label-row">
                  <span className="label">基础预览</span>
                  <button
                    aria-label="全屏查看基础预览"
                    className="icon-action"
                    onClick={() => setFullscreenPane("preview")}
                    title="全屏查看基础预览"
                    type="button"
                  >
                    <Maximize2 size={16} aria-hidden />
                  </button>
                </div>
                <MarkdownPreview markdown={draftMarkdown} />
              </div>
              <div className="action-row">
                <button
                  className="button"
                  disabled={!selectedDraftId || pending !== null}
                  onClick={() =>
                    runAction("update-draft", async () => {
                      const saved = await fetch(`/api/articles/${article.id}/drafts`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          draftVersionId: selectedDraftId,
                          markdown: draftMarkdown
                        })
                      });
                      const result = (await saved.json()) as DraftVersion & { error?: string };
                      if (!saved.ok) {
                        throw new Error(result.error || "保存当前版本失败");
                      }
                      setNotice(`已保存到文案 v${result.versionNo}`);
                    })
                  }
                  type="button"
                >
                  保存当前版本
                </button>
                <button
                  className="button secondary"
                  disabled={pending !== null}
                  onClick={() =>
                    runAction("save-draft", async () => {
                      const saved = await postJson<DraftVersion>(`/api/articles/${article.id}/drafts`, {
                        markdown: draftMarkdown
                      });
                      setSelectedDraftId(saved.id);
                      setNotice(`已另存为文案 v${saved.versionNo}`);
                    })
                  }
                  type="button"
                >
                  另存为新版本
                </button>
              </div>
            </div>
          ) : (
            <p className="subtle">确认提纲后生成 Markdown 初稿。</p>
          )}
          </DraftPanel>
        ) : null}

      {fullscreenPane ? (
        <div
          aria-label={fullscreenPane === "editor" ? "Markdown 全屏编辑" : "基础预览全屏"}
          aria-modal="true"
          className="fullscreen-overlay"
          role="dialog"
        >
          <div className="fullscreen-shell">
            <div className="fullscreen-head">
              <div>
                <p className="eyebrow">{fullscreenPane === "editor" ? "Editor" : "Preview"}</p>
                <h2>{fullscreenPane === "editor" ? "Markdown 编辑" : "基础预览"}</h2>
              </div>
              <button aria-label="关闭全屏" className="icon-action" onClick={closeFullscreen} title="关闭全屏" type="button">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="fullscreen-body">
              {fullscreenPane === "editor" ? (
                <textarea
                  aria-label="Markdown 全屏编辑"
                  className="textarea draft-editor fullscreen-editor"
                  ref={fullscreenEditorRef}
                  value={draftMarkdown}
                  onChange={(event) => setDraftMarkdown(event.target.value)}
                />
              ) : (
                <div className="fullscreen-preview">
                  <MarkdownPreview markdown={draftMarkdown} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {promptRecipe ? <PromptRecipeDialog recipe={promptRecipe} onClose={() => setPromptRecipe(null)} /> : null}

      {selectedAIStyleCheckDetail ? (
        <div
          aria-label="文案清洁检查详情"
          aria-modal="true"
          className="fullscreen-overlay"
          onClick={() => setSelectedAIStyleCheckDetailId("")}
          role="dialog"
        >
          <section className="fullscreen-shell ai-style-check-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="fullscreen-head">
              <div>
                <p className="eyebrow">AI Style Check</p>
                <h2>文案清洁检查详情</h2>
              </div>
              <button
                aria-label="关闭文案清洁检查详情"
                className="icon-action"
                onClick={() => setSelectedAIStyleCheckDetailId("")}
                title="关闭"
                type="button"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="fullscreen-body ai-style-check-detail-body">
              <AIStyleCheckResultCard
                check={selectedAIStyleCheckDetail}
                draftLabel={getDraftLabel(selectedAIStyleCheckDetail.draftVersionId)}
                actionDisabled={pending !== null}
                onCreateCleanDraft={isDraftVersionAIStyleCheck(selectedAIStyleCheckDetail) ? createCleanDraftFromCheck : undefined}
                onOpenRecipe={(check) => void openPromptRecipe("ai-style-check", check.id)}
              />
            </div>
          </section>
        </div>
      ) : null}

        {activeTab === "final" ? (
          <FinalPanel finalVersionNo={finalDraft?.versionNo ?? null}>
          {finalDraft ? (
            <div className="action-row">
              <button
                className="button"
                disabled={article.status !== "human_review" || pending !== null}
                onClick={() =>
                  runAction(
                    "ready",
                    async () => {
                      await postJson(`/api/articles/${article.id}/mark-ready-to-publish`);
                      setNotice("已进入发布队列");
                    },
                    "publish"
                  )
                }
                type="button"
              >
                {article.status === "ready_to_publish" ? "已进入发布队列" : "标记待发布"}
              </button>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <div className="cards-grid">
              {drafts.map((draft) => (
                <article className="mini-card" key={draft.id}>
                  <div className="mini-card-head">
                    <h3>v{draft.versionNo}</h3>
                    {draft.isFinal ? <span className="source-pill">最终稿</span> : <span className="source-pill">{draft.createdBy}</span>}
                  </div>
                  <p>{getDraftTypeLabel(draft)}</p>
                  {draft.sourceDiagnosisId ? <p>来源旧诊断修改稿</p> : <p>无诊断来源</p>}
                  {draft.sourceAIStyleCheckId ? <p>来源清洁检查：已关联</p> : null}
                  {(() => {
                    const latestCheck = getLatestAIStyleCheckForDraft(draft.id);
                    return (
                      <div
                        className={
                          latestCheck
                            ? isHighRiskAIStyleCheck(latestCheck)
                              ? "ai-style-check-status high-risk"
                              : "ai-style-check-status checked"
                            : "ai-style-check-status missing"
                        }
                      >
                        <p>
                          <span>文案清洁检查</span>
                          <strong>{getAIStyleCheckStatusCopy(latestCheck)}</strong>
                        </p>
                        {latestCheck ? (
                          <>
                            <p>
                              {formatTime(latestCheck.createdAt)} · {latestCheck.issueCount} 个问题
                            </p>
                            <div className="action-row compact">
                              <button className="button secondary compact-button" onClick={() => setSelectedAIStyleCheckDetailId(latestCheck.id)} type="button">
                                查看检查详情
                              </button>
                              <button
                                aria-label="查看文案清洁检查提示词配方"
                                className="button secondary compact-button"
                                disabled={pending !== null}
                                onClick={() => void openPromptRecipe("ai-style-check", latestCheck.id)}
                                type="button"
                              >
                                提示词配方
                              </button>
                            </div>
                          </>
                        ) : (
                          <p>未检查时仍可人工标记最终稿。</p>
                        )}
                      </div>
                    );
                  })()}
                  <p>{formatTime(draft.createdAt)}</p>
                  <div className="action-row compact">
                    <button className="button secondary" onClick={() => loadDraftIntoEditor(draft)} type="button">
                      载入编辑器
                    </button>
                    {draft.sourceInvocationId ? (
                      <button
                        className="button secondary"
                        disabled={pending !== null}
                        onClick={() => void openPromptRecipe("invocation", draft.sourceInvocationId)}
                        type="button"
                      >
                        提示词配方
                      </button>
                    ) : null}
                    <button
                      className="button"
                      disabled={!canMarkFinal || pending !== null}
                      onClick={() =>
                        runAction(
                          "final",
                          () => markDraftAsFinal(draft),
                          "final"
                        )
                      }
                      type="button"
                    >
                      标记最终稿
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="subtle">暂无文案版本。</p>
          )}
          </FinalPanel>
        ) : null}

        {activeTab === "illustration" ? (
          <IllustrationPanel
            status={latestIllustrationPlan ? getIllustrationPlanStatusLabel(latestIllustrationPlan.status) : "待规划"}
          >
            <StagePromptDialog
              title={STAGE_PROMPT_UI.illustration_plan.title}
              stage="illustration_plan"
              defaultPromptLabel={STAGE_PROMPT_UI.illustration_plan.defaultPromptLabel}
              defaultPrompt={illustrationPlanDefaultPrompt}
              onDefaultPromptChange={setIllustrationPlanDefaultPrompt}
              onSaveDefaultPrompt={() =>
                runAction("save-illustration-plan-default-prompt", () =>
                  saveStagePrompt("illustration_plan", illustrationPlanDefaultPrompt)
                )
              }
              requirements={illustrationPlanRequirements}
              selectedIds={selectedIllustrationPlanRequirementIds}
              pending={pending !== null}
              onSelectedIdsChange={setSelectedIllustrationPlanRequirementIds}
              onCreate={(input) => runAction("create-illustration-plan-requirement", () => createRequirement(input))}
              onUpdate={(id, input) => runAction("update-illustration-plan-requirement", () => updateRequirement(id, input))}
              onDelete={(id) => runAction("delete-illustration-plan-requirement", () => deleteRequirement(id))}
            />

            <label className="field prompt-field">
              <span className="label">对当前配图规划的要求</span>
              <textarea
                className="textarea prompt-textarea"
                placeholder={STAGE_PROMPT_UI.illustration_plan.customPlaceholder}
                value={illustrationPlanCustomInstruction}
                onChange={(event) => setIllustrationPlanCustomInstruction(event.target.value)}
              />
              <button
                className="button secondary prompt-save-button"
                disabled={pending !== null}
                onClick={() =>
                  runAction(
                    "save-illustration-plan-custom-requirement",
                    () => saveCustomInstructionAsRequirement("illustration_plan", illustrationPlanCustomInstruction)
                  )
                }
                type="button"
              >
                保存为可选提示词
              </button>
            </label>

            <div className="action-row">
              <button
                className="button"
                disabled={!finalDraft || pending !== null}
                onClick={() =>
                  runAction("generate-illustration-plan", async () => {
                    const plan = await postJson<IllustrationPlan>(`/api/articles/${article.id}/generate-illustration-plan`, {
                      customInstruction: illustrationPlanCustomInstruction,
                      selectedRequirementIds: selectedIllustrationPlanRequirementIds
                    });
                    setSelectedIllustrationPlanId(plan.id);
                    setIllustrationSummaryMarkdown(plan.summaryMarkdown);
                    setIllustrationPlanItems(parseIllustrationPlanItems(plan.planJson));
                    setNotice("已生成配图规划");
                  })
                }
                type="button"
              >
                {pending === "generate-illustration-plan" ? "规划中" : "生成配图规划"}
              </button>
              {!finalDraft ? <p className="subtle">请先在“人工检查/最终稿”中标记最终稿，再生成正文配图规划。</p> : null}
            </div>

            {illustrationPlans.length > 0 ? (
              <div className="version-block">
                <label className="field compact-field">
                  <span className="label">配图规划版本</span>
                  <select
                    className="input"
                    disabled={pending !== null}
                    onChange={(event) => setSelectedIllustrationPlanId(event.target.value)}
                    value={selectedIllustrationPlanId}
                  >
                    {illustrationPlans.map((plan, index) => (
                      <option key={plan.id} value={plan.id}>
                        p{illustrationPlans.length - index} · {getIllustrationPlanStatusLabel(plan.status)} · {formatTime(plan.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedIllustrationPlan?.sourceInvocationId ? (
                  <button
                    aria-label="查看配图规划提示词配方"
                    className="icon-action"
                    disabled={pending !== null}
                    onClick={() => void openPromptRecipe("illustration-plan", selectedIllustrationPlan.id)}
                    title="查看提示词配方"
                    type="button"
                  >
                    <ScrollText aria-hidden="true" size={16} />
                  </button>
                ) : null}
              </div>
            ) : null}

            {selectedIllustrationPlan ? (
              <div className="illustration-plan-editor">
                <div className="illustration-plan-status-row">
                  <span className="source-pill">{getIllustrationPlanStatusLabel(selectedIllustrationPlan.status)}</span>
                  <span className="subtle">来源最终稿：{getDraftLabel(selectedIllustrationPlan.finalDraftVersionId)}</span>
                  {selectedIllustrationPlanFinalDraftChanged ? (
                    <span className="source-pill warning">需要重新检查插入位置</span>
                  ) : null}
                </div>

                <label className="field">
                  <span className="label">规划摘要</span>
                  <textarea
                    className="textarea prompt-textarea"
                    disabled={!selectedIllustrationPlanEditable}
                    value={illustrationSummaryMarkdown}
                    onChange={(event) => setIllustrationSummaryMarkdown(event.target.value)}
                  />
                </label>

                <div className="illustration-plan-items">
                  {illustrationPlanItems.map((item, index) => {
                    const itemAssets = selectedIllustrationPlan
                      ? inlineIllustrationAssetsByItem.get(inlineIllustrationAssetKey(selectedIllustrationPlan.id, item.itemId)) || []
                      : [];
                    const positionCheck = illustrationPositionChecks.get(item.itemId) || toIllustrationPositionCheck(item, finalDraft);
                    return (
                    <article className="mini-card illustration-plan-item" key={item.itemId}>
                      <div className="mini-card-head">
                        <h3>配图 {index + 1}</h3>
                        <button
                          aria-label={`删除配图 ${index + 1}`}
                          className="icon-action"
                          disabled={!selectedIllustrationPlanEditable || pending !== null || illustrationPlanItems.length <= 1}
                          onClick={() => removeIllustrationPlanItem(index)}
                          title="删除配图项"
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </div>
                      <div className="illustration-plan-grid">
                        <label className="field">
                          <span className="label">插入位置</span>
                          <input
                            className="input"
                            disabled={!selectedIllustrationPlanEditable}
                            value={item.position}
                            onChange={(event) => updateIllustrationPlanItem(index, "position", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="label">图片类型</span>
                          <input
                            className="input"
                            disabled={!selectedIllustrationPlanEditable}
                            value={item.imageType}
                            onChange={(event) => updateIllustrationPlanItem(index, "imageType", event.target.value)}
                          />
                        </label>
                      </div>
                      <IllustrationPositionStatus check={positionCheck} />
                      <IllustrationPositionSelector
                        disabled={!selectedIllustrationPlanEditable || pending !== null || !finalDraft}
                        options={illustrationPositionOptions}
                        onSelect={(position) => updateIllustrationPlanItem(index, "position", position)}
                      />
                      <label className="field">
                        <span className="label">图片作用</span>
                        <textarea
                          className="textarea prompt-textarea"
                          disabled={!selectedIllustrationPlanEditable}
                          value={item.purpose}
                          onChange={(event) => updateIllustrationPlanItem(index, "purpose", event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span className="label">画面说明</span>
                        <textarea
                          className="textarea prompt-textarea"
                          disabled={!selectedIllustrationPlanEditable}
                          value={item.visualBrief}
                          onChange={(event) => updateIllustrationPlanItem(index, "visualBrief", event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span className="label">Prompt 简报</span>
                        <textarea
                          className="textarea prompt-textarea"
                          disabled={!selectedIllustrationPlanEditable}
                          value={item.promptBrief}
                          onChange={(event) => updateIllustrationPlanItem(index, "promptBrief", event.target.value)}
                        />
                      </label>
                      <div className="illustration-plan-grid">
                        <label className="field">
                          <span className="label">不要画什么</span>
                          <textarea
                            className="textarea prompt-textarea"
                            disabled={!selectedIllustrationPlanEditable}
                            value={item.doNotVisualize}
                            onChange={(event) => updateIllustrationPlanItem(index, "doNotVisualize", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="label">风险提醒</span>
                          <textarea
                            className="textarea prompt-textarea"
                            disabled={!selectedIllustrationPlanEditable}
                            value={item.riskNotes}
                            onChange={(event) => updateIllustrationPlanItem(index, "riskNotes", event.target.value)}
                          />
                        </label>
                      </div>
                      <InlineIllustrationAssetPanel
                        articleId={article.id}
                        plan={selectedIllustrationPlan}
                        item={item}
                        itemIndex={index}
                        assets={itemAssets}
                        pending={pending}
                        onGenerate={() =>
                          runAction(inlineIllustrationPendingKey(item.itemId), async () => {
                            await postJson<ArticleAsset>(`/api/articles/${article.id}/generate-inline-illustration`, {
                              planId: selectedIllustrationPlan.id,
                              planItemId: item.itemId
                            });
                            setNotice(`已生成配图 ${index + 1}`);
                          })
                        }
                      />
                    </article>
                    );
                  })}
                </div>

                <div className="action-row">
                  <button
                    className="button secondary"
                    disabled={!selectedIllustrationPlanEditable || pending !== null}
                    onClick={() =>
                      runAction("update-illustration-plan", async () => {
                        const saved = await patchJson<IllustrationPlan>(`/api/articles/${article.id}/illustration-plans`, {
                          planId: selectedIllustrationPlan.id,
                          summaryMarkdown: illustrationSummaryMarkdown,
                          items: illustrationPlanItems
                        });
                        setIllustrationSummaryMarkdown(saved.summaryMarkdown);
                        setNotice("已保存配图规划");
                      })
                    }
                    type="button"
                  >
                    保存当前规划
                  </button>
                  <button
                    className="button"
                    disabled={!selectedIllustrationPlanEditable || pending !== null}
                    onClick={() =>
                      runAction("confirm-illustration-plan", async () => {
                        if (blockedIllustrationPlanItems.length > 0) {
                          throw new Error(`还有 ${blockedIllustrationPlanItems.length} 张配图未匹配插入位置，请先选择或修正位置。`);
                        }
                        await postJson<IllustrationPlan>(`/api/articles/${article.id}/confirm-illustration-plan`, {
                          planId: selectedIllustrationPlan.id
                        });
                        setNotice("已确认配图规划");
                      })
                    }
                    type="button"
                  >
                    确认配图规划
                  </button>
                </div>

                {!selectedIllustrationPlanEditable ? <p className="subtle">已确认或已被替代的规划不可编辑。重新生成会创建新的规划草稿。</p> : null}
              </div>
            ) : (
              <p className="subtle">还没有配图规划。生成后可以编辑、删除规划项并确认。</p>
            )}
          </IllustrationPanel>
        ) : null}

        {activeTab === "publish" ? (
          <PublishPanel uploaded={latestUpload?.status === "success"}>
          <StagePromptDialog
            title={STAGE_PROMPT_UI.pre_publish.title}
            stage="pre_publish"
            defaultPromptLabel={STAGE_PROMPT_UI.pre_publish.defaultPromptLabel}
            defaultPrompt={prePublishDefaultPrompt}
            onDefaultPromptChange={setPrePublishDefaultPrompt}
            onSaveDefaultPrompt={() => runAction("save-pre-publish-default-prompt", () => saveStagePrompt("pre_publish", prePublishDefaultPrompt))}
            requirements={prePublishRequirements}
            selectedIds={selectedPrePublishRequirementIds}
            pending={pending !== null}
            onSelectedIdsChange={setSelectedPrePublishRequirementIds}
            onCreate={(input) => runAction("create-pre-publish-requirement", () => createRequirement(input))}
            onUpdate={(id, input) => runAction("update-pre-publish-requirement", () => updateRequirement(id, input))}
            onDelete={(id) => runAction("delete-pre-publish-requirement", () => deleteRequirement(id))}
          />

          <label className="field prompt-field">
            <span className="label">对当前文章的要求</span>
            <textarea
              className="textarea prompt-textarea"
              placeholder={STAGE_PROMPT_UI.pre_publish.customPlaceholder}
              value={prePublishCustomInstruction}
              onChange={(event) => setPrePublishCustomInstruction(event.target.value)}
            />
            <button
              className="button secondary prompt-save-button"
              disabled={pending !== null}
              onClick={() =>
                runAction("save-pre-publish-custom-requirement", () =>
                  saveCustomInstructionAsRequirement("pre_publish", prePublishCustomInstruction)
                )
              }
              type="button"
            >
              保存为可选提示词
            </button>
          </label>

          <div className="publish-actions">
            <button
              className="button secondary"
              disabled={!finalDraft || pending !== null}
              onClick={() =>
                runAction("pre-publish-check", async () => {
                  await postJson<PromptRunArtifact>(`/api/articles/${article.id}/pre-publish-check`, {
                    customInstruction: prePublishCustomInstruction,
                    selectedRequirementIds: selectedPrePublishRequirementIds
                  });
                  setNotice("已生成发布前检查摘要");
                })
              }
              type="button"
            >
              {pending === "pre-publish-check" ? "检查中" : "生成发布前检查摘要"}
            </button>

            <button
              className="button"
              disabled={!finalDraft || pending !== null}
              onClick={() =>
                runAction("render-html", async () => {
                  const asset = await postJson<ArticleAsset>(`/api/articles/${article.id}/render-html`);
                  setNotice(`已生成公众号 HTML：${asset.variant}`);
                })
              }
              type="button"
            >
              {pending === "render-html" ? "生成中" : "生成公众号 HTML"}
            </button>

            <button
              className="button secondary"
              disabled={!finalDraft || htmlAssets.length === 0 || pending !== null}
              onClick={() =>
                runAction("publish-html-ai-style-check", async () => {
                  const check = await postJson<AIStyleCheck>(`/api/articles/${article.id}/run-publish-html-ai-style-check`, {
                    htmlAssetId: htmlAssets[0]?.id,
                    customInstruction: prePublishCustomInstruction
                  });
                  setAIStyleCheckList((current) => [check, ...current.filter((item) => item.id !== check.id)]);
                  setNotice("已完成发布 HTML 文案清洁检查");
                })
              }
              type="button"
            >
              {pending === "publish-html-ai-style-check" ? "检查中" : "检查发布 HTML 文案"}
            </button>

            <label className="file-field">
              <span className="label">封面素材，可选</span>
              <input accept="image/*" aria-label="封面素材，可选" onChange={handleCoverFile} type="file" />
            </label>

            <button
              className="button secondary"
              disabled={!finalDraft || pending !== null}
              onClick={() =>
                runAction("generate-cover", async () => {
                  const formData = new FormData();
                  if (coverFile) {
                    formData.append("coverSource", coverFile);
                  }
                  const generated = await postForm<ArticleAsset[]>(`/api/articles/${article.id}/generate-cover`, formData);
                  setNotice(`已生成封面 ${generated.length} 张`);
                })
              }
              type="button"
            >
              {pending === "generate-cover" ? "生成中" : coverFile ? "用素材生成封面" : "生成默认封面"}
            </button>

            <button
              className="button"
              disabled={!finalDraft || pending !== null}
              onClick={() =>
                runAction("upload-wechat", async () => {
                  try {
                    const upload = await postJson<WechatDraftUpload>(`/api/articles/${article.id}/upload-wechat-draft`);
                    setOptimisticUploads((current) => current.filter((item) => item.id !== upload.id));
                    setNotice(`已上传公众号草稿箱：${upload.wechatMediaId}`);
                  } catch (actionError) {
                    const failedUpload = failedUploadFromError(actionError);
                    if (failedUpload) {
                      setOptimisticUploads((current) => [failedUpload, ...current.filter((item) => item.id !== failedUpload.id)]);
                      router.refresh();
                    }
                    throw actionError;
                  }
                })
              }
              type="button"
            >
              {pending === "upload-wechat" ? "上传中" : "上传公众号草稿箱"}
            </button>
          </div>

          {latestHtmlAsset?.errorMessage ? (
            <div className="publish-warning" role="alert">
              <strong>正文配图需要人工处理</strong>
              <p>{latestHtmlAsset.errorMessage}</p>
            </div>
          ) : null}

          {latestHtmlAsset ? (
            <section className="html-preview-card" aria-label="公众号 HTML 预览">
              <div className="html-preview-head">
                <div>
                  <h3>公众号 HTML 预览</h3>
                  <p>{latestHtmlAsset.errorMessage ? "包含正文配图处理提示" : "可用于发布前检查"}</p>
                </div>
                <span className="source-pill">{latestHtmlAsset.variant || "html"}</span>
              </div>
              <iframe
                className="html-preview-frame"
                src={`/api/articles/${article.id}/assets/${latestHtmlAsset.id}/file`}
                title="公众号 HTML 预览"
              />
            </section>
          ) : null}

          {latestPrePublishArtifact ? (
            <section className="prompt-artifact">
              <div className="prompt-artifact-head">
                <div>
                  <h3>最新发布前检查</h3>
                  <p>{formatTime(latestPrePublishArtifact.createdAt)}</p>
                </div>
                {latestPrePublishArtifact.sourceInvocationId ? (
                  <button
                    aria-label="查看发布前检查提示词配方"
                    className="icon-action"
                    disabled={pending !== null}
                    onClick={() => void openPromptRecipe("invocation", latestPrePublishArtifact.sourceInvocationId)}
                    title="查看提示词配方"
                    type="button"
                  >
                    <ScrollText aria-hidden="true" size={16} />
                  </button>
                ) : null}
              </div>
              <MarkdownPreview markdown={latestPrePublishArtifact.summaryMarkdown} />
            </section>
          ) : null}

          {latestPublishHTMLAIStyleCheck ? (
            <section className="prompt-artifact">
              <div className="prompt-artifact-head">
                <div>
                  <h3>最新发布 HTML 文案清洁检查</h3>
                  <p>{formatTime(latestPublishHTMLAIStyleCheck.createdAt)}</p>
                </div>
              </div>
              <AIStyleCheckResultCard
                compact
                check={latestPublishHTMLAIStyleCheck}
                draftLabel="发布 HTML"
                actionDisabled={pending !== null}
                onOpenRecipe={(check) => void openPromptRecipe("ai-style-check", check.id)}
              />
            </section>
          ) : null}

          <div className="publish-grid">
            <div className="publish-checklist">
              <h3>发布检查</h3>
              <p className={finalDraft ? "check-item done" : "check-item"}>最终稿：{finalDraft ? `v${finalDraft.versionNo}` : "未标记"}</p>
              <p className={htmlAssets.length > 0 ? "check-item done" : "check-item"}>HTML：{htmlAssets.length} 个</p>
              <p className={readyInlineIllustrationAssets.length > 0 ? "check-item done" : "check-item"}>
                正文配图：{readyInlineIllustrationAssets.length > 0 ? `${readyInlineIllustrationAssets.length} 张已生成` : "未生成"}
              </p>
              {placeholderInlineIllustrationAssets.length > 0 ? (
                <p className="check-item warning">测试占位图：{placeholderInlineIllustrationAssets.length} 张，上传草稿箱前需替换或删除</p>
              ) : null}
              {readyInlineIllustrationAssets.length > 0 ? (
                <p className={uploadableInlineIllustrationAssets.length > 0 ? "check-item done" : "check-item warning"}>
                  可上传正文图：{uploadableInlineIllustrationAssets.length} 张
                </p>
              ) : null}
              {latestHtmlAsset?.errorMessage ? (
                <p className="check-item warning">
                  正文配图处理：
                  {placeholderInlineIllustrationAssets.length > 0 ? "测试占位图需替换或删除" : "需上传为微信正文图片 URL"}
                </p>
              ) : null}
              <p className={coverAssets.some((asset) => asset.variant === "wechat_21_9") ? "check-item done" : "check-item"}>
                21:9 封面：{coverAssets.filter((asset) => asset.variant === "wechat_21_9").length} 个
              </p>
              <p className={coverAssets.some((asset) => asset.variant === "wechat_1_1") ? "check-item done" : "check-item"}>
                1:1 封面：{coverAssets.filter((asset) => asset.variant === "wechat_1_1").length} 个
              </p>
              <p className={latestUpload?.status === "success" ? "check-item done" : "check-item"}>
                草稿箱：{latestUpload?.status === "success" ? latestUpload.wechatMediaId : "未上传"}
              </p>
            </div>

            <div className="asset-list">
              <h3>资产记录</h3>
              {assets.length > 0 ? (
                assets.map((asset) => (
                  <div className="asset-row" key={asset.id}>
                    <span>{asset.assetType}</span>
                    <span>{asset.variant || "default"}</span>
                    <span>{asset.path}</span>
                    {asset.errorMessage ? <span className="asset-warning">{asset.errorMessage}</span> : null}
                  </div>
                ))
              ) : (
                <p className="subtle">暂无发布资产。</p>
              )}
            </div>
          </div>

          {visibleUploads.length > 0 ? (
            <div className="upload-list">
              <h3>草稿箱记录</h3>
              {visibleUploads.map((upload) => (
                <div className="asset-row" key={upload.id}>
                  <span>{upload.status}</span>
                  <span>{upload.wechatMediaId || upload.errorMessage || "无 media_id"}</span>
                  <span>{upload.uploadedAt ? formatTime(upload.uploadedAt) : "未完成"}</span>
                </div>
              ))}
            </div>
          ) : null}
          </PublishPanel>
        ) : null}

        {activeTab === "review" ? (
          <ReviewPanel status={getTabMeta("review")}>
              <StagePromptDialog
                title={STAGE_PROMPT_UI.review.title}
                stage="review"
                defaultPromptLabel={STAGE_PROMPT_UI.review.defaultPromptLabel}
                defaultPrompt={reviewDefaultPrompt}
                onDefaultPromptChange={setReviewDefaultPrompt}
                onSaveDefaultPrompt={() => runAction("save-review-default-prompt", () => saveStagePrompt("review", reviewDefaultPrompt))}
                requirements={reviewRequirements}
                selectedIds={selectedReviewRequirementIds}
                pending={pending !== null}
                onSelectedIdsChange={setSelectedReviewRequirementIds}
                onCreate={(input) => runAction("create-review-requirement", () => createRequirement(input))}
                onUpdate={(id, input) => runAction("update-review-requirement", () => updateRequirement(id, input))}
                onDelete={(id) => runAction("delete-review-requirement", () => deleteRequirement(id))}
              />

              <label className="field prompt-field">
                <span className="label">对当前文章的要求</span>
                <textarea
                  className="textarea prompt-textarea"
                  placeholder={STAGE_PROMPT_UI.review.customPlaceholder}
                  value={reviewCustomInstruction}
                  onChange={(event) => setReviewCustomInstruction(event.target.value)}
                />
                <button
                  className="button secondary prompt-save-button"
                  disabled={pending !== null}
                  onClick={() =>
                    runAction("save-review-custom-requirement", () => saveCustomInstructionAsRequirement("review", reviewCustomInstruction))
                  }
                  type="button"
                >
                  保存为可选提示词
                </button>
              </label>

              <div className="action-row">
                <button
                  className="button secondary"
                  disabled={!finalDraft || pending !== null}
                  onClick={() =>
                    runAction("review-check", async () => {
                      await postJson<PromptRunArtifact>(`/api/articles/${article.id}/review-check`, {
                        customInstruction: reviewCustomInstruction,
                        selectedRequirementIds: selectedReviewRequirementIds
                      });
                      setNotice("已生成复盘检查清单");
                    })
                  }
                  type="button"
                >
                  {pending === "review-check" ? "生成中" : "生成复盘检查清单"}
                </button>
              </div>

              {latestReviewArtifact ? (
                <section className="prompt-artifact">
                  <div className="prompt-artifact-head">
                    <div>
                      <h3>最新复盘检查清单</h3>
                      <p>{formatTime(latestReviewArtifact.createdAt)}</p>
                    </div>
                    {latestReviewArtifact.sourceInvocationId ? (
                      <button
                        aria-label="查看复盘提示词配方"
                        className="icon-action"
                        disabled={pending !== null}
                        onClick={() => void openPromptRecipe("invocation", latestReviewArtifact.sourceInvocationId)}
                        title="查看提示词配方"
                        type="button"
                      >
                        <ScrollText aria-hidden="true" size={16} />
                      </button>
                    ) : null}
                  </div>
                  <MarkdownPreview markdown={latestReviewArtifact.summaryMarkdown} />
                </section>
              ) : null}

              <div className="publish-grid">
                <div className="publish-checklist">
                  <h3>复盘状态</h3>
                  <p className={latestUpload?.status === "success" ? "check-item done" : "check-item"}>
                    草稿箱：{latestUpload?.status === "success" ? latestUpload.wechatMediaId : "未上传"}
                  </p>
                  <p className={articleStatus === "published_manually" || articleStatus === "review_pending" || articleStatus === "review_recorded" ? "check-item done" : "check-item"}>
                    人工发布：{articleStatus === "published_manually" || articleStatus === "review_pending" || articleStatus === "review_recorded" ? "已发布" : "未确认"}
                  </p>
                  <p className={articleStatus === "review_recorded" ? "check-item done" : "check-item"}>
                    复盘快照：{articleStatus === "review_recorded" ? "已记录" : "待回填"}
                  </p>
                </div>
                <div className="asset-list">
                  <h3>复盘指标</h3>
                  <p className="subtle">发布后回填浏览量、点赞、转发、推荐、评论和归因。</p>
                </div>
              </div>
          </ReviewPanel>
        ) : null}
        </div>
      </WorkspaceShell>
    </div>
  );
}
