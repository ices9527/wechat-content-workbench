"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function NewArticleForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      topic: String(formData.get("topic") || ""),
      targetReader: String(formData.get("targetReader") || ""),
      coreProblem: String(formData.get("coreProblem") || ""),
      hotAnchor: String(formData.get("hotAnchor") || "")
    };

    const response = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = (await response.json()) as { id?: string; error?: string };
    setPending(false);

    if (!response.ok || !result.id) {
      setError(result.error || "创建文章失败");
      return;
    }

    router.refresh();
    router.push(`/articles/${result.id}`);
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        <span className="label">主题</span>
        <input className="input" name="topic" placeholder="例如：跨境支付通真正改变了什么" required />
      </label>
      <label className="field">
        <span className="label">目标读者</span>
        <input className="input" name="targetReader" placeholder="例如：有跨境资产安排的家庭" />
      </label>
      <label className="field">
        <span className="label">核心问题</span>
        <textarea className="textarea" name="coreProblem" placeholder="这篇文章要帮读者解决什么判断问题？" />
      </label>
      <label className="field">
        <span className="label">热点锚点</span>
        <input className="input" name="hotAnchor" placeholder="可选：政策、新闻、近期讨论" />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "创建中" : "新建文章"}
      </button>
    </form>
  );
}
