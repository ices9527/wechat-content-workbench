import { Search, X } from "lucide-react";
import Link from "next/link";

import { ARTICLE_STATUS_LABELS, ARTICLE_STATUSES, type ArticleStatus } from "@/domain/status";
import { TOPIC_DIAGNOSIS_FILTER_LABELS, TOPIC_DIAGNOSIS_FILTER_VALUES, type TopicDiagnosisFilter } from "@/server/articles";

export type ArticleLibraryFilterValues = {
  query: string;
  status: ArticleStatus | "";
  topicDiagnosis: TopicDiagnosisFilter | "";
};

export function ArticleLibraryFilters({ filters }: { filters: ArticleLibraryFilterValues }) {
  const hasActiveFilters = Boolean(filters.query || filters.status || filters.topicDiagnosis);

  return (
    <form action="/" className="article-filter-form" method="get" role="search">
      <div className="field article-filter-query">
        <label className="label" htmlFor="article-filter-query">
          搜索文章
        </label>
        <input
          className="input"
          defaultValue={filters.query}
          id="article-filter-query"
          name="q"
          placeholder="主题、目标读者、核心问题、热点锚点"
          type="search"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="article-filter-topic-diagnosis">
          选题诊断
        </label>
        <select className="input" defaultValue={filters.topicDiagnosis} id="article-filter-topic-diagnosis" name="topicDiagnosis">
          <option value="">全部诊断状态</option>
          {TOPIC_DIAGNOSIS_FILTER_VALUES.map((value) => (
            <option key={value} value={value}>
              {TOPIC_DIAGNOSIS_FILTER_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="article-filter-status">
          流程状态
        </label>
        <select className="input" defaultValue={filters.status} id="article-filter-status" name="status">
          <option value="">全部流程状态</option>
          {ARTICLE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ARTICLE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="article-filter-actions">
        <button className="button" type="submit">
          <Search size={16} aria-hidden />
          筛选
        </button>
        {hasActiveFilters ? (
          <Link className="button secondary" href="/">
            <X size={16} aria-hidden />
            清除
          </Link>
        ) : null}
      </div>
    </form>
  );
}
