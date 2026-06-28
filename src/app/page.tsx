import { ArticleLibraryFilters, type ArticleLibraryFilterValues } from "@/components/article-library-filters";
import { ArticleList } from "@/components/article-list";
import { NewArticleForm } from "@/components/new-article-form";
import { ARTICLE_STATUSES, type ArticleStatus } from "@/domain/status";
import { ensureAppDataReady, listArticles, TOPIC_DIAGNOSIS_FILTER_VALUES, type TopicDiagnosisFilter } from "@/server/articles";

export const dynamic = "force-dynamic";

type WorkbenchSearchParams = Record<string, string | string[] | undefined>;

function firstSearchParamValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseArticleStatus(value: string): ArticleStatus | "" {
  return ARTICLE_STATUSES.includes(value as ArticleStatus) ? (value as ArticleStatus) : "";
}

function parseTopicDiagnosisFilter(value: string): TopicDiagnosisFilter | "" {
  return TOPIC_DIAGNOSIS_FILTER_VALUES.includes(value as TopicDiagnosisFilter) ? (value as TopicDiagnosisFilter) : "";
}

export default async function WorkbenchPage({ searchParams }: { searchParams?: Promise<WorkbenchSearchParams> }) {
  ensureAppDataReady();
  const params = (await searchParams) || {};
  const filters: ArticleLibraryFilterValues = {
    query: firstSearchParamValue(params.q).trim(),
    status: parseArticleStatus(firstSearchParamValue(params.status)),
    topicDiagnosis: parseTopicDiagnosisFilter(firstSearchParamValue(params.topicDiagnosis))
  };
  const articles = listArticles({
    query: filters.query,
    status: filters.status || undefined,
    topicDiagnosis: filters.topicDiagnosis || undefined
  });
  const hasActiveFilters = Boolean(filters.query || filters.status || filters.topicDiagnosis);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">Linear View</p>
          <h1>今天要处理什么？</h1>
          <p className="subtle">从主题开始，把文章推进到待发布。每篇文章只显示下一步动作。</p>
        </div>
      </header>

      <div className="grid">
        <section className="panel" aria-label="文章工作台">
          <div className="panel-head">
            <h2 className="panel-title">文章生产线</h2>
            <span className="subtle">{articles.length} 篇文章</span>
          </div>
          <div className="panel-body article-library-body">
            <ArticleLibraryFilters filters={filters} />
          </div>
          <ArticleList articles={articles} emptyText={hasActiveFilters ? "没有匹配的文章。可以调整搜索词或筛选条件。" : undefined} />
        </section>

        <aside className="panel" aria-label="新建文章">
          <div className="panel-head">
            <h2 className="panel-title">新建主题</h2>
          </div>
          <div className="panel-body">
            <NewArticleForm />
          </div>
        </aside>
      </div>
    </>
  );
}
