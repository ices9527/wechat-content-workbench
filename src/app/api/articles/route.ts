import { NextRequest, NextResponse } from "next/server";

import { withJsonErrorBoundary, zodOrJsonError } from "@/app/api/_utils/route-errors";
import { ARTICLE_STATUSES, type ArticleStatus } from "@/domain/status";
import {
  createArticle,
  createArticleInputSchema,
  ensureAppDataReady,
  listArticles,
  TOPIC_DIAGNOSIS_FILTER_VALUES,
  type TopicDiagnosisFilter
} from "@/server/articles";

function parseArticleStatus(value: string | null): ArticleStatus | undefined {
  return value && ARTICLE_STATUSES.includes(value as ArticleStatus) ? (value as ArticleStatus) : undefined;
}

function parseTopicDiagnosisFilter(value: string | null): TopicDiagnosisFilter | undefined {
  return value && TOPIC_DIAGNOSIS_FILTER_VALUES.includes(value as TopicDiagnosisFilter) ? (value as TopicDiagnosisFilter) : undefined;
}

export function GET(request: NextRequest) {
  return withJsonErrorBoundary(() => {
    ensureAppDataReady();
    const status = parseArticleStatus(request.nextUrl.searchParams.get("status"));
    const topicDiagnosis = parseTopicDiagnosisFilter(request.nextUrl.searchParams.get("topicDiagnosis"));
    const query = request.nextUrl.searchParams.get("q") || undefined;
    const articles = listArticles({ status, topicDiagnosis, query });
    return NextResponse.json({ articles });
  }, { fallback: "读取文章列表失败", status: 500 });
}

export async function POST(request: NextRequest) {
  return withJsonErrorBoundary(async () => {
    ensureAppDataReady();
    try {
      const body = await request.json();
      const input = createArticleInputSchema.parse(body);
      const article = createArticle(input);
      return NextResponse.json(article, { status: 201 });
    } catch (error) {
      return zodOrJsonError(error, "创建文章失败", 500);
    }
  }, { fallback: "创建文章失败", status: 500 });
}
