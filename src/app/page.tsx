import { ArticleList } from "@/components/article-list";
import { NewArticleForm } from "@/components/new-article-form";
import { ensureAppDataReady, listArticles } from "@/server/articles";

export const dynamic = "force-dynamic";

export default function WorkbenchPage() {
  ensureAppDataReady();
  const articles = listArticles();

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
          <ArticleList articles={articles} />
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
