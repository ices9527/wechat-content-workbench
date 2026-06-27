import { ArticleList } from "@/components/article-list";
import type { ArticleStatus } from "@/domain/status";
import { ensureAppDataReady, listPublishQueueArticles } from "@/server/articles";

export const dynamic = "force-dynamic";

export default function PublishQueuePage() {
  ensureAppDataReady();
  const articles = listPublishQueueArticles();
  const groups: Array<{ title: string; statuses: ArticleStatus[]; hint: string }> = [
    { title: "待生成 HTML", statuses: ["ready_to_publish"], hint: "最终稿已确认，下一步生成公众号 HTML。" },
    { title: "待生成封面", statuses: ["publish_package_generated"], hint: "HTML 已生成，下一步生成 21:9 和 1:1 封面。" },
    { title: "待上传草稿箱", statuses: ["cover_generated"], hint: "发布资产齐备，下一步上传公众号草稿箱。" },
    {
      title: "待发布和复盘",
      statuses: ["uploaded_to_draft_box", "published_manually", "review_pending"],
      hint: "草稿箱之后仍由人工发布，再回填复盘数据。"
    }
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">Buffer View</p>
          <h1>发布队列</h1>
          <p className="subtle">集中处理 HTML、封面、草稿箱上传和复盘前的发布检查。</p>
        </div>
      </header>

      <div className="queue-groups">
        {groups.map((group) => {
          const groupArticles = articles.filter((article) => group.statuses.includes(article.status as ArticleStatus));
          return (
            <section className="panel" key={group.title}>
              <div className="queue-group-head">
                <div>
                  <h2 className="queue-group-title">{group.title}</h2>
                  <p className="subtle">{group.hint}</p>
                </div>
                <span className="status">{groupArticles.length} 篇</span>
              </div>
              <ArticleList articles={groupArticles} emptyText="这一组暂时没有文章。" />
            </section>
          );
        })}
      </div>
    </>
  );
}
