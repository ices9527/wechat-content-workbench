import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import {
  ensureAppDataReady,
  getArticle,
  listAngles,
  listDiagnoses,
  listDrafts,
  listOutlines,
  listPromptRunArtifacts,
  listTopicDiagnoses
} from "@/server/articles";
import { listRequirementPresets } from "@/server/requirements";
import { listStagePromptDefaults } from "@/server/stage-prompts";
import { listArticleAssets, listWechatDraftUploads } from "@/server/publishing";
import { ArticleWorkflow } from "@/components/article-workflow";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  ensureAppDataReady();
  const { id } = await params;
  const article = getArticle(id);

  if (!article) {
    notFound();
  }
  const angles = listAngles(article.id);
  const outlines = listOutlines(article.id);
  const drafts = listDrafts(article.id);
  const diagnoses = listDiagnoses(article.id);
  const topicDiagnoses = listTopicDiagnoses(article.id);
  const assets = listArticleAssets(article.id);
  const uploads = listWechatDraftUploads(article.id);
  const stagePrompts = listStagePromptDefaults();
  const requirementPresets = [
    ...listRequirementPresets({ stage: "topic", includeArchived: true }),
    ...listRequirementPresets({ stage: "angle", includeArchived: true }),
    ...listRequirementPresets({ stage: "outline", includeArchived: true }),
    ...listRequirementPresets({ stage: "draft", includeArchived: true }),
    ...listRequirementPresets({ stage: "dbs", includeArchived: true }),
    ...listRequirementPresets({ stage: "pre_publish", includeArchived: true }),
    ...listRequirementPresets({ stage: "review", includeArchived: true })
  ];
  const promptArtifacts = listPromptRunArtifacts(article.id);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">Article</p>
          <h1>{article.title}</h1>
          <p className="subtle">{article.topic}</p>
        </div>
        <StatusBadge label={article.statusLabel} />
      </header>

      <ArticleWorkflow
        article={article}
        angles={angles}
        outlines={outlines}
        drafts={drafts}
        diagnoses={diagnoses}
        topicDiagnoses={topicDiagnoses}
        assets={assets}
        uploads={uploads}
        stagePrompts={stagePrompts}
        requirementPresets={requirementPresets}
        promptArtifacts={promptArtifacts}
      />
    </>
  );
}
