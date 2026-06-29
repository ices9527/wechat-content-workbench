import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { createDatabase, getDatabase, type WorkbenchDatabase } from "./client";
import { requirementPresets, stagePromptDefaults, users } from "./schema";

export const LOCAL_USER_ID = "local_user";

export const DEFAULT_STAGE_PROMPTS = [
  {
    stage: "outline",
    label: "主线提纲默认提示词",
    prompt: [
      "主线必须是一句话判断，不写成知识百科。",
      "提纲要围绕条件、路径、结果展开。",
      "先讲边界，再讲工具；每一节只承载一个判断。",
      "小标题要具体，避免空泛口号和资料堆砌。"
    ].join("\n")
  },
  {
    stage: "draft",
    label: "Markdown 文案默认提示词",
    prompt: [
      "文案要专业克制、温暖叙事，判断锋利但不夸张。",
      "开头进入真实问题，不用连续提问推进。",
      "短段落，一段一意，避免重复判断。",
      "不要使用口号排比，不承诺结果，不暗示绕开监管。"
    ].join("\n")
  },
  {
    stage: "ai_style_check",
    label: "文案清洁检查默认提示词",
    prompt: [
      "只检查表达层面的水分、AI 味、空话、套话、重复判断和模板句。",
      "不要替用户重写全文，不评价选题是否值得写，不替代 dbs-content 诊断。",
      "每个问题必须引用原文片段，说明为什么有问题，并给出具体修改方向。",
      "判断要克制，能保留的专业表达不要误判为水分。"
    ].join("\n")
  },
  {
    stage: "angle",
    label: "角度默认提示词",
    prompt: [
      "角度必须指向具体读者和真实场景。",
      "不要只复述热点，要把热点翻译成家庭决策、路径边界或风险识别。",
      "每个角度都要能说明读者为什么现在需要看。"
    ].join("\n")
  },
  {
    stage: "research",
    label: "内容研究默认提示词",
    prompt: [
      "只生成内容研究资料包，不写正文，不生成主线提纲。",
      "优先整理可核验事实、读者真实问题、路径边界、风险提醒和可写方向。",
      "不要把热点当结论，要说明它如何影响家庭决策、现金流安排或合规边界。",
      "复杂规则必须保留适用条件，不承诺速度、收益、身份、开户或审批结果。"
    ].join("\n")
  },
  {
    stage: "dbs",
    label: "dbs-content 默认提示词",
    prompt: [
      "诊断只指出具体问题和修改方向，不做泛泛表扬。",
      "优先检查 AI 味、重复判断、表达效率、标题承诺和认知落差。",
      "每个问题都要对应可执行的第一步。"
    ].join("\n")
  },
  {
    stage: "illustration_plan",
    label: "配图规划默认提示词",
    prompt: [
      "只规划正文配图，不生成图片，不修改正文。",
      "第一版建议 1-3 张，少而准。",
      "每张图必须绑定正文插入位置、图片作用、画面说明和风险边界。",
      "不要画成收益承诺、身份承诺、开户承诺、审批承诺、到账承诺或规避监管暗示。"
    ].join("\n")
  },
  {
    stage: "pre_publish",
    label: "发布前默认提示词",
    prompt: [
      "发布前先检查标题、首屏、封面、转发理由和预期阅读来源。",
      "判断要具体，不写成泛泛 checklist。",
      "如果某项缺失，要给出发布前可补的一步。"
    ].join("\n")
  },
  {
    stage: "review",
    label: "复盘默认提示词",
    prompt: [
      "低阅读归因按顺序检查：触达、分享、标题承诺、首屏、选题、正文表达。",
      "不要一上来归因到文笔。",
      "输出下一篇可复用的规则或提醒。"
    ].join("\n")
  }
] as const;

export const DEFAULT_REQUIREMENT_PRESETS = [
  {
    stableKey: "TOPIC-001",
    stage: "topic",
    category: "读者",
    type: "must",
    label: "目标读者具体",
    description: "选题必须指向能判断自身场景的具体读者。",
    promptFragment: "诊断时必须检查目标读者是否具体到能判断自己的生活场景、资金场景、家庭角色或决策处境；不要只接受“普通人”“中产家庭”这类泛泛读者。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "TOPIC-002",
    stage: "topic",
    category: "问题",
    type: "must",
    label: "真实问题成立",
    description: "选题要回答读者真实问题，不只是资料主题。",
    promptFragment: "诊断时必须判断这是不是读者真实会遇到的问题，而不是政策资料、产品说明或行业新闻本身。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "TOPIC-003",
    stage: "topic",
    category: "入口",
    type: "must",
    label: "今天点开理由",
    description: "说明读者为什么现在需要看。",
    promptFragment: "诊断时必须检查这个选题是否有今天点开的理由；热点只能作为入口，必须说明它和读者当前决策、风险或行动的关系。",
    defaultEnabled: true,
    priority: 30
  },
  {
    stableKey: "TOPIC-004",
    stage: "topic",
    category: "行动",
    type: "must",
    label: "落到家庭决策",
    description: "选题要能落到边界、选择或行动建议。",
    promptFragment: "诊断时必须判断选题能否落到家庭决策、路径边界、风险识别或下一步行动，而不是停留在知识解释。",
    defaultEnabled: true,
    priority: 40
  },
  {
    stableKey: "TOPIC-005",
    stage: "topic",
    category: "禁区",
    type: "avoid",
    label: "不要只追热点",
    description: "热点不能替代读者问题。",
    promptFragment: "如果选题只是复述热点、追新闻或借热点讲常识，请标记为需要修改，要求把热点翻译成读者具体问题。",
    defaultEnabled: false,
    priority: 50
  },
  {
    stableKey: "TOPIC-006",
    stage: "topic",
    category: "禁区",
    type: "avoid",
    label: "不要资料解释",
    description: "避免写成资料罗列或百科解释。",
    promptFragment: "如果选题容易写成资料罗列、百科解释或规则说明，请在风险中明确指出，并要求补上读者决策场景。",
    defaultEnabled: false,
    priority: 60
  },
  {
    stableKey: "TOPIC-007",
    stage: "topic",
    category: "合规",
    type: "compliance",
    label: "不承诺确定结果",
    description: "选题诊断阶段就避免绝对化承诺。",
    promptFragment: "诊断时检查选题是否暗示收益、速度、身份、审批、开户或其他确定结果；如果有，要提示改成条件化、边界化表达。",
    defaultEnabled: false,
    priority: 70
  },
  {
    stableKey: "TOPIC-008",
    stage: "topic",
    category: "传播",
    type: "check",
    label: "有转发对象",
    description: "判断文章未来是否容易被转给具体人群。",
    promptFragment: "诊断时检查这个选题是否有明确转发对象和转发理由；如果没有，请提示补强目标读者和使用场景。",
    defaultEnabled: false,
    priority: 80
  },
  {
    stableKey: "RESEARCH-001",
    stage: "research",
    category: "事实",
    type: "must",
    label: "只整理可核验事实",
    description: "资料包优先沉淀可核验事实，不把推断写成结论。",
    promptFragment: "内容研究必须优先整理可核验事实、已知条件和仍需确认的信息；不要把推断、猜测或宣传话术写成确定结论。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "RESEARCH-002",
    stage: "research",
    category: "读者",
    type: "must",
    label: "提炼读者真实问题",
    description: "研究要服务后续文章判断，而不是资料堆叠。",
    promptFragment: "内容研究必须提炼目标读者真正会问的问题，尤其是他们在家庭决策、资金路径、风险判断或下一步行动上的困惑。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "RESEARCH-003",
    stage: "research",
    category: "边界",
    type: "must",
    label: "标出路径边界",
    description: "把工具或方案放回适用条件中判断。",
    promptFragment: "内容研究必须标出路径边界、适用条件、限制条件和不适用场景；不要把工具效率写成无条件优势。",
    defaultEnabled: true,
    priority: 30
  },
  {
    stableKey: "RESEARCH-004",
    stage: "research",
    category: "风险",
    type: "compliance",
    label: "不承诺确定结果",
    description: "研究阶段就避免后续文章出现绝对化承诺。",
    promptFragment: "内容研究必须提醒不能承诺收益、速度、身份、开户、审批或监管结果；涉及结果时必须写成条件化、边界化表达。",
    defaultEnabled: true,
    priority: 40
  },
  {
    stableKey: "RESEARCH-005",
    stage: "research",
    category: "方向",
    type: "prefer",
    label: "输出可写和不可写方向",
    description: "资料包要帮助后续选择主线，不只是归档信息。",
    promptFragment: "内容研究要分别列出可写方向和不建议写的方向，并说明原因，方便后续主线提纲取舍。",
    defaultEnabled: true,
    priority: 50
  },
  {
    stableKey: "RESEARCH-006",
    stage: "research",
    category: "禁区",
    type: "avoid",
    label: "不要资料罗列",
    description: "避免把资料包写成百科或新闻摘要。",
    promptFragment: "不要把内容研究写成新闻摘要、政策资料罗列或知识百科；每条资料都要说明它和读者问题、判断边界或后续文章方向的关系。",
    defaultEnabled: false,
    priority: 60
  },
  {
    stableKey: "OUTLINE-001",
    stage: "outline",
    category: "主线",
    type: "must",
    label: "主线一句话判断",
    description: "主线要是一句明确判断，不写成资料主题。",
    promptFragment: "主线必须是一句话判断，不能写成资料摘要或知识百科标题。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "OUTLINE-002",
    stage: "outline",
    category: "结构",
    type: "prefer",
    label: "条件-路径-结果",
    description: "提纲尽量沿着条件、路径、结果展开。",
    promptFragment: "提纲优先使用条件、路径、结果的推进方式，让读者知道什么条件下应该怎么做、会得到什么结果。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "OUTLINE-003",
    stage: "outline",
    category: "边界",
    type: "must",
    label: "先讲边界再讲工具",
    description: "先说明适用边界，再讨论工具效率。",
    promptFragment: "先讲清楚适用边界，再讲工具；不要把工具效率写成无条件好处。",
    defaultEnabled: true,
    priority: 30
  },
  {
    stableKey: "OUTLINE-004",
    stage: "outline",
    category: "禁区",
    type: "avoid",
    label: "不写成知识百科",
    description: "避免变成资料罗列或概念解释。",
    promptFragment: "不要写成知识百科、政策资料罗列或概念解释，要围绕一个可判断的问题组织提纲。",
    defaultEnabled: true,
    priority: 40
  },
  {
    stableKey: "OUTLINE-005",
    stage: "outline",
    category: "结构",
    type: "must",
    label: "每节一个判断",
    description: "每一节只承载一个核心判断。",
    promptFragment: "每一节只承载一个判断，避免一个小节里同时塞多个方向。",
    defaultEnabled: true,
    priority: 50
  },
  {
    stableKey: "OUTLINE-006",
    stage: "outline",
    category: "标题",
    type: "prefer",
    label: "小标题具体",
    description: "小标题要能表达判断，不要空泛。",
    promptFragment: "小标题要具体，最好带出判断或边界，不要使用空泛口号。",
    defaultEnabled: true,
    priority: 60
  },
  {
    stableKey: "STYLE-001",
    stage: "draft",
    category: "风格",
    type: "must",
    label: "专业克制/温暖叙事",
    description: "保持专业、克制、有温度的表达。",
    promptFragment: "文案要专业克制、温暖叙事，判断锋利但不夸张。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "STYLE-002",
    stage: "draft",
    category: "风格",
    type: "prefer",
    label: "平实流畅，判断锋利",
    description: "表达要平实，但判断不能松。",
    promptFragment: "语言平实流畅，少用大词，但每一段都要有清楚判断。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "STYLE-003",
    stage: "draft",
    category: "内容密度",
    type: "prefer",
    label: "知识密度高",
    description: "每一段都要有信息量或判断价值。",
    promptFragment: "提高知识密度，减少空泛铺垫，每段都要提供判断、边界、例子或行动含义。",
    defaultEnabled: true,
    priority: 30
  },
  {
    stableKey: "STYLE-004",
    stage: "draft",
    category: "禁区",
    type: "avoid",
    label: "不要口号排比",
    description: "避免连续口号式排比和宣传腔。",
    promptFragment: "不要使用口号排比、宣传腔或过度煽动的表达。",
    defaultEnabled: true,
    priority: 40
  },
  {
    stableKey: "STYLE-005",
    stage: "draft",
    category: "禁区",
    type: "avoid",
    label: "禁用不是而是",
    description: "避免高频 AI 味句式。",
    promptFragment: "不要使用“不是……而是……”这种句式。",
    defaultEnabled: true,
    priority: 50
  },
  {
    stableKey: "STYLE-006",
    stage: "draft",
    category: "禁区",
    type: "avoid",
    label: "不要提问式推进",
    description: "避免连续用问题推动文章。",
    promptFragment: "不要用连续提问推进正文，问题只能少量使用，且必须马上给出判断。",
    defaultEnabled: true,
    priority: 60
  },
  {
    stableKey: "STYLE-007",
    stage: "draft",
    category: "结构",
    type: "avoid",
    label: "避免重复判断",
    description: "同一个判断不要反复换说法。",
    promptFragment: "避免重复判断，同一层意思不要换几种说法反复出现。",
    defaultEnabled: true,
    priority: 70
  },
  {
    stableKey: "STRUCT-001",
    stage: "draft",
    category: "结构",
    type: "prefer",
    label: "短段落一段一意",
    description: "段落要短，方便公众号阅读。",
    promptFragment: "使用短段落，一段一意，避免长段堆叠。",
    defaultEnabled: true,
    priority: 80
  },
  {
    stableKey: "HOOK-001",
    stage: "draft",
    category: "开头",
    type: "prefer",
    label: "开头进入真实问题",
    description: "不要资料化开头，要进入读者处境。",
    promptFragment: "开头直接进入真实问题或生活场景，不要从资料背景、政策介绍或宏大判断开始。",
    defaultEnabled: true,
    priority: 90
  },
  {
    stableKey: "COMP-001",
    stage: "draft",
    category: "合规",
    type: "compliance",
    label: "不承诺结果",
    description: "避免承诺收益、速度、身份或其他确定结果。",
    promptFragment: "不要承诺确定结果，不要暗示一定到账、一定获批、一定省钱或一定解决问题。",
    defaultEnabled: true,
    priority: 100
  },
  {
    stableKey: "COMP-002",
    stage: "draft",
    category: "合规",
    type: "compliance",
    label: "不暗示绕监管",
    description: "不写规避监管或绕开限制的暗示。",
    promptFragment: "不要暗示绕开监管、绕开规则、规避审查或利用灰色路径。",
    defaultEnabled: true,
    priority: 110
  },
  {
    stableKey: "AICLEAN-001",
    stage: "ai_style_check",
    category: "空话",
    type: "check",
    label: "检查空泛表达",
    description: "找出没有信息量、没有判断或没有行动含义的句子。",
    promptFragment: "检查文案中是否存在没有具体信息、没有判断、没有边界、没有例子或没有行动含义的空泛句子；必须引用原文片段。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "AICLEAN-002",
    stage: "ai_style_check",
    category: "AI 味",
    type: "check",
    label: "检查 AI 味套话",
    description: "识别常见 AI 式转折、总结和模板句。",
    promptFragment: "检查是否存在“值得注意的是”“综上所述”“不可否认的是”“在当今时代”“随着社会的发展”等 AI 味或模板化表达，并说明如何替换成具体判断。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "AICLEAN-003",
    stage: "ai_style_check",
    category: "重复",
    type: "check",
    label: "检查重复判断",
    description: "同一层意思不要反复换说法。",
    promptFragment: "检查文案是否反复表达同一个判断；如果有，请列出重复片段，并建议合并或删减的方向。",
    defaultEnabled: true,
    priority: 30
  },
  {
    stableKey: "AICLEAN-004",
    stage: "ai_style_check",
    category: "句式",
    type: "avoid",
    label: "检查车轱辘话",
    description: "识别绕圈、递进虚假、看似推进但信息不变的段落。",
    promptFragment: "检查是否存在车轱辘话、假递进或看似推进但信息没有增加的段落；建议保留哪一句判断、删去哪部分铺垫。",
    defaultEnabled: true,
    priority: 40
  },
  {
    stableKey: "AICLEAN-005",
    stage: "ai_style_check",
    category: "密度",
    type: "prefer",
    label: "提高信息密度",
    description: "每段最好有判断、边界、例子或行动含义。",
    promptFragment: "检查每段是否至少提供一种价值：判断、边界、例子、条件或行动含义；对信息密度低的段落给出补强方向。",
    defaultEnabled: true,
    priority: 50
  },
  {
    stableKey: "AICLEAN-006",
    stage: "ai_style_check",
    category: "边界",
    type: "compliance",
    label: "不误删必要边界",
    description: "清理水分时保留必要的谨慎表达和合规边界。",
    promptFragment: "清理建议不能把必要的适用条件、风险提示、合规边界或谨慎表达误删；如果某句虽然不短但承担边界说明，请标记为可保留。",
    defaultEnabled: true,
    priority: 60
  },
  {
    stableKey: "DBS-001",
    stage: "dbs",
    category: "检查",
    type: "check",
    label: "检查 AI 味套话",
    description: "检查空泛、模板化、AI 味明显的表达。",
    promptFragment: "检查文案是否存在空泛套话、AI 味转折、模板化总结和没有具体信息的句子。",
    defaultEnabled: false,
    priority: 10
  },
  {
    stableKey: "DBS-002",
    stage: "dbs",
    category: "检查",
    type: "check",
    label: "检查重复判断",
    description: "检查同一判断是否反复出现。",
    promptFragment: "检查文案是否反复表达同一个判断，指出重复片段并建议合并。",
    defaultEnabled: false,
    priority: 20
  },
  {
    stableKey: "ILLUS-001",
    stage: "illustration_plan",
    category: "数量",
    type: "must",
    label: "少而准",
    description: "正文配图第一版控制数量，避免装饰性堆图。",
    promptFragment: "配图规划第一版建议 1-3 张，只有在能明显帮助读者理解流程、边界、对比或结构时才建议配图。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "ILLUS-002",
    stage: "illustration_plan",
    category: "位置",
    type: "must",
    label: "绑定正文位置",
    description: "每张图都要有明确插入位置。",
    promptFragment: "每张配图必须绑定正文中的具体小标题、段落或判断句，不能只写“文章中间”。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "ILLUS-003",
    stage: "illustration_plan",
    category: "作用",
    type: "must",
    label: "说明图片作用",
    description: "图片必须服务读者理解。",
    promptFragment: "每张配图必须说明它帮助读者理解什么，优先服务路径、边界、条件、对比或行动步骤。",
    defaultEnabled: true,
    priority: 30
  },
  {
    stableKey: "ILLUS-004",
    stage: "illustration_plan",
    category: "合规",
    type: "compliance",
    label: "不画承诺结果",
    description: "避免视觉上暗示确定收益或确定身份路径。",
    promptFragment: "不要规划任何暗示收益、身份、开户、审批、到账或监管结果确定性的画面；涉及金融路径时必须画成条件化和边界化。",
    defaultEnabled: true,
    priority: 40
  },
  {
    stableKey: "ILLUS-005",
    stage: "illustration_plan",
    category: "禁区",
    type: "avoid",
    label: "不做装饰图",
    description: "避免只为好看而配图。",
    promptFragment: "不要建议纯装饰图、氛围图、金融符号堆叠图或没有信息结构的插画。",
    defaultEnabled: true,
    priority: 50
  },
  {
    stableKey: "ILLUS-006",
    stage: "illustration_plan",
    category: "类型",
    type: "prefer",
    label: "优先结构化图",
    description: "正文配图优先流程、边界、对比、结构。",
    promptFragment: "优先规划流程图、边界清单图、条件对比图、路径结构图，而不是人物摆拍或复杂场景插画。",
    defaultEnabled: false,
    priority: 60
  },
  {
    stableKey: "PUB-001",
    stage: "pre_publish",
    category: "标题",
    type: "check",
    label: "有今天点开的理由",
    description: "标题和首屏要让读者知道为什么现在要看。",
    promptFragment: "检查标题和首屏是否有今天点开的理由，是否能快速说明这篇文章和读者当下有什么关系。",
    defaultEnabled: true,
    priority: 10
  },
  {
    stableKey: "PUB-002",
    stage: "pre_publish",
    category: "首屏",
    type: "check",
    label: "首屏不要资料化",
    description: "首屏不要像资料说明书。",
    promptFragment: "检查首屏是否资料化、政策化、背景化，优先让首屏呈现真实问题和核心判断。",
    defaultEnabled: true,
    priority: 20
  },
  {
    stableKey: "ANGLE-001",
    stage: "angle",
    category: "读者",
    type: "must",
    label: "明确具体读者",
    description: "不要只写抽象话题，要说清这篇写给谁。",
    promptFragment: "生成角度时，每个角度必须指向一个具体读者群体，例如一线城市家庭、有孩子的家庭、跨境家庭、留学家庭、企业主家庭或准备做身份规划的家庭。",
    defaultEnabled: false,
    priority: 10
  },
  {
    stableKey: "ANGLE-002",
    stage: "angle",
    category: "入口",
    type: "must",
    label: "找到现实入口",
    description: "长期知识要有当下事件、生活场景或读者正在遇到的问题作为入口。",
    promptFragment: "每个角度都要说明读者为什么现在会关心这个问题，避免只做抽象知识解释。",
    defaultEnabled: false,
    priority: 20
  },
  {
    stableKey: "ANGLE-003",
    stage: "angle",
    category: "禁区",
    type: "avoid",
    label: "不要只追热点",
    description: "热点只是入口，文章要落到家庭决策、路径边界或风险识别。",
    promptFragment: "不要把文章写成热点复述；请把热点翻译成普通家庭的风险、选择、行动或长期安排。",
    defaultEnabled: false,
    priority: 30
  },
  {
    stableKey: "ANGLE-004",
    stage: "angle",
    category: "传播",
    type: "check",
    label: "有转发对象",
    description: "让读者能想到这篇可以转给谁。",
    promptFragment: "生成角度时，请说明这个角度适合被转发给哪类人，以及转发理由是什么。",
    defaultEnabled: false,
    priority: 40
  },
  {
    stableKey: "ANGLE-005",
    stage: "angle",
    category: "类型",
    type: "prefer",
    label: "标记选题类型",
    description: "区分热点解释、决策指南、避坑提醒、案例复盘、长期知识。",
    promptFragment: "为每个角度标注选题类型，并说明它适合做成热点解释、决策指南、避坑提醒、案例复盘还是长期知识。",
    defaultEnabled: false,
    priority: 50
  },
  {
    stableKey: "OUTLINE-007",
    stage: "outline",
    category: "边界",
    type: "must",
    label: "需求和路径分开",
    description: "合理需求存在，不代表所有路径都合规或适合。",
    promptFragment: "请区分合理投资、教育、医疗、资产配置需求，与具体路径是否合规、是否适合当前身份和资金来源。",
    defaultEnabled: false,
    priority: 70
  },
  {
    stableKey: "STYLE-010",
    stage: "draft",
    category: "视角",
    type: "prefer",
    label: "家庭资产顾问视角",
    description: "作者像家庭资产顾问，不像销售，也不像吓人的财经号。",
    promptFragment: "文章要体现家庭资产顾问视角，围绕家庭现金流、保障底线、教育金、医疗保障、美元资产、身份安排和长期选择权展开。",
    defaultEnabled: false,
    priority: 120
  },
  {
    stableKey: "STYLE-011",
    stage: "draft",
    category: "风格",
    type: "avoid",
    label: "不要教育读者",
    description: "用顾问式解释替代居高临下的教训。",
    promptFragment: "不要教育读者，不要居高临下，用平易近人的讲解语气。",
    defaultEnabled: false,
    priority: 130
  },
  {
    stableKey: "HOOK-003",
    stage: "draft",
    category: "开头",
    type: "prefer",
    label: "优先生活场景",
    description: "家庭资产类文章优先从家庭账单、孩子教育、医疗支出、现金流压力等场景进入。",
    promptFragment: "如果适合，请从具体家庭生活场景切入，例如学费、医疗账单、家庭现金流、孩子教育节点或跨境付款。",
    defaultEnabled: false,
    priority: 140
  },
  {
    stableKey: "COMP-003",
    stage: "draft",
    category: "合规",
    type: "avoid",
    label: "不做恐慌销售",
    description: "教育型内容不用恐惧驱动成交。",
    promptFragment: "使用教育型表达，不要用“马上行动否则来不及”等恐慌式销售语言。",
    defaultEnabled: false,
    priority: 150
  },
  {
    stableKey: "COMP-005",
    stage: "draft",
    category: "合规",
    type: "must",
    label: "需求和路径分开",
    description: "合理需求存在，不代表所有路径都合规或适合。",
    promptFragment: "请区分合理投资、教育、医疗、资产配置需求，与具体路径是否合规、是否适合当前身份和资金来源。",
    defaultEnabled: false,
    priority: 160
  },
  {
    stableKey: "COMP-006",
    stage: "draft",
    category: "合规",
    type: "compliance",
    label: "用谨慎表达",
    description: "复杂领域要留出适用条件。",
    promptFragment: "必要时使用“可能”“需要观察”“取决于具体情况”“建议结合个人情况评估”等表达。",
    defaultEnabled: false,
    priority: 170
  },
  {
    stableKey: "BAN-001",
    stage: "draft",
    category: "禁用词",
    type: "avoid",
    label: "禁 AI 味套话",
    description: "避免模板化、空泛和常见 AI 味表达。",
    promptFragment: "避免“综上所述”“值得注意的是”“不可否认的是”“在当今时代”“随着社会的发展”“打造闭环”“赋能”“底层逻辑”“深度解析”“全方位、多维度”“引发广泛关注”。",
    defaultEnabled: false,
    priority: 180
  },
  {
    stableKey: "BAN-002",
    stage: "draft",
    category: "禁用词",
    type: "avoid",
    label: "禁财富号夸张词",
    description: "避免财富号、理财号常见夸张词。",
    promptFragment: "避免“财富自由”“躺赚”“暴富”“稳赚”“高收益”“闭眼买”“必买”“顶配方案”“保险神器”“全网最全”“普通人逆袭”。",
    defaultEnabled: false,
    priority: 190
  },
  {
    stableKey: "BAN-003",
    stage: "draft",
    category: "禁用词",
    type: "compliance",
    label: "禁绝对化风险词",
    description: "避免绝对安全、唯一选择、官方背书等高风险表达。",
    promptFragment: "避免“绝对安全”“监管无法追踪”“一定可以规避”“唯一选择”“官方认可某具体产品”。",
    defaultEnabled: false,
    priority: 200
  },
  {
    stableKey: "READER-001",
    stage: "draft",
    category: "读者",
    type: "prefer",
    label: "一线城市家庭",
    description: "不要泛泛写普通人，优先落到真实家庭处境。",
    promptFragment: "优先使用一线城市家庭、中产家庭、有孩子的家庭、新手父母、留学家庭、跨境家庭等具体读者表达，不要泛泛写“普通人”。",
    defaultEnabled: false,
    priority: 210
  },
  {
    stableKey: "READER-002",
    stage: "draft",
    category: "场景",
    type: "prefer",
    label: "家庭现金流",
    description: "把产品和通道放回家庭现金流顺序里判断。",
    promptFragment: "围绕家庭现金流、收入中断、房贷、学费、医疗支出、备用金和长期缴费来判断工具或产品的意义。",
    defaultEnabled: false,
    priority: 220
  },
  {
    stableKey: "READER-003",
    stage: "draft",
    category: "场景",
    type: "prefer",
    label: "孩子的选择权",
    description: "教育金和教育规划写成保留选择权，不写成买名校门票。",
    promptFragment: "写教育金、香港教育或家庭资产文章时，把重点放在给孩子留选择、路径多、试错窗口、教育节点和长期安排上。",
    defaultEnabled: false,
    priority: 230
  },
  {
    stableKey: "READER-004",
    stage: "draft",
    category: "场景",
    type: "prefer",
    label: "跨境家庭路径",
    description: "跨境工具要写成有条件、有用途、有边界的生活或规划工具。",
    promptFragment: "写跨境支付、身份、教育或保险时，围绕身份安排、账户路径、资金用途、合规追问和路径边界展开。",
    defaultEnabled: false,
    priority: 240
  },
  {
    stableKey: "DBS-003",
    stage: "dbs",
    category: "检查",
    type: "check",
    label: "检查表达效率",
    description: "检查是否用大量文字包装很少内容。",
    promptFragment: "检查文案能不能一句话说清核心观点，有没有用大量文字包装很少内容。",
    defaultEnabled: false,
    priority: 30
  },
  {
    stableKey: "DBS-004",
    stage: "dbs",
    category: "检查",
    type: "check",
    label: "检查认知落差",
    description: "检查读者是否会觉得这个我早知道。",
    promptFragment: "检查读者看完会不会觉得“这个我早知道”，文章有没有把同行没讲清的地方讲清。",
    defaultEnabled: false,
    priority: 40
  },
  {
    stableKey: "DBS-005",
    stage: "dbs",
    category: "检查",
    type: "must",
    label: "只要问题不要泛夸",
    description: "dbs-content 输出具体问题和修改建议，不做泛泛表扬。",
    promptFragment: "请只输出具体问题和修改建议，不要泛泛表扬。",
    defaultEnabled: false,
    priority: 50
  },
  {
    stableKey: "TITLE-002",
    stage: "pre_publish",
    category: "标题",
    type: "prefer",
    label: "标题有具体对象",
    description: "家长、港漂、跨境家庭等对象越具体，点击理由越清楚。",
    promptFragment: "标题尽量包含或暗示具体对象，例如家长、港漂、跨境家庭、有孩子的家庭、企业主家庭或家庭资产规划人群。",
    defaultEnabled: false,
    priority: 30
  },
  {
    stableKey: "TITLE-003",
    stage: "pre_publish",
    category: "标题",
    type: "prefer",
    label: "决策型标题",
    description: "标题优先承诺读者会获得什么判断或避免什么损失。",
    promptFragment: "标题优先表达读者会获得什么判断、避免什么损失、看懂什么边界，而不是只说明文章主题。",
    defaultEnabled: false,
    priority: 40
  },
  {
    stableKey: "TITLE-004",
    stage: "pre_publish",
    category: "标题",
    type: "must",
    label: "有判断不标题党",
    description: "标题要有力量，但不能夸张承诺。",
    promptFragment: "标题要有判断力，但不要标题党，不要夸大收益、确定性或政策结果。",
    defaultEnabled: false,
    priority: 50
  },
  {
    stableKey: "HOOK-002",
    stage: "pre_publish",
    category: "首屏",
    type: "check",
    label: "首屏 3 秒能看懂",
    description: "读者点开后要马上知道文章讲什么、为什么值得看。",
    promptFragment: "请检查首屏 3 秒内是否能看懂文章主题和继续阅读理由。",
    defaultEnabled: false,
    priority: 60
  },
  {
    stableKey: "PUB-003",
    stage: "pre_publish",
    category: "分发",
    type: "check",
    label: "准备转发理由",
    description: "检查是否有一句适合转发时附带的话。",
    promptFragment: "检查文中是否有一句适合转发时附带的话，是否有帮别人避坑的角度。",
    defaultEnabled: false,
    priority: 70
  },
  {
    stableKey: "PUB-004",
    stage: "pre_publish",
    category: "结尾",
    type: "prefer",
    label: "结尾有下一步",
    description: "结尾给出明确但不强推的下一步。",
    promptFragment: "结尾给出明确但不强推的下一步，例如先做家庭现金流 Review、核验路径边界或整理家庭资产结构。",
    defaultEnabled: false,
    priority: 80
  },
  {
    stableKey: "PUB-005",
    stage: "pre_publish",
    category: "分发",
    type: "check",
    label: "确认通知状态",
    description: "低阅读先查触达，不先怪内容。",
    promptFragment: "发布前确认这篇是否通知订阅用户；如果不通知，请记录其他分发方式。",
    defaultEnabled: false,
    priority: 90
  },
  {
    stableKey: "PUB-006",
    stage: "pre_publish",
    category: "分发",
    type: "must",
    label: "记录阅读来源",
    description: "记录预期首日阅读来源。",
    promptFragment: "请记录这篇的预期首日阅读来源，例如通知、朋友圈、社群、私聊、合集、菜单或二次分发。",
    defaultEnabled: false,
    priority: 100
  },
  {
    stableKey: "COVER-003",
    stage: "pre_publish",
    category: "封面",
    type: "check",
    label: "手机端可读",
    description: "检查首图是否过于密集，手机端是否读得清。",
    promptFragment: "检查首图是否过于密集，是否在手机端难以读懂。",
    defaultEnabled: false,
    priority: 110
  },
  {
    stableKey: "REVIEW-001",
    stage: "review",
    category: "归因",
    type: "must",
    label: "按顺序归因",
    description: "低阅读先查触达，再查分享，再查选题，最后查文笔。",
    promptFragment: "低阅读归因按顺序检查：是否通知、是否有分享、是否有热点锚点、标题承诺、首屏吸引力、内容表达。",
    defaultEnabled: false,
    priority: 10
  },
  {
    stableKey: "REVIEW-002",
    stage: "review",
    category: "归因",
    type: "check",
    label: "先看分享",
    description: "分享不足时不要先把低阅读归因到文笔。",
    promptFragment: "如果分享数为 0 或明显低于高阅读文章，不要先把低阅读归因到文笔。",
    defaultEnabled: false,
    priority: 20
  },
  {
    stableKey: "REVIEW-003",
    stage: "review",
    category: "标题",
    type: "check",
    label: "检查标题承诺",
    description: "检查标题是否清楚承诺读者会获得什么或避免什么损失。",
    promptFragment: "检查标题是否清楚承诺读者会获得什么，或避免什么损失。",
    defaultEnabled: false,
    priority: 30
  },
  {
    stableKey: "REVIEW-004",
    stage: "review",
    category: "内容",
    type: "check",
    label: "检查解释型过重",
    description: "检查文章是否讲清规则但没有翻译成读者行动。",
    promptFragment: "检查文章是否讲清规则但没有翻译成读者的风险、选择和行动。",
    defaultEnabled: false,
    priority: 40
  }
] as const;

export function seedDatabase(db: WorkbenchDatabase): void {
  const existing = db.select().from(users).where(eq(users.id, LOCAL_USER_ID)).get();
  if (!existing) {
    db.insert(users).values({ id: LOCAL_USER_ID, displayName: "本地用户" }).run();
  }

  for (const defaultPrompt of DEFAULT_STAGE_PROMPTS) {
    const existingPrompt = db
      .select()
      .from(stagePromptDefaults)
      .where(eq(stagePromptDefaults.stage, defaultPrompt.stage))
      .get();
    if (!existingPrompt) {
      db.insert(stagePromptDefaults)
        .values({
          id: `${LOCAL_USER_ID}_${defaultPrompt.stage}`,
          ownerId: LOCAL_USER_ID,
          stage: defaultPrompt.stage,
          label: defaultPrompt.label,
          prompt: defaultPrompt.prompt,
          enabled: true
        })
        .run();
    }
  }

  for (const preset of DEFAULT_REQUIREMENT_PRESETS) {
    const existingPreset = db
      .select()
      .from(requirementPresets)
      .where(and(eq(requirementPresets.ownerId, LOCAL_USER_ID), eq(requirementPresets.stableKey, preset.stableKey)))
      .get();
    if (!existingPreset) {
      db.insert(requirementPresets)
        .values({
          id: `${LOCAL_USER_ID}_${preset.stableKey}`,
          stableKey: preset.stableKey,
          ownerId: LOCAL_USER_ID,
          stage: preset.stage,
          category: preset.category,
          type: preset.type,
          label: preset.label,
          description: preset.description,
          promptFragment: preset.promptFragment,
          defaultEnabled: preset.defaultEnabled,
          enabled: true,
          priority: preset.priority,
          source: "seed",
          archivedAt: null
        })
        .run();
    }
  }
}

export function ensureSeeded(): void {
  const { db } = getDatabase();
  seedDatabase(db);
}

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  const { db, sqlite } = createDatabase();
  seedDatabase(db);
  sqlite.close();
  console.log("Database seeded.");
}
