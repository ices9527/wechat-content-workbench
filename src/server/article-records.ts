import { and, eq } from "drizzle-orm";

import type { WorkbenchDatabase } from "@/db/client";
import {
  articleProjects,
  contentDiagnoses,
  draftVersions,
  outlineVersions,
  researchVersions,
  topicDiagnoses,
  type ArticleProject,
  type ContentDiagnosis,
  type DraftVersion,
  type OutlineVersion,
  type ResearchVersion,
  type TopicDiagnosis
} from "@/db/schema";

export function requireArticle(id: string, db: WorkbenchDatabase): ArticleProject {
  const article = db.select().from(articleProjects).where(eq(articleProjects.id, id)).get();
  if (!article) {
    throw new Error("文章不存在");
  }
  return article;
}

export function requireDraft(articleId: string, draftVersionId: string, db: WorkbenchDatabase): DraftVersion {
  const draft = db
    .select()
    .from(draftVersions)
    .where(and(eq(draftVersions.id, draftVersionId), eq(draftVersions.articleId, articleId)))
    .get();
  if (!draft) {
    throw new Error("文案版本不存在");
  }
  return draft;
}

export function requireOutline(articleId: string, outlineVersionId: string, db: WorkbenchDatabase): OutlineVersion {
  const outline = db
    .select()
    .from(outlineVersions)
    .where(and(eq(outlineVersions.id, outlineVersionId), eq(outlineVersions.articleId, articleId)))
    .get();
  if (!outline) {
    throw new Error("提纲版本不存在");
  }
  return outline;
}

export function requireDiagnosis(articleId: string, diagnosisId: string, db: WorkbenchDatabase): ContentDiagnosis {
  const diagnosis = db
    .select()
    .from(contentDiagnoses)
    .where(and(eq(contentDiagnoses.id, diagnosisId), eq(contentDiagnoses.articleId, articleId)))
    .get();
  if (!diagnosis) {
    throw new Error("诊断记录不存在");
  }
  return diagnosis;
}

export function requireTopicDiagnosis(articleId: string, topicDiagnosisId: string, db: WorkbenchDatabase): TopicDiagnosis {
  const diagnosis = db
    .select()
    .from(topicDiagnoses)
    .where(and(eq(topicDiagnoses.id, topicDiagnosisId), eq(topicDiagnoses.articleId, articleId)))
    .get();
  if (!diagnosis) {
    throw new Error("选题诊断记录不存在");
  }
  return diagnosis;
}

export function requireResearchVersion(articleId: string, researchVersionId: string, db: WorkbenchDatabase): ResearchVersion {
  const research = db
    .select()
    .from(researchVersions)
    .where(and(eq(researchVersions.id, researchVersionId), eq(researchVersions.articleId, articleId)))
    .get();
  if (!research) {
    throw new Error("研究资料包不存在");
  }
  return research;
}
