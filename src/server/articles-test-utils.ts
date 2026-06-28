import type { createTestDatabase } from "@/test/test-db";

import { FakeAIClient, type GeneratedTopicDiagnosis } from "./ai";
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

export class HoldTopicDiagnosisClient extends FakeAIClient {
  async diagnoseTopic(): Promise<GeneratedTopicDiagnosis> {
    return {
      verdict: "hold",
      targetReaderCheck: "目标读者还不够具体。",
      readerProblemCheck: "真实问题没有压实。",
      timelinessCheck: "今天点开的理由不足。",
      actionabilityCheck: "暂时不适合进入后续生产流程。",
      riskSummary: "继续写容易变成资料解释。",
      suggestionsMarkdown: "## 暂缓建议\n- 先补清楚读者为什么今天要看。",
      nextAction: "修改主题或重新运行选题诊断。"
    };
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
