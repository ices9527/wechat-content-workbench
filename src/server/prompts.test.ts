import { describe, expect, it } from "vitest";

import { buildLayeredPrompt, renderPrompt } from "./prompts";

describe("prompt templates", () => {
  it("renders prompt variables", () => {
    const prompt = renderPrompt("generate_outline", {
      topic: "跨境支付通",
      angleTitle: "速度不是重点",
      readerPain: "不知道怎么判断",
      promise: "看懂背后变化"
    });

    expect(prompt).toContain("跨境支付通");
    expect(prompt).toContain("速度不是重点");
  });

  it("fails when variables are missing", () => {
    expect(() => renderPrompt("generate_draft", { topic: "香港教育" })).toThrow("Missing prompt variable");
  });

  it("renders dbs-content diagnosis requirements", () => {
    const prompt = renderPrompt("dbs_content", {
      topic: "跨境支付通",
      versionNo: "1",
      markdown: "# 跨境支付通"
    });

    expect(prompt).toContain("dontbesilent");
    expect(prompt).toContain("文字洁癖");
    expect(prompt).toContain("diagnosisMarkdown");
    expect(prompt).toContain("AI 痕迹");
  });

  it("renders revision prompt with diagnosis source", () => {
    const prompt = renderPrompt("revise_from_diagnosis", {
      topic: "跨境支付通",
      versionNo: "1",
      markdown: "# 原稿",
      diagnosisMarkdown: "# 诊断"
    });

    expect(prompt).toContain("dbs-content 诊断");
    expect(prompt).toContain("# 原稿");
    expect(prompt).toContain("# 诊断");
  });

  it("renders pre-publish and review check prompts", () => {
    const prePublish = renderPrompt("pre_publish_check", {
      topic: "跨境支付通",
      title: "跨境支付通火了",
      versionNo: "2",
      htmlAssetCount: "1",
      coverAssetCount: "2",
      uploadStatus: "未上传草稿箱",
      markdown: "# 最终稿"
    });
    const review = renderPrompt("review_check", {
      topic: "跨境支付通",
      title: "跨境支付通火了",
      versionNo: "2",
      status: "待复盘",
      uploadStatus: "已上传草稿箱",
      markdown: "# 最终稿"
    });

    expect(prePublish).toContain("发布前检查摘要");
    expect(prePublish).toContain("summaryMarkdown");
    expect(review).toContain("复盘归因检查清单");
    expect(review).toContain("先看触达");
  });

  it("builds layered generation prompts in a stable order", () => {
    const prompt = buildLayeredPrompt("基础任务", {
      stageDefaultPrompt: "阶段默认要求",
      selectedRequirements: [
        { label: "第二", promptFragment: "后执行", priority: 20 },
        { label: "第一", promptFragment: "先执行", priority: 10 }
      ],
      customInstruction: "本次特别要求"
    });

    expect(prompt).toContain("## 阶段默认生成要求\n阶段默认要求");
    expect(prompt).toContain("## 本次必须遵守的生成要求\n- 第一：先执行\n- 第二：后执行");
    expect(prompt).toContain("## 用户本次额外约束\n本次特别要求");
    expect(prompt.indexOf("基础任务")).toBeLessThan(prompt.indexOf("阶段默认生成要求"));
    expect(prompt.indexOf("阶段默认生成要求")).toBeLessThan(prompt.indexOf("本次必须遵守的生成要求"));
    expect(prompt.indexOf("本次必须遵守的生成要求")).toBeLessThan(prompt.indexOf("用户本次额外约束"));
  });
});
