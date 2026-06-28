import Link from "next/link";

import type { ArticleListItem } from "@/server/articles";

import { StatusBadge } from "./status-badge";

export function ArticleList({ articles, emptyText = "还没有文章。先从右侧新建一个主题。" }: { articles: ArticleListItem[]; emptyText?: string }) {
  if (articles.length === 0) {
    return <div className="empty">{emptyText}</div>;
  }

  return (
    <div className="article-list">
      {articles.map((article) => (
        <Link className="article-row" href={`/articles/${article.id}`} key={article.id}>
          <div>
            <h3 className="article-title">{article.title}</h3>
            <p className="article-meta">{article.topic}</p>
          </div>
          <StatusBadge label={article.statusLabel} />
          <div
            className={`topic-diagnosis-badge ${
              article.latestTopicDiagnosis ? `verdict-${article.latestTopicDiagnosis.verdict}` : "verdict-missing"
            }`}
            title={article.latestTopicDiagnosis?.riskSummary || "还没有运行选题诊断"}
          >
            <span>选题诊断</span>
            <strong>{article.latestTopicDiagnosis?.verdictLabel || "未诊断"}</strong>
          </div>
          <div className="next-action">{article.nextAction}</div>
        </Link>
      ))}
    </div>
  );
}
