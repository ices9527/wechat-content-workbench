import type { createTestDatabase } from "@/test/test-db";

import { FakeAIClient } from "./ai";
import { acceptOutline, createArticle, createManualAngle, generateDraft, generateOutline, selectAngle } from "./articles";

type TestDatabase = ReturnType<typeof createTestDatabase>["db"];

export { FakeAIClient };

export async function createArticleWithDraft(db: TestDatabase) {
  const article = createArticle({ topic: "跨境支付通" }, db);
  const angle = createManualAngle(article.id, { angleTitle: "速度只是第一眼" }, db);
  selectAngle(article.id, angle.id, db);
  const outline = await generateOutline(article.id, new FakeAIClient(), db);
  acceptOutline(article.id, outline.id, db);
  const draft = await generateDraft(article.id, new FakeAIClient(), db);
  return { article, draft };
}

export class FailingTopicDiagnosisClient extends FakeAIClient {
  async diagnoseTopic(): Promise<never> {
    throw new Error("topic diagnosis unavailable");
  }
}

export class IncompleteOutlineClient extends FakeAIClient {
  async generateOutline() {
    return {
      mainline: "",
      outlineMarkdown: "## 只有提纲，没有主线"
    };
  }
}

export class EmptyDraftClient extends FakeAIClient {
  async generateDraft() {
    return {
      markdown: ""
    };
  }
}
