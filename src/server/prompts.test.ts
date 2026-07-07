import { describe, expect, it } from "vitest";

import { buildLayeredPrompt, renderPrompt } from "./prompts";

describe("prompt templates", () => {
  it("renders prompt variables", () => {
    const prompt = renderPrompt("generate_outline", {
      topic: "跨境支付通",
      angleTitle: "速度不是重点",
      readerPain: "不知道怎么判断",
      promise: "看懂背后变化",
      researchSummary: ""
    });

    expect(prompt).toContain("跨境支付通");
    expect(prompt).toContain("速度不是重点");
    expect(prompt).toContain("必须只输出 JSON");
    expect(prompt).toContain("mainline");
    expect(prompt).toContain("outlineMarkdown");
  });

  it("fails when variables are missing", () => {
    expect(() => renderPrompt("generate_draft", { topic: "香港教育" })).toThrow("Missing prompt variable");
  });

  it("renders draft prompt with strict JSON markdown output", () => {
    const prompt = renderPrompt("generate_draft", {
      topic: "香港账户",
      mainline: "账户只是工具，路径才是判断。",
      outlineMarkdown: "## 一、先讲开户误解"
    });

    expect(prompt).toContain("必须只输出 JSON");
    expect(prompt).toContain("markdown：完整公众号 Markdown 初稿");
    expect(prompt).toContain("不要只返回提纲或摘要");
  });

  it("renders ai style check prompt without rewriting the draft", () => {
    const prompt = renderPrompt("ai_style_check", {
      title: "跨境支付通火了",
      topic: "跨境支付通",
      targetReader: "跨境家庭",
      coreProblem: "资金路径是否更可操作",
      customInstruction: "重点检查重复判断。",
      selectedRequirementsSummary: "检查空话、AI 味和重复。",
      draftMarkdown: "# 跨境支付通\n\n真正改变的不是速度，而是路径。"
    });

    expect(prompt).toContain("文案清洁检查");
    expect(prompt).toContain("不改写全文");
    expect(prompt).toContain("不评价选题是否值得写");
    expect(prompt).toContain("不替代选题、主线或发布前质量门");
    expect(prompt).toContain("只诊断这篇 Markdown 文案的表达层水分");
    expect(prompt).toContain("verdict：只能是 clean、minor、needs_cleanup、heavy_slop");
    expect(prompt).toContain("issues：问题列表");
  });

  it("renders illustration planning prompt without generating images", () => {
    const prompt = renderPrompt("illustration_plan", {
      title: "香港账户还能不能开",
      targetReader: "跨境家庭",
      coreProblem: "资金路径是否可解释",
      mainline: "账户只是工具，路径才是判断。",
      customInstruction: "只做流程图。",
      selectedRequirementsSummary: "少而准：建议 1-3 张。",
      complianceBoundaries: "- 不承诺开户结果。",
      finalMarkdown: "# 香港账户还能不能开\n\n正文内容"
    });

    expect(prompt).toContain("正文配图规划助手");
    expect(prompt).toContain("不生成图片");
    expect(prompt).toContain("不修改正文");
    expect(prompt).toContain("建议 1-3 张");
    expect(prompt).toContain("合规和表达边界");
    expect(prompt).toContain("不承诺开户结果");
    expect(prompt).toContain("items：配图规划数组");
    expect(prompt).toContain("# 香港账户还能不能开");
  });

  it("renders topic diagnosis as a strict gate prompt", () => {
    const prompt = renderPrompt("topic_diagnosis", {
      topic: "香港账户还能不能开",
      targetReader: "跨境家庭",
      coreProblem: "资金路径是否可解释",
      hotAnchor: "开户变难"
    });

    expect(prompt).toContain("只判断这个选题是否值得进入公众号生产线");
    expect(prompt).toContain("不生成角度");
    expect(prompt).toContain("不写正文");
    expect(prompt).toContain("verdict：只能是 pass、revise、hold、drop");
    expect(prompt).toContain("今天点开的理由判断");
  });

  it("renders content research as a research package prompt", () => {
    const prompt = renderPrompt("content_research", {
      topic: "跨境支付通",
      targetReader: "跨境家庭",
      coreProblem: "资金路径是否更可操作",
      hotAnchor: "支付工具上线",
      angleTitle: "速度只是表层",
      readerPain: "只看到到账快",
      promise: "看懂家庭现金流边界",
      risk: "避免写成投资通道"
    });

    expect(prompt).toContain("内容研究资料包");
    expect(prompt).toContain("不写正文");
    expect(prompt).toContain("不生成主线提纲");
    expect(prompt).toContain("factsMarkdown");
    expect(prompt).toContain("summaryMarkdown");
  });

  it("renders outline prompt with optional research summary", () => {
    const prompt = renderPrompt("generate_outline", {
      topic: "跨境支付通",
      angleTitle: "速度不是重点",
      readerPain: "不知道怎么判断",
      promise: "看懂背后变化",
      researchSummary: "## 内容研究资料包摘要\n家庭现金流和边界是重点。"
    });

    expect(prompt).toContain("内容研究资料包摘要");
    expect(prompt).toContain("家庭现金流和边界是重点");
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
