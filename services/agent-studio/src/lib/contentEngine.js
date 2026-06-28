import { agentStages, directionLibrary, platformMeta, rubric, toneProfiles } from "./catalog.js";

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function pick(arr, seed) {
  return arr[seed % arr.length];
}

export function cleanTopic(topic) {
  return (topic || "").trim().replace(/[。！？!?\s]+$/g, "");
}

export function detectDomain(topic) {
  const t = String(topic || "").toLowerCase();
  if (/(ai|大模型|gpt|llm|agent|prompt|claude|sora)/i.test(t)) return "ai";
  if (/(健身|减脂|跑步|瑜伽|增肌|燃脂)/.test(t)) return "fitness";
  if (/(穿搭|衣服|风格|outfit|搭配|时尚)/.test(t)) return "fashion";
  if (/(美食|食谱|做菜|减脂餐|烘焙|料理)/.test(t)) return "food";
  if (/(创业|副业|赚钱|自媒体|商业|增长)/.test(t)) return "business";
  if (/(面试|简历|求职|跳槽|offer|职业|工作)/.test(t)) return "career";
  if (/(旅行|攻略|城市|周边|hostel|民宿)/.test(t)) return "travel";
  if (/(母婴|育儿|宝宝|早教)/.test(t)) return "parenting";
  if (/(投资|理财|股票|基金|加密)/.test(t)) return "finance";
  if (/(读书|书单|阅读|笔记)/.test(t)) return "reading";
  return "general";
}

export const domainLexicon = {
  ai: { audience: "AI 从业者 / 早期用户", concept: "心智模型", verb: "拆解", unit: "工作流", win: "效率翻倍" },
  fitness: { audience: "想瘦 / 想练的人", concept: "训练原理", verb: "实操", unit: "动作组", win: "围度变化" },
  fashion: { audience: "审美进阶人群", concept: "搭配公式", verb: "示范", unit: "look", win: "回头率" },
  food: { audience: "下厨爱好者", concept: "风味结构", verb: "试做", unit: "配方", win: "复刻成功" },
  business: { audience: "想自我雇佣的人", concept: "增长模型", verb: "复盘", unit: "案例", win: "正现金流" },
  career: { audience: "正在求职的人", concept: "面试官心智", verb: "翻译", unit: "话术", win: "拿到 offer" },
  travel: { audience: "想松一下的人", concept: "目的地节奏", verb: "踩点", unit: "路线", win: "不踩雷" },
  parenting: { audience: "新手父母", concept: "发展窗口", verb: "拆解", unit: "互动", win: "孩子主动" },
  finance: { audience: "想保住钱的人", concept: "资产配置", verb: "推演", unit: "策略", win: "睡得着" },
  reading: { audience: "想读完书的人", concept: "结构笔记", verb: "提炼", unit: "卡片", win: "真的吸收" },
  general: { audience: "感兴趣的人", concept: "底层逻辑", verb: "拆解", unit: "方法", win: "立刻能用" }
};

const fillerTerms = [
  "赋能", "探索", "共创", "破局", "生态", "闭环思维", "底层能力全面升级",
  "大多数人", "底层逻辑", "重塑", "颠覆", "降本增效", "全链路", "抓手", "矩阵"
];

const privateTerms = [
  "服务器地址", "域名", "后台地址", "接口地址", "token", "api key", "apikey", "cookie",
  "密码", "账号", "订单", "购买记录", "真实姓名", "手机号", "身份证"
];

const unsafePublicTerms = [
  ["亚洲", "AV"].join(""), "无码视频", "成人内容", "成人视频", "色情", "情色", "黄网", "黄网站",
  "约炮", "裸聊", "博彩", "赌博"
];

function contentRiskFlags(copy) {
  const flags = [];
  const source = Array.isArray(copy) ? copy.join("\n") : String(copy || "");
  for (const term of fillerTerms) {
    if (source.includes(term)) flags.push(`疑似模板/AI 味：${term}`);
  }
  for (const term of privateTerms) {
    if (source.toLowerCase().includes(term.toLowerCase())) flags.push(`可能涉及隐私或基础设施信息：${term}`);
  }
  for (const term of unsafePublicTerms) {
    if (source.toLowerCase().includes(term.toLowerCase())) flags.push(`不适合公开发布的敏感词：${term}`);
  }
  if (source.length < 80) flags.push("正文偏短，商业化发布前建议补充例子或证据");
  return flags;
}

function deAiCopy(value = "") {
  return String(value || "")
    .replace(/赋能/g, "帮")
    .replace(/探索/g, "试")
    .replace(/共创/g, "一起做")
    .replace(/破局/g, "换个做法")
    .replace(/生态/g, "一套工具")
    .replace(/闭环思维/g, "做完以后能复盘")
    .replace(/底层能力全面升级/g, "关键能力补上")
    .replace(/底层逻辑/g, "真正原因")
    .replace(/降本增效/g, "少做重复活")
    .replace(/全链路/g, "从开始到收尾")
    .replace(/抓手/g, "入口")
    .replace(/矩阵/g, "一组内容")
    .replace(/大多数人/g, "我以前")
    .replace(/一句话带走：/g, "我的结论是：")
    .replace(/评论区告诉我/g, "可以在评论区说")
    .replace(/如果这 resonat(es)?/gi, "如果你也遇到过")
    .trim();
}

function sanitizePublicCopy(value = "") {
  let text = deAiCopy(value);
  text = text.replace(/https?:\/\/[^\s)）]+/g, "[已隐藏链接]");
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[已隐藏地址]");
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[已隐藏邮箱]");
  for (const term of privateTerms) {
    text = text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[隐私信息]");
  }
  for (const term of unsafePublicTerms) {
    text = text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[不适合公开内容]");
  }
  return text;
}

function humanizePlatformCopy(platformCopy) {
  return Object.fromEntries(Object.entries(platformCopy).map(([platform, copy]) => [
    platform,
    {
      ...copy,
      title: sanitizePublicCopy(copy.title),
      body: sanitizePublicCopy(copy.body),
      tags: (copy.tags || []).map((tag) => sanitizePublicCopy(tag).replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "")).filter(Boolean).slice(0, 8)
    }
  ]));
}

function getAngleVariants(core, dirId, lex) {
  return {
    insight: [
      `${core}：大多数人理解错了的那一层`,
      `关于「${core}」，行业内不说但默认的事`,
      `${core} 的真问题，不在表面`
    ],
    howto: [
      `${core} 的 5 步可复用 ${lex.unit}`,
      `把「${core}」做对，只需要这 3 件事`,
      `${core}：一份能照着抄的执行清单`
    ],
    story: [
      `我用 30 天 ${lex.verb} 了「${core}」，记录全过程`,
      `${core} 这件事，我踩过的 7 个坑`,
      `从 0 到 1：${core} 的真实记录`
    ],
    debate: [
      `${core}：99% 的建议都是错的`,
      `别再迷信「${core}」`,
      `${core} 这件事，我们一直在做反`
    ],
    trend: [
      `${core}：这一波，谁在悄悄收钱`,
      `${core} 突然爆了，背后是什么逻辑`,
      `${core}：本周值得关注的 3 个变化`
    ],
    tool: [
      `${core}：我试了 5 个，只留下 2 个`,
      `${core} 工具对比：贵的不一定值`,
      `把「${core}」交给工具，我们省下了什么`
    ]
  }[dirId] || [
    `${core}：大多数人理解错了的那一层`,
    `${core} 的真问题，不在表面`,
    `${core}：一份可执行拆解`
  ];
}

function getCareerAngleVariants(core, dirId) {
  const base = /离职/.test(core) ? "离职原因" : /简历/.test(core) ? "简历" : /项目/.test(core) ? "项目经历" : "面试";
  return {
    insight: [
      `${base}里最容易被忽略的坑`,
      `面试官没明说，但一直在判断这件事`,
      `找工作面试里，很多人输在这个小动作`
    ],
    howto: [
      `${base}前 10 分钟，先检查这 5 件事`,
      `把${base}答稳，只需要这 3 步`,
      `${base}回答模板：能直接照着改`
    ],
    story: [
      `我复盘了几次失败面试，发现问题都在这里`,
      `一次面试被追问后，我才懂这件事`,
      `从答得很虚到答得具体，我改了这 3 点`
    ],
    debate: [
      `别再背标准答案了，面试官听得出来`,
      `${base}不是考试题，别用学生思路答`,
      `很多${base}建议看起来对，其实会扣分`
    ],
    trend: [
      `现在面试更看重的，不是答案漂亮`,
      `这两年求职变难后，面试官更在意什么`,
      `${base}越来越难糊弄了`
    ],
    tool: [
      `用 AI 改${base}，别只让它润色`,
      `我让 AI 模拟面试官追问，发现 3 个漏洞`,
      `${base}自查 prompt：先找漏洞再美化`
    ]
  }[dirId] || [
    `${base}里最容易被忽略的坑`,
    `面试官没明说，但一直在判断这件事`,
    `找工作面试里，很多人输在这个小动作`
  ];
}

function careerSpecificContent(core, dir, tone, extraContext) {
  const topic = /离职/.test(core) ? "离职原因" : /简历/.test(core) ? "简历项目" : /项目/.test(core) ? "项目经历" : "面试回答";
  const contextLine = extraContext
    ? `这期额外约束：${extraContext}。`
    : "建议先用自己的真实经历替换括号里的内容，再发布或背诵。";
  const claims = [
    `${topic}不是在考标准答案，而是在看你能不能把经历讲成可信证据。`,
    "面试官真正担心的是：你是否稳定、是否能合作、是否真的做过、是否知道自己要什么。",
    "好回答不是更漂亮，而是更具体：背景、动作、结果、复盘都能被追问。"
  ];
  const antiPattern = `把「${core}」当成一道背诵题：先说一个正确结论，再补几句漂亮话。问题是，一被追问细节，就会露出准备不足。`;
  const playbook = [
    "先把问题翻译成面试官的担心：稳定性、真实性、匹配度、沟通方式。",
    "每个回答只讲一个主线，不要同时解释太多理由。",
    "用一个真实例子兜底：当时背景、你做了什么、结果是什么。",
    "提前准备 2 个追问：为什么这样选？如果重来会怎么做？",
    "最后落到岗位匹配：我为什么适合现在这个岗位。"
  ];
  const toneLine = {
    balanced: "表达可以克制，但细节一定要具体。",
    sharp: "别背答案，背出来的东西最容易被追问打穿。",
    human: "你不用把自己包装得完美，讲清楚真实选择更重要。",
    playful: "面试不是默写题，面试官也不是答案校对器。",
    expert: "核心是把经历转译为可验证的能力证据。"
  }[tone] || "表达可以克制，但细节一定要具体。";

  return {
    claims,
    antiPattern,
    contextLine,
    playbook,
    cards: [
      {
        eyebrow: "面试避坑",
        headline: `${topic}里最容易被忽略的坑`,
        body: `很多人准备${topic}，只是在准备“怎么说得好听”。但面试官真正听的是：这件事背后，你怎么判断、怎么行动、怎么复盘。`,
        tone: "hook",
        accent: dir.accent
      },
      {
        eyebrow: "错误示范",
        headline: "把面试当成背答案",
        body: antiPattern,
        tone: "warn",
        accent: "#EF4444"
      },
      {
        eyebrow: "核心判断",
        headline: "先翻译面试官在担心什么",
        body: `问${topic}，通常不是只问表面原因。\n他可能在判断：\n1. 你是否稳定\n2. 你是否真的做过\n3. 你和岗位是否匹配\n4. 你遇到问题会不会甩锅`,
        tone: "claim",
        accent: dir.accent
      },
      {
        eyebrow: "回答结构",
        headline: "可以直接套的 3 步",
        body: `1. 先给结论：我这次选择主要因为（岗位/成长/匹配）。\n2. 再给证据：上一段经历里我做过（具体事）。\n3. 最后落点：所以我现在更看重（目标岗位里的能力/责任）。`,
        tone: "playbook",
        accent: "#22C55E"
      },
      {
        eyebrow: "可复制版本",
        headline: "一句话带走",
        body: `${toneLine}\n\n面试前，把每个高频问题都写成：面试官担心什么？我有什么证据？如果被追问，我能不能讲出细节？`,
        tone: "script",
        accent: "#F59E0B"
      },
      {
        eyebrow: "自查清单",
        headline: "发出去前先问自己",
        body: `如果这段回答被追问 3 次，你还能讲下去吗？\n如果不能，就不是表达问题，是素材没准备够。\n\n${contextLine}`,
        tone: "cta",
        accent: "#7C5CFF"
      }
    ]
  };
}

function isProductBuildTopic(core = "", extraContext = "") {
  return /(leonote|个人\s*note|note\s*产品|产品概览|手搓产品|产品分享|产品实景|功能截图|操作流程)/i.test(`${core} ${extraContext}`);
}

function productBuildContent(core, dir, extraContext) {
  const contextLine = extraContext
    ? `这期只讲公开可展示的功能和取舍；用户要求隐藏的隐私、基础设施和账号信息不进入正文。补充边界：${sanitizePublicCopy(extraContext)}。`
    : "只讲公开可展示的功能和取舍，不讲域名、服务器、账号、订单或任何私有配置。";
  const claims = [
    "我这期先不讲宏大愿景，只看产品现在能不能真的帮人把笔记用起来。",
    "一个个人 note 产品最难的不是多一个编辑器，而是让记录、整理、回看这三件事少打断。",
    "如果一个功能截图讲不清楚价值，文案写得再满也没用。"
  ];
  const antiPattern = "只放一堆漂亮界面，不解释为什么这么做，读者看完只会觉得像模板。";
  const playbook = [
    "先给一个真实入口：用户进来第一眼要做什么。",
    "再拆一个核心流程：从写下内容到再次找到它，中间少了哪些动作。",
    "最后说一个取舍：哪些功能现在故意没做，为什么。",
    "每张图只讲一个判断，截图负责证明，不靠大词撑场。",
    "评论区只收集产品问题，不回复任何私有部署、地址和账号细节。"
  ];
  return {
    claims,
    antiPattern,
    contextLine,
    playbook,
    cards: [
      {
        eyebrow: "产品实景",
        headline: "我先把这个 note 产品摊开看",
        body: `这不是融资 BP，也不是官网介绍。第一期先看它现在长什么样、解决哪一步、我为什么要自己做。\n\n${contextLine}`,
        tone: "hook",
        accent: dir.accent
      },
      {
        eyebrow: "少讲玄学",
        headline: "先看入口，不看口号",
        body: "我更关心第一屏是不是能直接开始记录，导航是不是清楚，写完之后能不能很快回到上下文。",
        tone: "evidence",
        accent: "#2563EB"
      },
      {
        eyebrow: "核心流程",
        headline: "记录、整理、回看要连起来",
        body: "很多 note 产品的问题不是功能少，而是每一步都要用户重新想一次：放哪、怎么找、下一次怎么继续。",
        tone: "claim",
        accent: dir.accent
      },
      {
        eyebrow: "我的取舍",
        headline: "先把个人使用跑通",
        body: "我会优先做高频路径：快速记录、标签整理、按场景回看。协作、复杂权限、公开分享这些先不急。",
        tone: "tradeoff",
        accent: "#F59E0B"
      },
      {
        eyebrow: "增长视角",
        headline: "产品分享不能只晒界面",
        body: "对我来说，晒产品不是炫技，而是把当时的判断拿出来复盘：为什么做、先做哪块、哪里还没想清楚。",
        tone: "insight",
        accent: "#22C55E"
      },
      {
        eyebrow: "下一期",
        headline: "继续拆一个具体流程",
        body: "下一期我会挑一个真实使用路径拆：从写下一条 note，到它变成后面能用的材料。",
        tone: "cta",
        accent: "#7C5CFF"
      }
    ]
  };
}

function buildDiscussionPrompt(core, lex, domain) {
  if (domain === "ai") {
    return `评论区告诉我：你现在最想用 ${core} 解决哪个具体场景？也可以直接丢你的配置、工具栈或卡点，我会挑一条做下一期。`;
  }
  if (domain === "career") {
    return "评论区留一个你被追问过的问题，或者你最难讲清楚的一段经历，我会挑一条拆成下一期。";
  }
  if (domain === "business") {
    return `评论区说说你现在卡在获客、转化、交付还是复盘，我会按真实问题做下一期。`;
  }
  if (domain === "finance") {
    return "评论区可以聊你的判断框架和担心点，但不要留下隐私、金额或账号信息。";
  }
  return `评论区告诉我你正在 ${lex.verb} 「${core}」时最卡的一步，或者直接反驳我的判断，我会把高频问题做成下一期。`;
}

function localVsCloudModelContent(core, dir, tone, extraContext) {
  const cleanExtra = String(extraContext || "").replace(/[。！？!?\s]+$/g, "");
  const contextLine = extraContext
    ? `这期限定：${cleanExtra}。`
    : "这里默认你已经有一台 M 系列 Mac，目标是日常写作、代码、检索、摘要和轻量自动化。";
  const title = "Mac 已经够用时，模型该本地还是云端";
  const claims = [
    "结论很简单：高频、隐私、可离线的任务放本地；复杂推理、长上下文、多模态和稳定 SLA 交给云端。",
    "用 4 个指标判断：单次任务是否超过 8K 上下文、是否含隐私数据、是否需要最新强模型、每天调用是否高频重复。",
    "真正省钱的不是全本地，而是把 70% 重复小活本地化，把 30% 高价值难题留给云端。"
  ];
  const antiPattern = "最常见的错法是只看跑分或只看价格：本地模型看起来免费，但会吃内存、占电、要维护；云端模型看起来贵，但强推理和长上下文一次就能省回调参时间。";
  const playbook = [
    "先列任务：写作润色、代码补全、PDF 摘要、图片理解、Agent 自动化，分别标出频率和隐私等级。",
    "本地优先放三类：隐私文本、离线草稿、每天重复几十次的小任务；模型选 7B/8B/14B 量级，别硬上最大。",
    "云端优先放四类：复杂规划、长文档、多图理解、需要最新知识或高可靠输出的交付件。",
    "用一周实测代替争论：记录本地耗时/内存/失败率，云端记录调用成本/返工次数。",
    "最后做混合路由：默认本地草拟，卡住或需要最终质量时一键升级到云端。"
  ];
  const cards = [
    {
      eyebrow: "先给结论",
      headline: title,
      body: "有一台还算可以的 Mac，不等于所有任务都该本地跑。正确做法是按任务路由，而不是按信仰选边。",
      tone: "hook",
      accent: "#002FA7"
    },
    {
      eyebrow: "本地适合",
      headline: "高频、隐私、离线、小上下文",
      body: "比如私人笔记总结、草稿改写、日志归类、短代码片段解释。它们胜在调用频繁、数据敏感、失败成本低，本地模型够用就别每次上云。",
      tone: "claim",
      accent: "#22C55E"
    },
    {
      eyebrow: "云端适合",
      headline: "强推理、长上下文、多模态、交付质量",
      body: "比如几十页 PDF 对比、复杂代码库定位、多图分析、正式发布前的结构重写。这里云端的价值不是便宜，而是少返工。",
      tone: "claim",
      accent: "#7C3AED"
    },
    {
      eyebrow: "判断阈值",
      headline: "4 个问题直接决定路由",
      body: "1. 是否包含隐私或未公开材料？是，本地优先。\n2. 是否超过 8K 上下文或多文件？是，云端优先。\n3. 是否每天重复 20 次以上？是，本地优先。\n4. 是否要最终交付质量？是，云端复核。",
      tone: "playbook",
      accent: "#F59E0B"
    },
    {
      eyebrow: "Mac 配置",
      headline: "别迷信大模型，先看内存",
      body: "8GB 机器只适合轻量模型和短文本；16GB 可以跑 7B/8B 比较舒服；32GB 以上再考虑更大的本地模型和并发工作流。硬跑大模型，体验会比云端差。",
      tone: "script",
      accent: "#06B6D4"
    },
    {
      eyebrow: "推荐方案",
      headline: "默认本地草拟，关键节点上云",
      body: "我的建议：本地负责草稿、分类、隐私材料和批量小任务；云端负责难题、最终稿、长上下文和多模态。这样既省钱，也不会牺牲质量。",
      tone: "cta",
      accent: "#EF4444"
    }
  ];
  const videoFrames = [
    { time: "00:00", shot: "开场结论", overlay: "别二选一", voice: "有一台还算可以的 Mac，最好的答案不是本地或云端，而是按任务路由。", visual: "Mac 桌面 + 本地/云端两条路径分叉" },
    { time: "00:04", shot: "本地任务", overlay: "本地：高频/隐私/离线", voice: "私人笔记、短文本改写、日志归类，这些每天重复的小活，本地模型最合适。", visual: "三张任务卡进入 Mac 图标" },
    { time: "00:12", shot: "云端任务", overlay: "云端：强推理/长上下文/多模态", voice: "长 PDF、复杂代码库、多图理解、正式交付，云端模型的价值是少返工。", visual: "长文档、代码、多图飞入云端图标" },
    { time: "00:20", shot: "阈值判断", overlay: "4 个问题", voice: "看隐私、上下文长度、调用频率、最终质量要求。这四个问题基本就能决定路由。", visual: "四象限判断表逐项点亮" },
    { time: "00:30", shot: "配置边界", overlay: "先看内存", voice: "8GB 做轻量，16GB 跑 7B/8B，32GB 以上再考虑更大模型。别为了本地而硬跑。", visual: "8/16/32GB 三档刻度" },
    { time: "00:40", shot: "收束", overlay: "混合路由", voice: "默认本地草拟，卡住或要最终质量时升级到云端，这才是最稳的方案。", visual: "本地草稿流向云端复核再发布" }
  ];
  return { title, claims, antiPattern, contextLine, playbook, cards, videoFrames };
}

function topicSpecificContent(core, dir, tone, extraContext) {
  if (/(本地模型|云端模型|本地.*云端|云端.*本地|local.*cloud|cloud.*local|mac|Mac|M1|M2|M3|M4)/i.test(core)) {
    return localVsCloudModelContent(core, dir, tone, extraContext);
  }
  return null;
}

function concreteAiFallbackContent(core, dir, tone, extraContext, lex) {
  const cleanExtra = String(extraContext || "").replace(/[。！？!?\s]+$/g, "");
  const contextLine = extraContext
    ? `这期限定：${cleanExtra}。`
    : "先按普通创作者/开发者的日常任务来判断，不讨论企业级私有化部署。";
  const title = `${core}：先分任务，再选工具`;
  const claims = [
    "不要先问哪个工具更强，先问这次任务要什么：速度、隐私、成本、质量、还是稳定性。",
    "轻量重复任务看成本和延迟；复杂交付任务看成功率和返工次数。",
    "一个可执行的选择标准，比十个泛泛的工具推荐更有用。"
  ];
  const antiPattern = `只按热度或参数选择「${core}」，没有写清楚输入、输出、失败成本和验收标准。`;
  const playbook = [
    "把任务拆成输入、输出、频率、失败后果四栏。",
    "给每栏打标签：隐私/长上下文/多模态/实时性/最终交付。",
    "先用最低成本方案跑 3 次，记录耗时、返工和质量问题。",
    "把高频低风险留给便宜方案，把高风险交付交给更强方案。",
    "每周复盘一次路由规则，不要凭感觉换工具。"
  ];
  const cards = [
    { eyebrow: "结论", headline: title, body: `关于「${core}」，先别站队。先把任务拆开，工具选择自然会清楚。`, tone: "hook", accent: "#002FA7" },
    { eyebrow: "错误做法", headline: "先比较参数，最后还是不会用", body: antiPattern, tone: "warn", accent: "#EF4444" },
    { eyebrow: "判断表", headline: "5 个维度够用了", body: "速度、隐私、成本、质量、稳定性。每次只要问这五个维度哪个最重要，就能避免空泛推荐。", tone: "claim", accent: "#22C55E" },
    { eyebrow: "执行清单", headline: "一周实测，不靠感觉", body: playbook.slice(0, 4).map((p, i) => `${i + 1}. ${p}`).join("\n"), tone: "playbook", accent: "#F59E0B" },
    { eyebrow: "边界", headline: "便宜不是省钱，少返工才是", body: "便宜方案如果让你反复改提示词、重跑、人工兜底，总成本可能更高。复杂交付要看一次成功率。", tone: "script", accent: "#7C3AED" },
    { eyebrow: "落地", headline: "保留一条升级路径", body: "默认用低成本方案处理草稿和批量小活；卡住、超长、要交付时升级到强模型或人工复核。", tone: "cta", accent: "#06B6D4" }
  ];
  return { title, claims, antiPattern, contextLine, playbook, cards };
}

export function buildPack(topic, direction = "insight", tone = "balanced", generation = 1, extraContext = "", options = {}) {
  const core = sanitizePublicCopy(cleanTopic(topic)) || "AI Agent 自动化自媒体";
  const safeExtraContext = sanitizePublicCopy(extraContext);
  const dir = directionLibrary.find((d) => d.id === direction) || directionLibrary[0];
  const dom = detectDomain(core);
  const lex = domainLexicon[dom];
  const seed = hash(core + direction + tone + generation + (safeExtraContext || ""));
  const angleVariants = dom === "career" ? getCareerAngleVariants(core, dir.id) : getAngleVariants(core, dir.id, lex);
  let title = pick(angleVariants, seed);

  const toneEdge = {
    balanced: "稳",
    sharp: "直接",
    human: "像聊天",
    playful: "有梗",
    expert: "深"
  };
  const discussionPrompt = buildDiscussionPrompt(core, lex, dom);

  let claims = [
    `${core} 不是一个执行问题，是一个 ${lex.concept} 问题。`,
    `大多数人卡在第二步：没把「${core}」翻译成自己的 ${lex.unit}。`,
    `做对一次「${core}」，比做完十次平庸版本更值钱。`
  ];

  let antiPattern = {
    insight: `把「${core}」当成方法论照搬，忽略自己所在的 ${lex.audience} 实际处境。`,
    howto: `只看到步骤，不去抓「${core}」里那个真正决定结果的关键动作。`,
    story: "只记录过程，不交代当时的判断和取舍，读者代入不进来。",
    debate: "观点很冲，但没有给出反例和边界，容易变成情绪发泄。",
    trend: "蹭上热点但没接住，只复读现象，没有提出自己的解读。",
    tool: "只对比参数，不讲使用场景，看完不知道该选哪个。"
  }[dir.id] || `把「${core}」做得太正确、太干净，反而失去了人味和锋利度。`;

  let contextLine = extraContext
    ? `这期额外约束：${safeExtraContext}。`
    : "这期先用通用账号定位演示，接入 Brand Voice 后会注入用户自己的禁忌、案例与口头禅。";

  let playbook = [
    `先用一句话写出你 ${lex.verb} 「${core}」的目标，写不清就说明还没准备好。`,
    `把过程拆成最多 3 步，每一步要有可以被外部观察到的结果。`,
    "选一个最容易先做的，今天就做，不要等完整方案。",
    "做完立刻记录：什么有效、什么没有、为什么。",
    `把这条记录改成一个对 ${lex.audience} 有用的版本，发出去。`
  ];

  let cards = [
    {
      eyebrow: dir.label,
      headline: title,
      body: `给 ${lex.audience} 的一份「${core}」拆解。别只看结论，重点在第 3 张。`,
      tone: "hook",
      accent: dir.accent
    },
    {
      eyebrow: "常见做法",
      headline: "这样做看起来对，其实不对",
      body: antiPattern,
      tone: "warn",
      accent: "#EF4444"
    },
    {
      eyebrow: "核心判断",
      headline: claims[0],
      body: `${claims[1]}\n${contextLine}`,
      tone: "claim",
      accent: dir.accent
    },
    {
      eyebrow: `${lex.unit} 模板`,
      headline: "可以直接抄的结构",
      body: playbook.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join("\n"),
      tone: "playbook",
      accent: "#22C55E"
    },
    {
      eyebrow: "可复制版本",
      headline: "一句话带走",
      body: `${core} 的 ${toneEdge[tone] || "稳"} 版本：先想清楚 ${lex.concept}，再选最小的一步，做完发出来。`,
      tone: "script",
      accent: "#F59E0B"
    },
    {
      eyebrow: "互动回收",
      headline: "把你的问题留在评论",
      body: discussionPrompt,
      tone: "cta",
      accent: "#7C5CFF"
    }
  ];

  const specific = topicSpecificContent(core, dir, tone, safeExtraContext) || (dom === "ai" ? concreteAiFallbackContent(core, dir, tone, safeExtraContext, lex) : null);
  let specificVideoFrames = null;
  if (specific) {
    title = specific.title || title;
    claims = specific.claims || claims;
    antiPattern = specific.antiPattern || antiPattern;
    contextLine = specific.contextLine || contextLine;
    playbook = specific.playbook || playbook;
    cards = specific.cards || cards;
    specificVideoFrames = specific.videoFrames || null;
  }

  if (dom === "career") {
    const career = careerSpecificContent(core, dir, tone, safeExtraContext);
    claims = career.claims;
    antiPattern = career.antiPattern;
    contextLine = career.contextLine;
    playbook = career.playbook;
    cards = career.cards;
    cards[cards.length - 1] = {
      ...cards[cards.length - 1],
      body: `${cards[cards.length - 1].body}\n\n${discussionPrompt}`
    };
  }

  if (isProductBuildTopic(core, safeExtraContext)) {
    const product = productBuildContent(core, dir, safeExtraContext);
    claims = product.claims;
    antiPattern = product.antiPattern;
    contextLine = product.contextLine;
    playbook = product.playbook;
    cards = product.cards;
  }

  // Real-model creative override (from generateCreativeContent). The deterministic synthesis above
  // is the fallback / structural skeleton; when the model returns content we overlay it and let the
  // existing platformCopy + sanitize + policy pipeline below format and screen it. Fields are padded
  // from the deterministic values so downstream code that indexes claims[2]/playbook[2]/cards[5]
  // never sees undefined.
  const creative = options.creative;
  if (creative) {
    if (creative.title) title = sanitizePublicCopy(creative.title) || title;
    if (creative.claims?.length) {
      const merged = creative.claims.map((item) => sanitizePublicCopy(item)).filter(Boolean);
      claims = merged.length >= 3 ? merged : [...merged, ...claims].slice(0, 3);
    }
    if (creative.antiPattern) antiPattern = sanitizePublicCopy(creative.antiPattern) || antiPattern;
    if (creative.playbook?.length) {
      const merged = creative.playbook.map((item) => sanitizePublicCopy(item)).filter(Boolean);
      playbook = merged.length >= 3 ? merged : [...merged, ...playbook].slice(0, 3);
    }
    if (creative.cards?.length) {
      cards = cards.map((fallbackCard, index) => {
        const card = creative.cards[index];
        if (!card) return fallbackCard;
        return {
          ...fallbackCard,
          eyebrow: sanitizePublicCopy(card.eyebrow) || fallbackCard.eyebrow,
          headline: sanitizePublicCopy(card.headline) || fallbackCard.headline,
          body: sanitizePublicCopy(card.body) || fallbackCard.body
        };
      });
    }
  }

  const specificXhsBody = specific
    ? `${title}\n\n${claims[0]}\n\n怎么判断：\n${playbook.slice(0, 4).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n反例：${antiPattern}\n\n我的结论：${claims[2]}\n\n${contextLine}\n\n${discussionPrompt}`
    : "";
  const specificWeiboBody = specific
    ? `${title}\n\n${claims[0]}\n\n${playbook.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n结论：${claims[2]}`
    : "";
  const specificLinkedinBody = specific
    ? `${title}\n\n${claims[0]}\n\nDecision checklist:\n${playbook.slice(0, 5).map((p) => `• ${p}`).join("\n")}\n\nCommon mistake: ${antiPattern}\n\nTakeaway: ${claims[2]}`
    : "";

  const thread = [
    `${core} —— 大多数人理解错的一层：`,
    claims[0],
    `反例：${antiPattern}`,
    claims[1],
    `如何做对：\n1. ${playbook[0]}\n2. ${playbook[1]}\n3. ${playbook[2]}`,
    claims[2],
    discussionPrompt
  ];

  const videoFrames = specificVideoFrames || (isProductBuildTopic(core, safeExtraContext)
    ? [
      { time: "00:00", shot: "产品实景", overlay: "先看第一屏", voice: "这期先看真实界面，不讲空话。", visual: "产品首页截图，保留功能入口，隐藏私有信息" },
      { time: "00:04", shot: "入口", overlay: "第一步能不能开始", voice: "我先看用户进来是不是能马上写下一条 note。", visual: "入口区局部放大 + 标注" },
      { time: "00:10", shot: "流程", overlay: "记录到回看", voice: "重点不是编辑器，而是写完之后还能不能找到和继续用。", visual: "产品流程截图串联" },
      { time: "00:18", shot: "取舍", overlay: "哪些先不做", voice: "复杂协作和公开分享先放后面，先把个人路径跑顺。", visual: "功能区对比，突出当前版本边界" },
      { time: "00:27", shot: "复盘", overlay: "为什么自己做", voice: "商业和增长工作做久了，会更在意材料怎么沉淀成下一次判断。", visual: "笔记、标签、回看三个模块并列" },
      { time: "00:36", shot: "下一期", overlay: "拆一个具体流程", voice: "下一期继续拆：一条 note 怎么变成可复用材料。", visual: "下一期预告卡 + 评论问题入口" }
    ]
    : [
      { time: "00:00", shot: "钩子", overlay: "别再这样做", voice: `如果你也在做${core}，先停 3 秒看完这条。`, visual: "正脸特写 + 红色禁止符号叠加" },
      { time: "00:04", shot: "反例", overlay: "看起来对，其实不对", voice: antiPattern, visual: "屏幕录屏 + 红框圈出错误点" },
      { time: "00:12", shot: "判断", overlay: lex.concept, voice: claims[0], visual: "白板字幕 + 关键词高亮" },
      { time: "00:20", shot: "方法", overlay: "三步走", voice: `${playbook[0]}；${playbook[1]}；${playbook[2]}`, visual: "三步动画卡片依次入场" },
      { time: "00:32", shot: "证据", overlay: lex.win, voice: `做对一次的人，普遍会拿到 ${lex.win}。`, visual: "数据图 / 对比前后" },
      { time: "00:40", shot: "互动", overlay: "评论 = 下一期", voice: discussionPrompt, visual: "评论区动画浮现" }
    ]);

  const tagBase = [core.replace(/\s/g, ""), dir.label, lex.audience.replace(/\s/g, "")].filter(Boolean);

  const platformCopy = humanizePlatformCopy({
    xhs: {
      title: title.length > 20 ? `${title.slice(0, 20)}…` : title,
      body: specificXhsBody || `${title}\n\n做${core}的时候，先别急着找通用答案。真正要看的是：输入是什么、输出要到什么质量、失败后谁兜底。\n\n常见错法：${antiPattern}\n\n更对的路径：\n1. ${playbook[0]}\n2. ${playbook[1]}\n3. ${playbook[2]}\n\n结论：${claims[2]}\n\n${contextLine}\n\n${discussionPrompt}`,
      tags: [...tagBase, "干货", "笔记灵感", "实操"]
    },
    douyin: {
      title,
      body: `钩子：${videoFrames[0].voice}\n反差：${antiPattern}\n核心：${claims[0]}\n三步：${playbook[0]} → ${playbook[1]} → ${playbook[2]}\n结尾：${discussionPrompt}`,
      tags: [...tagBase, "干货分享", "知识"]
    },
    x: {
      title,
      body: thread.map((line, i) => `${i + 1}/ ${line}`).join("\n\n"),
      tags: tagBase.slice(0, 3).map((t) => t.replace(/[#\s]/g, ""))
    },
    weibo: {
      title,
      body: specificWeiboBody || `${title}\n\n${claims[0]} ${antiPattern}\n\n做对的人通常是这样：${playbook[0]}，${playbook[1]}，${playbook[2]}。\n\n你正在做${core}的话，评论区告诉我卡在哪。`,
      tags: tagBase
    },
    zhihu: {
      title: `${title}？`,
      body: `先给结论：${claims[0]}\n\n## 一、为什么你之前的做法没效果\n\n${antiPattern}\n\n## 二、真正起作用的路径\n\n${playbook.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n## 三、一个可被引用的判断\n\n${claims[2]}\n\n${contextLine}\n\n欢迎评论你的具体情况，我会挑一条做拆解。`,
      tags: tagBase
    },
    bilibili: {
      title,
      body: `视频脚本（${videoFrames.length} 镜）\n\n${videoFrames.map((f) => `[${f.time}] ${f.shot} — ${f.overlay}\n画面：${f.visual}\n台词：${f.voice}`).join("\n\n")}`,
      tags: tagBase
    },
    instagram: {
      title,
      body: `Most people get "${core}" wrong on one specific point.\n\nWrong move: ${antiPattern}\n\nWhat works instead:\n1. ${playbook[0]}\n2. ${playbook[1]}\n3. ${playbook[2]}\n\nOne-liner: think first, ship small, post the result.\n\nDrop your blocker below — next post is built from comments.`,
      tags: tagBase.map((t) => t.replace(/[#\s]/g, "").toLowerCase())
    },
    linkedin: {
      title,
      body: specificLinkedinBody || `${title}\n\nAfter watching ${lex.audience} work on "${core}", one pattern keeps showing up: ${antiPattern}\n\nThe people who actually win do three things differently:\n• ${playbook[0]}\n• ${playbook[1]}\n• ${playbook[2]}\n\nThe underlying point: ${claims[0]}\n\nIf this resonates, what's the part you're stuck on?`,
      tags: tagBase
    }
  });

  const scores = rubric.map((item, i) => ({
    ...item,
    score: 78 + ((seed + i * 13) % 18)
  }));

  const titleCandidates = creative?.titleCandidates?.length
    ? [...creative.titleCandidates.map((item) => sanitizePublicCopy(item)).filter(Boolean), title, ...angleVariants].slice(0, 3)
    : angleVariants.slice(0, 3);
  const policyFlags = [
    ...contentRiskFlags(Object.values(platformCopy).map((copy) => copy.body)),
    ...Object.entries(platformCopy)
      .filter(([id, copy]) => copy.body.length > platformMeta[id].char)
      .map(([id]) => `${platformMeta[id].name} 文案超过建议字数`)
  ];

  return {
    id: `${Date.now()}-${seed}`,
    version: creative ? "0.4-model" : "0.3-local",
    core,
    direction: dir,
    domain: dom,
    tone,
    title,
    titleCandidates,
    claims,
    antiPattern,
    playbook,
    cards,
    videoFrames,
    platformCopy,
    scores,
    policy: {
      status: policyFlags.length ? "review" : "pass",
      flags: policyFlags,
      rules: ["不绕过平台风控", "不批量刷屏", "最终发布需人工确认", "保留发布 trace 与素材记录"]
    },
    automationPrompt: createPublishInstruction({ core, dir, tone, title, platformCopy })
  };
}

const forbiddenBrowserActions = [
  "不要尝试绕过验证码",
  "不要绕过平台风控",
  "不要在未登录账号时继续执行",
  "不要在未授权时点击最终发布",
  "不要批量重复发布同一内容"
];

const failureRecovery = [
  "未登录则暂停并提示用户手动登录",
  "出现验证码或风控提示则停止，不尝试绕过",
  "上传失败只重试一次，仍失败则截图回传",
  "找不到按钮或页面结构变化时截图回传并标记 waiting_for_user",
  "任何最终发布/预约动作必须确认 mode 显式授权"
];

export function buildSourceItems({ topic, sources = [], platform = "web" }) {
  const core = cleanTopic(topic) || "AI Agent 自动化自媒体";
  const entries = sources.length ? sources : [
    { url: "local://trend-radar", title: `${core} 的近期讨论`, text: `${core} 的常见问题、反对意见和可执行经验正在增长。` },
    { url: "local://competitor-observation", title: `${core} 竞品内容观察`, text: `同类账号集中在工具清单和泛泛教程，缺少真实执行过程、失败记录和数据复盘。` },
    { url: "local://comment-pool", title: `${core} 评论问题池`, text: `用户最常问：怎么开始、怎么持续、怎么判断内容是否有效。` }
  ];

  return entries.map((source, index) => {
    const raw = String(source.text || source.raw_text || source.summary || source.title || core);
    const seed = hash(`${core}-${source.url || index}-${raw}`);
    return {
      id: `src-${seed}`,
      source_url: source.url || source.source_url || `local://source-${index + 1}`,
      source_platform: source.platform || source.source_platform || platform,
      source_type: source.type || "agent_collected",
      title: source.title || `${core} source ${index + 1}`,
      raw_text: raw,
      clean_markdown: `# ${source.title || core}\n\n${raw}`,
      summary: raw.length > 120 ? `${raw.slice(0, 118)}…` : raw,
      captured_at: new Date().toISOString(),
      credibility_score: 70 + (seed % 25),
      relevance_score: 74 + (seed % 22),
      content_angles: [
        `${core} 的反常识误区`,
        `${core} 的可执行路径`,
        `${core} 的评论区问题`
      ],
      evidence_quotes: [raw.slice(0, 120)]
    };
  });
}

export function buildResearchBrief({ topic, sourceItems = [] }) {
  const core = cleanTopic(topic) || "AI Agent 自动化自媒体";
  const items = sourceItems.length ? sourceItems : buildSourceItems({ topic: core });
  const facts = items.map((item) => item.summary);
  return {
    id: `brief-${hash(`${core}-${items.map((item) => item.id).join("|")}`)}`,
    topic: core,
    sources: items.map((item) => ({ id: item.id, title: item.title, url: item.source_url, score: item.relevance_score })),
    facts,
    contradictions: [
      "用户想要自动化，但平台和账号安全要求节制执行",
      "多数内容强调工具能力，少数内容证明持续运营结果"
    ],
    audience_pains: ["不知道每天写什么", "发布动作重复耗时", "评论没有进入下一轮选题", "数据复盘靠感觉"],
    contrarian_angle: `${core} 的关键不是多生成几篇，而是让评论、数据和下一轮选题形成闭环。`,
    suggested_formats: ["小红书 6P 卡片", "X thread", "知乎结构化回答", "LinkedIn 长帖"],
    risk_flags: items.some((item) => item.credibility_score < 75) ? ["部分来源可信度偏低，需要发布前复核"] : []
  };
}

export function buildTopicCandidates({ brief, limit = 5 }) {
  const base = brief?.topic || "AI Agent 自动化自媒体";
  const angles = [
    { angle: "反常识误区", format: "xhs", hook: `做${base}，最浪费时间的不是生成内容` },
    { angle: "执行清单", format: "xhs", hook: `${base} 每天自动跑起来的 5 步` },
    { angle: "评论复盘", format: "x", hook: `你的评论区其实是下一轮选题库` },
    { angle: "竞品拆解", format: "zhihu", hook: `为什么同类账号都在讲${base}，但没人讲闭环` },
    { angle: "数据学习", format: "linkedin", hook: `Content ops should learn from every post, not every quarter` }
  ];

  return angles.slice(0, limit).map((item, index) => ({
    id: `topic-${hash(`${base}-${item.angle}-${index}`)}`,
    title: item.hook,
    angle: item.angle,
    target_platforms: [item.format],
    score_json: {
      evidence: 82 - index * 2,
      novelty: 88 - index,
      fit: 90 - index * 3,
      risk: 16 + index * 4
    },
    source_brief_id: brief?.id || null,
    status: index === 0 ? "recommended" : "candidate",
    reason: brief?.contrarian_angle || `${base} 需要从单次生成升级为运营闭环。`
  }));
}

export function renderHtmlDeck(pack, platform = "xhs") {
  const size = platform === "instagram" ? { w: 1080, h: 1350 } : { w: 1080, h: 1440 };
  const short = (value, max = 86) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const lines = (value, max = 4) => String(value || "")
    .split(/\n|。|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
  const cards = pack.cards.map((card, index) => {
    const lineItems = lines(card.body, index === 0 ? 3 : 5)
      .map((line) => `<li>${escapeXml(short(line, 52))}</li>`)
      .join("");
    const page = String(index + 1).padStart(2, "0");
    const title = escapeXml(card.headline);
    const eyebrow = escapeXml(card.eyebrow);
    const body = escapeXml(short(card.body, index === 0 ? 128 : 180)).replace(/\n/g, "<br/>");
    if (index === 0) {
      return `
    <section class="card cover">
      <div class="bigNo">01</div>
      <div class="label">${eyebrow}</div>
      <div class="coverText">
        <h1>${title}</h1>
        <p>${body}</p>
      </div>
      <div class="rings"><i></i><i></i><i></i><i></i></div>
      <footer>${escapeXml(pack.core)} / ${escapeXml(pack.direction.label)}</footer>
    </section>`;
    }
    if (index === 2 || index === 3) {
      return `
    <section class="card system">
      <header><b>${page}.</b><h1>${title}</h1></header>
      <div class="theory"><small>THEORY MODULE</small><strong>${eyebrow}</strong><p>${body}</p></div>
      <div class="diagram">
        <div class="folder f1"></div><div class="folder f2"></div><div class="folder f3"></div>
        <div class="bar b1"></div><div class="bar b2"></div><div class="bar b3"></div>
      </div>
      <ul class="rules">${lineItems}</ul>
      <footer>${escapeXml(pack.core)} / alignment axis</footer>
    </section>`;
    }
    return `
    <section class="card note">
      <div class="sideNo">${page}</div>
      <div class="noteMain">
        <div class="eyebrow">${eyebrow}</div>
        <h1>${title}</h1>
        <ul>${lineItems}</ul>
      </div>
      <aside>
        <span>10% RULE</span>
        <b>CONTRAST</b>
        <em>控制强调元素，让重点真的成为重点。</em>
      </aside>
      <footer>${escapeXml(pack.core)} / visual note</footer>
    </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXml(pack.title)}</title>
<style>
  :root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  body { margin: 0; background: #d5d3cb; display: grid; gap: 24px; padding: 24px; }
  .deck { display: grid; grid-template-columns: repeat(${pack.cards.length}, ${size.w}px); gap: 24px; }
  .card { width: ${size.w}px; height: ${size.h}px; box-sizing: border-box; position: relative; overflow: hidden; color: #171914; background: #ebe7dd; border-radius: 8px; }
  .card::before { content: ""; position: absolute; inset: 28px; border: 1px solid rgba(23,25,20,.28); pointer-events: none; }
  .card::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(23,25,20,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,20,.045) 1px, transparent 1px); background-size: 42px 42px; pointer-events: none; }
  footer { position: absolute; left: 58px; right: 58px; bottom: 38px; z-index: 2; display: flex; justify-content: space-between; border-top: 1px solid rgba(23,25,20,.22); padding-top: 16px; color: #6f706a; font-size: 20px; }
  .cover { padding: 70px 58px; background: #ece9e0; }
  .bigNo { position: relative; z-index: 2; font-size: 178px; line-height: .78; font-weight: 1000; }
  .label { position: absolute; left: 286px; top: 82px; z-index: 2; background: #171914; color: #f8f3e8; padding: 14px 20px; font-size: 44px; line-height: 1.05; font-weight: 950; max-width: 360px; }
  .coverText { position: absolute; left: 58px; right: 380px; top: 358px; z-index: 2; }
  .coverText h1 { font-size: 72px; line-height: 1.08; margin: 0 0 30px; font-weight: 950; }
  .coverText p { font-size: 32px; line-height: 1.43; margin: 0; color: #484b43; }
  .rings { position: absolute; right: 84px; top: 190px; z-index: 2; display: grid; gap: 22px; justify-items: center; }
  .rings i { display: block; background: #171914; border-radius: 50%; }
  .rings i:nth-child(1) { width: 72px; height: 24px; }
  .rings i:nth-child(2) { width: 126px; height: 45px; }
  .rings i:nth-child(3) { width: 210px; height: 75px; }
  .rings i:nth-child(4) { width: 342px; height: 116px; }
  .note { display: grid; grid-template-columns: 210px 1fr 250px; gap: 34px; padding: 74px 58px 90px; background: #0b0b09; color: #f6f0e4; }
  .note::before { border-color: rgba(246,240,228,.26); }
  .note::after { background-image: linear-gradient(rgba(246,240,228,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(246,240,228,.04) 1px, transparent 1px); }
  .sideNo { position: relative; z-index: 2; font-size: 164px; line-height: .8; font-weight: 1000; }
  .noteMain { position: relative; z-index: 2; padding-top: 34px; }
  .eyebrow { display: inline-flex; background: #f6f0e4; color: #111; padding: 10px 16px; font-size: 30px; font-weight: 950; }
  .noteMain h1 { font-size: 62px; line-height: 1.08; margin: 34px 0 36px; font-weight: 950; }
  ul { margin: 0; padding-left: 28px; }
  li { font-size: 31px; line-height: 1.38; margin-bottom: 14px; }
  aside { position: relative; z-index: 2; align-self: end; display: grid; gap: 18px; }
  aside span { font-size: 22px; color: #9f988d; font-weight: 900; }
  aside b { font-size: 48px; line-height: .95; }
  aside em { font-style: normal; color: #bdb6aa; font-size: 23px; line-height: 1.32; }
  .system { padding: 48px 42px 88px; background: #eef0e6; }
  .system header { position: relative; z-index: 2; display: flex; align-items: flex-end; gap: 18px; border-bottom: 2px solid rgba(23,25,20,.22); padding-bottom: 14px; }
  .system header b { font-size: 82px; line-height: .9; font-weight: 1000; }
  .system header h1 { font-size: 55px; line-height: 1.02; margin: 0; font-weight: 1000; }
  .theory { position: relative; z-index: 2; margin-top: 22px; background: rgba(255,255,255,.58); border: 1px solid rgba(23,25,20,.22); box-shadow: 0 14px 26px rgba(66,70,56,.13); padding: 20px 24px; }
  .theory small { display: block; font-size: 18px; font-weight: 950; color: #606559; }
  .theory strong { display: block; font-size: 34px; line-height: 1.08; margin: 6px 0 8px; }
  .theory p { margin: 0; color: #44483e; font-size: 24px; line-height: 1.34; }
  .diagram { position: relative; z-index: 2; height: 320px; margin: 26px 0; background: rgba(255,255,255,.44); border: 1px solid rgba(23,25,20,.24); }
  .folder { position: absolute; left: 70px; width: 96px; height: 58px; border-radius: 8px 8px 4px 4px; background: #7d9a75; }
  .f1 { top: 54px; } .f2 { top: 132px; background: #a77e6d; } .f3 { top: 210px; background: #6e7f8c; }
  .bar { position: absolute; left: 220px; right: 70px; height: 42px; border-radius: 4px; }
  .b1 { top: 62px; background: #d3b177; } .b2 { top: 140px; background: #8fab8b; } .b3 { top: 218px; background: #728597; }
  .rules { position: relative; z-index: 2; background: rgba(255,255,255,.6); border: 1px solid rgba(23,25,20,.2); padding: 22px 36px 16px 52px; }
  .rules li { color: #30342d; font-size: 27px; line-height: 1.34; }
</style>
</head>
<body><main class="deck">${cards}</main></body>
</html>`;
}

export function createPublishInstruction({ core, dir, tone, title, platformCopy }) {
  return (
    `你是社媒发布 Agent。Codex 只负责调度、观察和回写 trace；具体页面动作交给浏览器 Agent 执行。任务：把以下内容包发布到 ${Object.keys(platformCopy).join(" / ")} 的草稿区，**不要点击最终发布**，停在确认页等用户审阅。\n\n` +
    `## 主体\n${core}\n\n## 方向\n${dir.label} — ${dir.desc}\n\n## 语气\n${toneProfiles[tone].label} — ${toneProfiles[tone].desc}\n\n## 标题\n${title}\n\n## 小红书\n${platformCopy.xhs.body}\n\n## X Thread\n${platformCopy.x.body}\n\n## 规则\n1. 不绕过任何平台风控；\n2. 不批量刷屏；\n3. 不自动点击「发布」按钮；\n4. 上传素材后停留在确认页并截图回传。`
  );
}

export function buildPlatformBrowserTask({ pack, platform, mode = "draft", scheduledAt = "", accountLabel = "Leo", localAssets = [] }) {
  const meta = platformMeta[platform] || platformMeta.xhs;
  const copy = pack.platformCopy[platform] || pack.platformCopy.xhs;
  const canFinalize = mode === "publish" || mode === "schedule";
  const actionLabel = mode === "schedule" ? "预约发布" : mode === "publish" ? "立即发布" : "保存草稿";

  return {
    id: `${mode}-${pack.id}-${platform}`,
    type: "browser_publish_task",
    executor: "agent-controller",
    controller: "codex-app-local",
    platform,
    platformName: meta.name,
    accountLabel,
    mode,
    openUrl: meta.openUrl,
    requiresLoggedInBrowser: true,
    localAssets,
    objective: `由 Codex 调度浏览器 Agent，使用已登录浏览器账号在 ${meta.name} 创建${actionLabel}任务；Codex 不替代业务判断，只负责执行编排和证据回写`,
    content: {
      title: copy.title || pack.title,
      body: copy.body,
      tags: copy.tags || [],
      cards: pack.cards,
      videoFrames: pack.videoFrames
    },
    steps: [
      `打开 ${meta.openUrl}`,
      "检查当前是否已登录，如果未登录则暂停并提示用户手动登录",
      "直接使用当前浏览器登录态继续执行；不识别、不确认、不匹配账号名称，也不要因为账号名称不同而阻塞",
      `进入 ${meta.name} 的创作 / 发布入口`,
      "按平台内容类型选择图文、帖子、回答、专栏或视频入口",
      "上传 localAssets 中的 PNG/MP4/SVG；没有素材时使用正文和平台原生编辑器",
      "填写标题、正文和标签",
      mode === "schedule" ? `设置预约发布时间：${scheduledAt || "由 Agent 根据账号节奏选择"}` : `选择${actionLabel}`,
      "截图确认页面并把关键状态回写给 Codex",
      canFinalize ? "确认 runbook 显式授权后点击发布/预约，并回传 post_url 或截图证据" : "draft 模式停在最终确认页，不点击发布"
    ],
    browserSteps: [
      `打开 ${meta.openUrl}，确认当前浏览器已登录；账号名称不作为阻塞条件`,
      `进入 ${meta.name} 的创作 / 发布入口`,
      "填写标题、正文、标签，并按平台需要上传封面、轮播图或视频素材",
      mode === "schedule" ? `设置预约发布时间：${scheduledAt || "由 Agent 根据账号节奏选择"}` : `选择${actionLabel}`,
      canFinalize ? "最终点击前检查已登录状态、内容、素材、时间和平台限制；确认无误后执行" : "停在最终确认页，不点击发布",
      "保存发布 URL、草稿 URL 或截图 trace，返回给 Agent Studio"
    ],
    stopCondition: canFinalize ? "stop_after_trace_captured" : "stop_on_final_confirmation_page",
    traceRequired: true,
    screenshotRequired: true,
    failureRecovery,
    forbiddenActions: forbiddenBrowserActions,
    safety: {
      allowedFinalPublish: canFinalize,
      explicitPublishModeRequired: true,
      accountOwnershipRequired: true,
      loggedInSessionOnly: true,
      noCaptchaBypass: true,
      noRiskControlBypass: true,
      noBulkDuplicatePosting: true,
      traceRequired: true,
      screenshotRequired: true
    }
  };
}

export function buildCommentMaintenanceTask({ platform, publishUrl, brandVoice = "克制、真诚、有帮助", maxReplies = 12 }) {
  const meta = platformMeta[platform] || platformMeta.xhs;
  return {
    id: `comments-${platform}-${hash(`${publishUrl}-${maxReplies}`)}`,
    type: "browser_comment_maintenance_task",
    executor: "agent-controller",
    controller: "codex-app-local",
    platform,
    platformName: meta.name,
    openUrl: publishUrl || meta.openUrl,
    requiresLoggedInBrowser: true,
    objective: `维护 ${meta.name} 已发布内容的评论区，提取选题信号并回复高价值评论`,
    brandVoice,
    maxReplies,
    steps: [
      "打开已发布内容页面，确认当前是内容所属账号",
      "读取最新评论，按咨询、反对、共鸣、选题信号、垃圾评论分类",
      "为低风险咨询和共鸣类评论生成回复草稿",
      "低风险回复不超过 maxReplies；高风险、争议、隐私、医疗/金融/法律问题暂停确认",
      "把选题信号整理成 topic_candidates",
      "截图或记录已回复评论、未回复原因和新增选题"
    ],
    browserSteps: [
      "打开已发布内容页面，确认当前是内容所属账号",
      "读取最新评论，按咨询、反对、共鸣、选题信号、垃圾评论分类",
      "优先回复咨询和高质量反对意见，避免争吵、刷屏和模板化回复",
      "把选题信号整理成下一轮 topic candidates",
      "截图或记录已回复评论、未回复原因和新增选题"
    ],
    replyPolicy: {
      maxReplies,
      lowRiskAutoReply: true,
      highRiskRequiresHuman: true,
      noArguments: true,
      noPrivateDataRequest: true,
      discloseUncertainty: true,
      tone: brandVoice
    },
    traceRequired: true,
    screenshotRequired: true,
    failureRecovery,
    forbiddenActions: forbiddenBrowserActions,
    outputs: ["reply_log", "topic_candidates", "risk_flags", "trace", "screenshots"]
  };
}

export function buildAgentRunbook({ pack, platforms, mode = "draft", scheduledAt = "", accountLabel = "Leo", localAssets = [] }) {
  return {
    id: `runbook-${pack.id}`,
    version: "0.5-codex-local",
    executor: "agent-controller",
    controller: "codex-app-local",
    packId: pack.id,
    mode,
    productContext: {
      core: pack.core,
      direction: pack.direction.label,
      domain: pack.domain,
      tone: pack.tone,
      policyStatus: pack.policy.status,
      policyFlags: pack.policy.flags
    },
    tasks: platforms.map((platform) => buildPlatformBrowserTask({ pack, platform, mode, scheduledAt, accountLabel, localAssets })),
    maintenance: platforms.map((platform) => ({
      platform,
      trigger: "after_publish_url_available",
      taskTemplate: buildCommentMaintenanceTask({ platform, publishUrl: "", maxReplies: 12 })
    })),
    runLifecycle: ["pending", "running", "waiting_for_user", "completed", "failed"],
    traceContract: {
      required: true,
      screenshots: "key_pages",
      resultFields: ["task_id", "status", "platform", "post_url", "draft_url", "screenshot_urls", "trace", "failure_reason"]
    },
    agentContract: {
      caller: "Codex controller -> Browser-use/Stagehand/Playwright 等可替换本地 Agent",
      runtime: "Mac local browser with existing logged-in sessions",
      codexRole: "orchestrate_agents_validate_account_collect_trace_never_bypass_platform_risk",
      requiredReturns: ["task_id", "status", "platform", "url_or_screenshot", "trace", "errors"]
    }
  };
}

export function createSystemPrompt({ topic, direction, tone, extraContext, brandVoice = "尚未配置，使用克制专业默认语气" }) {
  const dir = directionLibrary.find((item) => item.id === direction) || directionLibrary[0];
  const toneProfile = toneProfiles[tone] || toneProfiles.balanced;
  const safeTopic = sanitizePublicCopy(cleanTopic(topic));
  const safeExtraContext = sanitizePublicCopy(extraContext);
  const safeBrandVoice = sanitizePublicCopy(brandVoice);
  return `你是多平台内容主理人和增长编辑。
账号定位：${safeBrandVoice}
本期主体：${safeTopic}
方向：${dir.label} — ${dir.desc}
语气：${toneProfile.label} — ${toneProfile.desc}
上下文：${safeExtraContext || "无"}

要求：
1. 标题 3 个候选，不写 AI 套话；
2. 内容遵循：钩子 -> 反例 -> 判断 -> 方法 -> 互动；
3. 为每个平台生成原生格式，不要把同一段硬复制；
4. 输出 JSON，字段包含 titleCandidates、claims、antiPattern、playbook、cards、videoFrames、platformCopy、policy。`;
}

export function getStageTimeline() {
  return agentStages.map((stage, index) => ({
    ...stage,
    index,
    event: `stage.${stage.key}`
  }));
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, max) {
  const words = String(text).split("");
  const lines = [];
  let line = "";
  for (const ch of words) {
    if ((line + ch).length > max) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function svgForPack(pack) {
  const W = 1240;
  const cw = 380;
  const ch = 540;
  const gap = 28;
  const rows = Math.ceil(pack.cards.length / 3);
  const H = rows * ch + (rows + 1) * gap + 80;
  const items = pack.cards
    .map((card, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = gap + col * (cw + gap);
      const y = 80 + gap + row * (ch + gap);
      const headLines = wrapText(card.headline, 12);
      const bodyLines = wrapText(card.body, 22);
      return `
        <g transform="translate(${x} ${y})">
          <rect width="${cw}" height="${ch}" rx="22" fill="#0E1014" stroke="${card.accent}" stroke-width="2"/>
          <rect x="20" y="20" width="140" height="32" rx="16" fill="${card.accent}"/>
          <text x="90" y="41" fill="#0E1014" text-anchor="middle" font-size="15" font-family="Inter, sans-serif" font-weight="700">${escapeXml(card.eyebrow)}</text>
          ${headLines.map((l, i) => `<text x="22" y="${110 + i * 44}" fill="#F5F7FA" font-size="34" font-weight="800" font-family="Inter, sans-serif">${escapeXml(l)}</text>`).join("")}
          <rect x="22" y="${110 + headLines.length * 44 + 14}" width="${cw - 44}" height="${ch - (110 + headLines.length * 44 + 14) - 70}" rx="14" fill="#161A22"/>
          ${bodyLines.map((l, i) => `<text x="40" y="${110 + headLines.length * 44 + 50 + i * 28}" fill="#C4CAD4" font-size="18" font-family="Inter, sans-serif">${escapeXml(l)}</text>`).join("")}
          <text x="22" y="${ch - 24}" fill="#5B6473" font-size="14" font-family="Inter, sans-serif">0${index + 1} / 06 · ${escapeXml(pack.direction.label)}</text>
        </g>
      `;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#0A0C10"/>
        <stop offset="100%" stop-color="#161A22"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <text x="${gap}" y="46" fill="#F5F7FA" font-size="26" font-weight="800" font-family="Inter, sans-serif">${escapeXml(pack.title)}</text>
    <text x="${gap}" y="68" fill="#7C8492" font-size="14" font-family="Inter, sans-serif">${escapeXml(pack.direction.label)} · ${escapeXml(pack.core)}</text>
    ${items}
  </svg>`;
}
