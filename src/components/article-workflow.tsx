"use client";

import { Maximize2, ScrollText, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type {
  AngleCandidate,
  ArticleAsset,
  ContentDiagnosis,
  DraftVersion,
  OutlineVersion,
  PromptRunArtifact,
  RequirementPreset,
  StagePromptDefault,
  TopicDiagnosis,
  WechatDraftUpload
} from "@/db/schema";
import type { ArticleStatus } from "@/domain/status";
import type { RequirementStage } from "@/domain/stages";
import type { ArticleListItem } from "@/server/articles";
import type { PromptRecipe } from "@/server/prompt-recipes";
import { MarkdownPreview } from "./markdown-preview";
import { PromptRecipeDialog } from "./prompts/prompt-recipe-dialog";
import { STAGE_PROMPT_UI } from "./prompts/prompt-ui";
import { StagePromptDialog } from "./prompts/stage-prompt-dialog";

// API helpers

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
      throw new Error(result.error || fallbackMessage);
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
  hold: "选题诊断建议暂缓。继续生成角度前，建议先确认今天点开的理由和读者真实问题。",
  drop: "选题诊断建议放弃。你仍可继续，但这篇文章进入生产线的风险较高。"
};

function formatTopicDiagnosisVerdict(verdict: string | null | undefined): string {
  if (!verdict) {
    return "未诊断";
  }
  return TOPIC_DIAGNOSIS_VERDICT_LABELS[verdict] || verdict;
}

type WorkflowTabId =
  | "topic"
  | "topic-diagnosis"
  | "angles"
  | "outline"
  | "draft"
  | "diagnosis"
  | "final"
  | "publish"
  | "review";

const WORKFLOW_TABS: Array<{ id: WorkflowTabId; label: string }> = [
  { id: "topic", label: "主题" },
  { id: "topic-diagnosis", label: "选题诊断" },
  { id: "angles", label: "角度" },
  { id: "outline", label: "主线提纲" },
  { id: "draft", label: "Markdown 文案" },
  { id: "diagnosis", label: "dbs-content" },
  { id: "final", label: "人工检查/最终稿" },
  { id: "publish", label: "发布" },
  { id: "review", label: "复盘" }
];

const PROMPT_STAGES: RequirementStage[] = ["angle", "outline", "draft", "dbs", "pre_publish", "review"];

function isWorkflowTabId(value: string | null): value is WorkflowTabId {
  return WORKFLOW_TABS.some((tab) => tab.id === value);
}

function defaultTabForStatus(status: ArticleStatus): WorkflowTabId {
  if (status === "topic_created" || status === "topic_diagnosed") {
    return "topic-diagnosis";
  }
  if (status === "angles_generated") {
    return "angles";
  }
  if (status === "angle_selected" || status === "outline_generated") {
    return "outline";
  }
  if (status === "outline_review" || status === "draft_generated") {
    return "draft";
  }
  if (status === "dbs_checking") {
    return "diagnosis";
  }
  if (status === "revision_generated" || status === "human_review") {
    return "final";
  }
  if (status === "published_manually" || status === "review_pending" || status === "review_recorded") {
    return "review";
  }
  return "publish";
}

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

// Panel components

function WorkflowPanel({
  tabId,
  title,
  status,
  headActions,
  className,
  children
}: {
  tabId: WorkflowTabId;
  title: string;
  status?: ReactNode;
  headActions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`workflow-tab-${tabId}`}
      className={className ? `panel ${className}` : "panel"}
      id={`workflow-panel-${tabId}`}
      role="tabpanel"
      tabIndex={0}
    >
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {headActions ? <div className="panel-head-actions">{headActions}</div> : status ? <span className="status">{status}</span> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function TopicPanel({ article }: { article: ArticleListItem }) {
  return (
    <WorkflowPanel tabId="topic" title="主题" status={article.statusLabel}>
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
    </WorkflowPanel>
  );
}

function TopicDiagnosisPanel({
  latestTopicDiagnosis,
  topicDiagnoses,
  customInstruction,
  pending,
  onCustomInstructionChange,
  onRunDiagnosis
}: {
  latestTopicDiagnosis: TopicDiagnosis | null;
  topicDiagnoses: TopicDiagnosis[];
  customInstruction: string;
  pending: string | null;
  onCustomInstructionChange: (value: string) => void;
  onRunDiagnosis: () => void;
}) {
  return (
    <WorkflowPanel
      tabId="topic-diagnosis"
      title="选题诊断"
      status={latestTopicDiagnosis ? formatTopicDiagnosisVerdict(latestTopicDiagnosis.verdict) : "待诊断"}
    >
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

      {latestTopicDiagnosis ? (
        <div className="topic-diagnosis-stack">
          <section className={`topic-diagnosis-result verdict-${latestTopicDiagnosis.verdict}`}>
            <div className="mini-card-head">
              <h3>最新诊断</h3>
              <span className="source-pill">{formatTime(latestTopicDiagnosis.createdAt)}</span>
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
              {topicDiagnoses.slice(1, 5).map((diagnosis) => (
                <article className="mini-card" key={diagnosis.id}>
                  <div className="mini-card-head">
                    <h3>{formatTopicDiagnosisVerdict(diagnosis.verdict)}</h3>
                    <span className="source-pill">{formatTime(diagnosis.createdAt)}</span>
                  </div>
                  <p>{diagnosis.nextAction || diagnosis.riskSummary || "未记录摘要"}</p>
                </article>
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

function AnglesPanel({ selectedAngle, children }: { selectedAngle: AngleCandidate | undefined; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="angles" title="角度" status={selectedAngle ? "已选择" : null}>
      {children}
    </WorkflowPanel>
  );
}

function OutlinePanel({ headActions, children }: { headActions: ReactNode; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="outline" title="主线和提纲" headActions={headActions}>
      {children}
    </WorkflowPanel>
  );
}

function DraftPanel({ headActions, children }: { headActions: ReactNode; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="draft" title="Markdown 文案" headActions={headActions}>
      {children}
    </WorkflowPanel>
  );
}

function DiagnosisPanel({ count, children }: { count: number; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="diagnosis" title="dbs-content 诊断" status={count > 0 ? `${count} 次` : null} className="diagnosis-panel">
      {children}
    </WorkflowPanel>
  );
}

function FinalPanel({ finalDraft, children }: { finalDraft: DraftVersion | null; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="final" title="版本链和最终稿" status={finalDraft ? `最终稿 v${finalDraft.versionNo}` : null}>
      {children}
    </WorkflowPanel>
  );
}

function PublishPanel({ latestUpload, children }: { latestUpload: WechatDraftUpload | null; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="publish" title="发布包" status={latestUpload?.status === "success" ? "已上传草稿箱" : null}>
      {children}
    </WorkflowPanel>
  );
}

function ReviewPanel({ status, children }: { status: string; children: ReactNode }) {
  return (
    <WorkflowPanel tabId="review" title="复盘" status={status}>
      {children}
    </WorkflowPanel>
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
  drafts,
  diagnoses,
  topicDiagnoses,
  assets,
  uploads,
  stagePrompts,
  requirementPresets,
  promptArtifacts
}: {
  article: ArticleListItem;
  angles: AngleCandidate[];
  outlines: OutlineVersion[];
  drafts: DraftVersion[];
  diagnoses: ContentDiagnosis[];
  topicDiagnoses: TopicDiagnosis[];
  assets: ArticleAsset[];
  uploads: WechatDraftUpload[];
  stagePrompts: StagePromptDefault[];
  requirementPresets: RequirementPreset[];
  promptArtifacts: PromptRunArtifact[];
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
  const latestOutline = outlines[0] || null;
  const acceptedOutline = outlines.find((outline) => outline.accepted) || null;
  const latestDraft = drafts[0] || null;
  const finalDraft = drafts.find((draft) => draft.isFinal) || null;
  const latestTopicDiagnosis = topicDiagnoses[0] || null;
  const [mainline, setMainline] = useState(latestOutline?.mainline || "");
  const [outlineMarkdown, setOutlineMarkdown] = useState(latestOutline?.outlineMarkdown || "");
  const [selectedOutlineId, setSelectedOutlineId] = useState(latestOutline?.id || "");
  const [draftMarkdown, setDraftMarkdown] = useState(latestDraft?.markdown || "");
  const [selectedDraftId, setSelectedDraftId] = useState(latestDraft?.id || "");
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
  const angleRequirements = requirementsByStage.angle;
  const outlineRequirements = requirementsByStage.outline;
  const draftRequirements = requirementsByStage.draft;
  const dbsRequirements = requirementsByStage.dbs;
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
  const [selectedRequirementIdsByStage, setSelectedRequirementIdsByStage] = useState<Record<RequirementStage, string[]>>(() =>
    selectedRequirementIdsFromKeys(requirementKeys)
  );
  const angleDefaultPrompt = defaultPromptDrafts.angle;
  const outlineDefaultPrompt = defaultPromptDrafts.outline;
  const draftDefaultPrompt = defaultPromptDrafts.draft;
  const dbsDefaultPrompt = defaultPromptDrafts.dbs;
  const prePublishDefaultPrompt = defaultPromptDrafts.pre_publish;
  const reviewDefaultPrompt = defaultPromptDrafts.review;
  const setAngleDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("angle", value);
  const setOutlineDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("outline", value);
  const setDraftDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("draft", value);
  const setDbsDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("dbs", value);
  const setPrePublishDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("pre_publish", value);
  const setReviewDefaultPrompt = (value: string) => setDefaultPromptDraftForStage("review", value);
  const angleCustomInstruction = customInstructions.angle;
  const outlineCustomInstruction = customInstructions.outline;
  const draftCustomInstruction = customInstructions.draft;
  const dbsCustomInstruction = customInstructions.dbs;
  const prePublishCustomInstruction = customInstructions.pre_publish;
  const reviewCustomInstruction = customInstructions.review;
  const setAngleCustomInstruction = (value: string) => setCustomInstructionForStage("angle", value);
  const setOutlineCustomInstruction = (value: string) => setCustomInstructionForStage("outline", value);
  const setDraftCustomInstruction = (value: string) => setCustomInstructionForStage("draft", value);
  const setDbsCustomInstruction = (value: string) => setCustomInstructionForStage("dbs", value);
  const setPrePublishCustomInstruction = (value: string) => setCustomInstructionForStage("pre_publish", value);
  const setReviewCustomInstruction = (value: string) => setCustomInstructionForStage("review", value);
  const selectedAngleRequirementIds = selectedRequirementIdsByStage.angle;
  const selectedOutlineRequirementIds = selectedRequirementIdsByStage.outline;
  const selectedDraftRequirementIds = selectedRequirementIdsByStage.draft;
  const selectedDbsRequirementIds = selectedRequirementIdsByStage.dbs;
  const selectedPrePublishRequirementIds = selectedRequirementIdsByStage.pre_publish;
  const selectedReviewRequirementIds = selectedRequirementIdsByStage.review;
  const setSelectedAngleRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("angle", ids);
  const setSelectedOutlineRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("outline", ids);
  const setSelectedDraftRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("draft", ids);
  const setSelectedDbsRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("dbs", ids);
  const setSelectedPrePublishRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("pre_publish", ids);
  const setSelectedReviewRequirementIds = (ids: string[]) => setSelectedRequirementIdsForStage("review", ids);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState(diagnoses[0]?.id || "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullscreenPane, setFullscreenPane] = useState<"editor" | "preview" | null>(null);
  const [promptRecipe, setPromptRecipe] = useState<PromptRecipe | null>(null);
  const activeArticleIdRef = useRef(article.id);
  const draftEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const fullscreenEditorRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedAngle = useMemo(() => angles.find((angle) => angle.selected), [angles]);
  const outlineById = useMemo(() => new Map(outlines.map((outline) => [outline.id, outline])), [outlines]);
  const selectedOutline = selectedOutlineId ? outlineById.get(selectedOutlineId) || null : latestOutline;
  const draftById = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft])), [drafts]);
  const selectedDiagnosis = useMemo(
    () => diagnoses.find((diagnosis) => diagnosis.id === selectedDiagnosisId) || diagnoses[0] || null,
    [diagnoses, selectedDiagnosisId]
  );
  const htmlAssets = assets.filter((asset) => asset.assetType === "html");
  const coverAssets = assets.filter((asset) => asset.assetType === "cover");
  const latestUpload = uploads[0] || null;
  const canMarkFinal = drafts.length > 0 && canMarkFinalDraft(articleStatus);
  const topicDiagnosisWarning = latestTopicDiagnosis
    ? TOPIC_DIAGNOSIS_WARNING_COPY[latestTopicDiagnosis.verdict] || null
    : null;

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
      return latestTopicDiagnosis ? formatTopicDiagnosisVerdict(latestTopicDiagnosis.verdict) : "待做";
    }
    if (tabId === "angles") {
      return selectedAngle ? "已选" : angles.length > 0 ? `${angles.length} 个` : "待做";
    }
    if (tabId === "outline") {
      return acceptedOutline ? "已确认" : latestOutline ? "待确认" : "待做";
    }
    if (tabId === "draft") {
      return latestDraft ? `v${latestDraft.versionNo}` : "待做";
    }
    if (tabId === "diagnosis") {
      return diagnoses.length > 0 ? `${diagnoses.length} 次` : "待做";
    }
    if (tabId === "final") {
      return finalDraft ? `v${finalDraft.versionNo}` : "待做";
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
    setSelectedOutlineId((current) => {
      if (current && outlines.some((outline) => outline.id === current)) {
        return current;
      }
      return latestOutline?.id || "";
    });
  }, [latestOutline?.id, outlines]);

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
    setSelectedDiagnosisId((current) => {
      if (diagnoses.some((diagnosis) => diagnosis.id === current)) {
        return current;
      }
      return diagnoses[0]?.id || "";
    });
  }, [diagnoses]);

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

  async function submitManualAngle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  function selectDraftVersion(draftId: string) {
    const draft = draftById.get(draftId);
    if (draft) {
      loadDraftIntoEditor(draft);
    }
  }

  function getOutlineOptionLabel(outline: OutlineVersion): string {
    return outline.accepted ? `v${outline.versionNo} · 已确认` : `v${outline.versionNo}`;
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

  async function openPromptRecipe(kind: "outline" | "draft" | "invocation", targetId: string | null) {
    if (!targetId) {
      return;
    }
    const queryKey = kind === "outline" ? "outlineVersionId" : kind === "draft" ? "draftVersionId" : "invocationId";
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

  function closeFullscreen() {
    setFullscreenPane(null);
  }

  return (
    <div className="workflow-stack">
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="workflow-tabs-card">
        <div aria-label="公众号生产线节点" className="workflow-tabs" role="tablist">
          {WORKFLOW_TABS.map((tab) => (
            <button
              aria-controls={`workflow-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "workflow-tab active" : "workflow-tab"}
              id={`workflow-tab-${tab.id}`}
              key={tab.id}
              onClick={() => switchWorkflowTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <span>{getTabMeta(tab.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="workflow-tab-panels">
        {activeTab === "topic" ? <TopicPanel article={article} /> : null}

        {activeTab === "topic-diagnosis" ? (
          <TopicDiagnosisPanel
            latestTopicDiagnosis={latestTopicDiagnosis}
            topicDiagnoses={topicDiagnoses}
            customInstruction={topicDiagnosisCustomInstruction}
            pending={pending}
            onCustomInstructionChange={setTopicDiagnosisCustomInstruction}
            onRunDiagnosis={() =>
              runAction("run-topic-diagnosis", async () => {
                await postJson<{ diagnosis: TopicDiagnosis }>(`/api/articles/${article.id}/run-topic-diagnosis`, {
                  customInstruction: topicDiagnosisCustomInstruction
                });
                setNotice("已完成选题诊断");
              })
            }
          />
        ) : null}

        {activeTab === "angles" ? (
          <AnglesPanel selectedAngle={selectedAngle}>
          {topicDiagnosisWarning ? (
            <p className={latestTopicDiagnosis?.verdict === "drop" ? "error" : "notice"}>{topicDiagnosisWarning}</p>
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
              disabled={pending !== null}
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
            <button className="button secondary" disabled={pending !== null} type="submit">
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
                  disabled={pending !== null}
                  onClick={() =>
                    runAction(
                      "select-angle",
                      () =>
                        postJson(`/api/articles/${article.id}/select-angle`, {
                          angleId: angle.id
                        }),
                      "outline"
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
              disabled={!article.selectedAngleId || pending !== null}
              onClick={() =>
                runAction("generate-outline", async () => {
                  const outline = await postJson<OutlineVersion>(`/api/articles/${article.id}/generate-outline`, {
                    customInstruction: outlineCustomInstruction,
                    selectedRequirementIds: selectedOutlineRequirementIds
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
              disabled={!acceptedOutline || pending !== null}
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

        {activeTab === "diagnosis" ? (
          <DiagnosisPanel count={diagnoses.length}>
          <StagePromptDialog
            title={STAGE_PROMPT_UI.dbs.title}
            stage="dbs"
            defaultPromptLabel={STAGE_PROMPT_UI.dbs.defaultPromptLabel}
            defaultPrompt={dbsDefaultPrompt}
            onDefaultPromptChange={setDbsDefaultPrompt}
            onSaveDefaultPrompt={() => runAction("save-dbs-default-prompt", () => saveStagePrompt("dbs", dbsDefaultPrompt))}
            requirements={dbsRequirements}
            selectedIds={selectedDbsRequirementIds}
            pending={pending !== null}
            onSelectedIdsChange={setSelectedDbsRequirementIds}
            onCreate={(input) => runAction("create-dbs-requirement", () => createRequirement(input))}
            onUpdate={(id, input) => runAction("update-dbs-requirement", () => updateRequirement(id, input))}
            onDelete={(id) => runAction("delete-dbs-requirement", () => deleteRequirement(id))}
          />

          <label className="field prompt-field">
            <span className="label">对当前文章的要求</span>
            <textarea
              className="textarea prompt-textarea"
              placeholder={STAGE_PROMPT_UI.dbs.customPlaceholder}
              value={dbsCustomInstruction}
              onChange={(event) => setDbsCustomInstruction(event.target.value)}
            />
            <button
              className="button secondary prompt-save-button"
              disabled={pending !== null}
              onClick={() => runAction("save-dbs-custom-requirement", () => saveCustomInstructionAsRequirement("dbs", dbsCustomInstruction))}
              type="button"
            >
              保存为可选提示词
            </button>
          </label>

          <div className="action-row">
            <label className="select-field">
              <span className="label">诊断文案版本</span>
              <select
                aria-label="诊断文案版本"
                className="input"
                disabled={drafts.length === 0 || pending !== null}
                onChange={(event) => setSelectedDraftId(event.target.value)}
                value={selectedDraftId}
              >
                {drafts.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    v{draft.versionNo} · {draft.draftType === "revision" ? "修改稿" : draft.draftType === "initial" ? "初稿" : "保存稿"}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button"
              disabled={!selectedDraftId || pending !== null}
              onClick={() =>
                runAction(
                  "run-dbs",
                  async () => {
                    const diagnosis = await postJson<ContentDiagnosis>(`/api/articles/${article.id}/run-dbs-content`, {
                      draftVersionId: selectedDraftId,
                      customInstruction: dbsCustomInstruction,
                      selectedRequirementIds: selectedDbsRequirementIds
                    });
                    setSelectedDiagnosisId(diagnosis.id);
                    setNotice("已保存 dbs-content 诊断");
                  },
                  "diagnosis"
                )
              }
              type="button"
            >
              {pending === "run-dbs" ? "诊断中" : "运行 dbs-content"}
            </button>
            <button
              className="button secondary"
              disabled={!selectedDiagnosis || pending !== null}
              onClick={() =>
                runAction(
                  "revise",
                  async () => {
                    const draft = await postJson<DraftVersion>(`/api/articles/${article.id}/revise-from-diagnosis`, {
                      diagnosisId: selectedDiagnosis?.id
                    });
                    setDraftMarkdown(draft.markdown);
                    setNotice(`已生成修改稿 v${draft.versionNo}`);
                  },
                  "draft"
                )
              }
              type="button"
            >
              {pending === "revise" ? "生成中" : "基于诊断生成修改稿"}
            </button>
          </div>

          {selectedDiagnosis ? (
            <div className="diagnosis-layout">
              <div className="diagnosis-list">
                {diagnoses.map((diagnosis) => (
                  <button
                    className={diagnosis.id === selectedDiagnosis.id ? "diagnosis-row active" : "diagnosis-row"}
                    key={diagnosis.id}
                    onClick={() => setSelectedDiagnosisId(diagnosis.id)}
                    type="button"
                  >
                    <span>诊断 {getDraftLabel(diagnosis.draftVersionId)}</span>
                    <span>{formatTime(diagnosis.createdAt)}</span>
                  </button>
                ))}
              </div>
              <div className="diagnosis-detail">
                {selectedDiagnosis.sourceInvocationId ? (
                  <div className="action-row compact">
                    <button
                      className="button secondary"
                      disabled={pending !== null}
                      onClick={() => void openPromptRecipe("invocation", selectedDiagnosis.sourceInvocationId)}
                      type="button"
                    >
                      查看本次提示词配方
                    </button>
                  </div>
                ) : null}
                <div className="diagnosis-metrics">
                  <p>{selectedDiagnosis.textCleanliness}</p>
                  <p>{selectedDiagnosis.titleCover}</p>
                  <p>{selectedDiagnosis.expressionEfficiency}</p>
                  <p>{selectedDiagnosis.cognitiveGap}</p>
                  <p>{selectedDiagnosis.aiTrace}</p>
                </div>
                {selectedDiagnosis.firstFix ? <p className="first-fix">{selectedDiagnosis.firstFix}</p> : null}
                <MarkdownPreview markdown={selectedDiagnosis.diagnosisMarkdown} />
              </div>
            </div>
          ) : (
            <p className="subtle">生成文案后运行 dbs-content。</p>
          )}
          </DiagnosisPanel>
        ) : null}

        {activeTab === "final" ? (
          <FinalPanel finalDraft={finalDraft}>
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
                  <p>{draft.draftType === "revision" ? "修改稿" : draft.draftType === "initial" ? "初稿" : "保存稿"}</p>
                  <p>{draft.sourceDiagnosisId ? `来源诊断：${diagnoses.find((item) => item.id === draft.sourceDiagnosisId) ? "已关联" : "未载入"}` : "无诊断来源"}</p>
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
                          async () => {
                            await postJson<DraftVersion>(`/api/articles/${article.id}/mark-final-draft`, {
                              draftVersionId: draft.id
                            });
                            setNotice(`已标记最终稿 v${draft.versionNo}`);
                          },
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

        {activeTab === "publish" ? (
          <PublishPanel latestUpload={latestUpload}>
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
                  const upload = await postJson<WechatDraftUpload>(`/api/articles/${article.id}/upload-wechat-draft`);
                  setNotice(`已上传公众号草稿箱：${upload.wechatMediaId}`);
                })
              }
              type="button"
            >
              {pending === "upload-wechat" ? "上传中" : "上传公众号草稿箱"}
            </button>
          </div>

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

          <div className="publish-grid">
            <div className="publish-checklist">
              <h3>发布检查</h3>
              <p className={finalDraft ? "check-item done" : "check-item"}>最终稿：{finalDraft ? `v${finalDraft.versionNo}` : "未标记"}</p>
              <p className={htmlAssets.length > 0 ? "check-item done" : "check-item"}>HTML：{htmlAssets.length} 个</p>
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
                  </div>
                ))
              ) : (
                <p className="subtle">暂无发布资产。</p>
              )}
            </div>
          </div>

          {uploads.length > 0 ? (
            <div className="upload-list">
              <h3>草稿箱记录</h3>
              {uploads.map((upload) => (
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
    </div>
  );
}
