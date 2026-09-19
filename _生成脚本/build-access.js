/**
 * 提交材料 —— 评审入口页生成器
 *
 * 生成：
 *   作品站点/access.html          评审入口页（部署到 GitHub Pages）
 *   提交材料/二维码/*.png          供上传佐证材料用的二维码图
 *
 * 运行：
 *   NODE_PATH="$(npm root -g)" node build-access.js
 *
 * 二维码在构建时生成、以 inline SVG 内联进 HTML，因此站点运行时依旧零依赖。
 *
 * ⚠️ 下面的 AGENT 三项需要你填。留空时页面会显式显示「待填」，不会静默出错。
 */

const fs = require("fs");
const path = require("path");
const QR = require("qrcode");

const SITE = path.resolve(__dirname, "..");              // 作品站点/
const ROOT = path.resolve(SITE, "..");                   // 项目根
const QR_DIR = path.join(ROOT, "提交材料", "二维码");

// ============================================================
// 待填项 —— 在智雅平台生成后填进来，然后重跑本脚本
// ============================================================
const AGENT = {
  url: "",        // 智雅平台「化学三棱镜」的测试链接（智能体发布页可生成）
  account: "",    // 测试账号，没有就留空
  password: "",   // 测试密码，没有就留空
};

// 三个入口
const ENTRIES = [
  {
    key: "workbench",
    kind: "学生端",
    name: "探究工作台",
    url: "https://chem-prism.github.io/",
    color: "var(--w-teal)",
    desc: "18 个模拟器，覆盖四大滴定、电化学、光谱与质谱、色谱与分离、空间结构、数据与质量。每个模拟器同时呈现符号层曲线、宏观层装置与微观层粒子。",
    how: "无需登录。点左侧导航切换模拟器，拖动参数滑块，三层视图同步变化。",
  },
  {
    key: "teacher",
    kind: "教师端",
    name: "学情画像看板",
    url: "https://chem-prism.github.io/teacher.html?demo=1",
    color: "var(--w-indigo)",
    desc: "解析智雅导出的《历史会话详情》，生成「知识点 × 表征层」双维卡点分布、迷思概念排行与三层通过率。",
    how: "无需登录。打开即载入示例数据；正式使用时把导出的 xlsx 拖进页面即可，数据全部在浏览器本地解析，不上传。",
  },
  {
    key: "agent",
    kind: "智能体本体",
    name: "化学三棱镜",
    url: AGENT.url,
    color: "var(--w-amber)",
    desc: "三重表征诊断、工作台派发、教材知识速查、学情画像、作业与实验报告批改、备课助手，共 7 个技能。",
    how: AGENT.account
      ? `需登录智雅平台。测试账号：${AGENT.account}　密码：${AGENT.password}`
      : "需登录智雅平台后进入智能体。",
  },
];

// ============================================================
// 二维码
// ============================================================
async function qrSvg(url) {
  const svg = await QR.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  // 去掉固定宽高，改由 CSS 控制尺寸
  return svg.replace(/<svg([^>]*?)width="[^"]*"\s*height="[^"]*"/, "<svg$1");
}

async function qrPng(url, file) {
  await QR.toFile(file, url, { width: 640, margin: 2, errorCorrectionLevel: "M" });
}

// ============================================================
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function buildPage() {
  const cards = [];
  for (const e of ENTRIES) {
    const missing = !e.url;
    const qr = missing ? "" : await qrSvg(e.url);
    cards.push(`
      <article class="entry" style="--c:${e.color}">
        <div class="entry-head">
          <span class="entry-kind">${esc(e.kind)}</span>
          <h3>${esc(e.name)}</h3>
        </div>
        <p class="entry-desc">${esc(e.desc)}</p>
        <p class="entry-how">${esc(e.how)}</p>
        <div class="entry-foot">
        ${missing
          ? `<div class="qr qr-missing"><span>待填</span><small>请在智雅平台生成测试链接后<br>重跑 build-access.js</small></div>
             <span class="entry-url">链接待填</span>`
          : `<div class="qr">${qr}</div>
             <a class="entry-url" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a>`}
        </div>
      </article>`);
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>化学三棱镜 · 使用入口</title>
<meta name="description" content="分析化学三重表征教学智能体的评审入口：探究工作台、教师端学情画像看板与智能体本体。">
<meta name="theme-color" content="#0a0e12">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><polygon points='16 3,30 29,2 29' fill='%23e8a33d'/></svg>">
<link rel="stylesheet" href="css/workbench.css">
<style>
.wrap { max-width: 1080px; margin: 0 auto; padding: 34px 20px 80px; }
.lede { margin: 0 0 6px; font-family: var(--serif); font-size: 27px; font-weight: 700; letter-spacing: .01em; }
.lede-sub { color: var(--dim); font-size: 14px; margin: 0 0 30px; max-width: 62ch; line-height: 1.85; }
.lede-sub b { color: var(--text); font-weight: 600; }

.entries { display: grid; grid-template-columns: repeat(auto-fit, minmax(272px, 1fr)); gap: 14px; margin-bottom: 34px; }
.entry {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--r);
  padding: 17px 18px 18px; display: flex; flex-direction: column;
  border-top: 2px solid var(--c);
}
.entry-kind {
  display: inline-block; font-size: 11px; letter-spacing: .08em; color: var(--c);
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  border-radius: 3px; padding: 1px 7px; margin-bottom: 8px;
}
.entry h3 { margin: 0; font-family: var(--serif); font-size: 17px; font-weight: 700; }
.entry-desc { color: var(--dim); font-size: 12.5px; line-height: 1.75; margin: 10px 0 8px; }
.entry-how { color: var(--faint); font-size: 12px; line-height: 1.7; margin: 0 0 16px; }
.entry-foot { margin-top: auto; }        /* 三张卡片的二维码统一贴底对齐 */
.entry-url {
  display: block; margin-top: 9px; font-family: var(--mono); font-size: 11px;
  color: var(--dim); text-decoration: none; word-break: break-all; text-align: center;
}
.entry-url:hover { color: var(--c); }

.qr {
  width: 132px; height: 132px; margin: 0 auto; padding: 9px;
  background: #fff; border-radius: 5px; display: flex; align-items: center; justify-content: center;
}
.qr svg { width: 100%; height: 100%; display: block; }
.qr-missing {
  background: var(--sunken); border: 1px dashed var(--edge);
  flex-direction: column; gap: 5px; text-align: center;
}
.qr-missing span { font-family: var(--mono); font-size: 19px; color: var(--w-amber); }
.qr-missing small { font-size: 10px; color: var(--faint); line-height: 1.5; }

.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px; margin-bottom: 32px; }
.step-col h4 { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--dim); letter-spacing: .04em; }
.step { display: flex; gap: 11px; margin-bottom: 12px; font-size: 13px; line-height: 1.72; color: var(--dim); }
.step b { color: var(--text); font-weight: 600; }
.step-n {
  flex: none; width: 21px; height: 21px; border-radius: 50%;
  background: var(--sunken); border: 1px solid var(--line);
  font-family: var(--mono); font-size: 11px; color: var(--dim);
  display: flex; align-items: center; justify-content: center; margin-top: 2px;
}

.quick { background: var(--sunken); border: 1px solid var(--line); border-radius: var(--r); padding: 17px 19px; }
.quick h4 { margin: 0 0 11px; font-size: 13px; font-weight: 600; color: var(--w-teal); }
.quick ol { margin: 0; padding-left: 19px; color: var(--dim); font-size: 13px; line-height: 2; }
.quick b { color: var(--text); font-weight: 600; }

.foot { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--faint); font-size: 11.5px; line-height: 1.9; }
</style>
</head>
<body>
<div class="wrap">

  <p class="lede">化学三棱镜 · 使用入口</p>
  <p class="lede-sub">
    面向《分析化学》本科二年级的<b>三重表征探究训练</b>智能体。学生端做「<b>不直接给答案</b>」的认知诊断，
    教师端承接学情画像、作业与实验报告批改、备课。<br>
    理论骨架是 Johnstone 三重表征（宏观—微观—符号）——学生在三个层面之间的转换断裂，是本作品要诊断的靶子。
  </p>

  <div class="entries">${cards.join("")}</div>

  <div class="steps">
    <div class="step-col">
      <h4>学生端怎么用</h4>
      <div class="step"><span class="step-n">1</span><span>在智能体里<b>直接提问</b>，或贴一道做错的题、说一句说不清的困惑。</span></div>
      <div class="step"><span class="step-n">2</span><span>它会先判断你卡在哪一层，然后<b>一个问题一个问题地问</b>——追问阶段不给答案、不给数值、不给步骤。</span></div>
      <div class="step"><span class="step-n">3</span><span>需要动手验证时，它会派发一条<b>带参数的工作台链接</b>，把曲线、烧杯和粒子视图一起打开。</span></div>
      <div class="step"><span class="step-n">4</span><span>你答对之后，它会出一道验证题；确认你确实通了，才给出<b>《本次探讨回顾》</b>与<b>《表征层次诊断》</b>。</span></div>
    </div>
    <div class="step-col">
      <h4>教师端怎么用</h4>
      <div class="step"><span class="step-n">1</span><span>把作业或实验报告的照片、电子稿交给智能体，<b>批量批改</b>，错因自动归到 MC 编码。</span></div>
      <div class="step"><span class="step-n">2</span><span>把智雅导出的<b>《历史会话详情》xlsx</b> 拖进看板，自动生成卡点分布与三层通过率。</span></div>
      <div class="step"><span class="step-n">3</span><span>看板<b>不连数据库</b>，全部在浏览器本地解析；导入时姓名自动转成 S01／S02 编号。</span></div>
      <div class="step"><span class="step-n">4</span><span>需要备课材料时，让它按知识点生成教案框架、课件大纲与分层作业。</span></div>
    </div>
  </div>

  <div class="quick">
    <h4>给评审的最短体验路径（约 2 分钟）</h4>
    <ol>
      <li>打开<b>探究工作台</b>，左侧选<b>酸碱滴定</b>。拖动「酸的浓度」滑块，看突跃范围怎么变；同时看<b>烧杯里指示剂颜色的变化区间</b>与<b>粒子视图里 H⁺ 和 OH⁻ 的相对多少</b>——这三块是同一次操作的三层呈现。</li>
      <li>切到<b>沉淀平衡</b>，拖动 c(Cl⁻) 与 c(I⁻) 两个滑块，越过曲线上红色的<b>「结论反转点」</b>——「Ksp 小的先沉淀」这句话在那一段不再成立。</li>
      <li>打开<b>学情画像看板</b>（已自动载入示例数据），看「知识点 × 表征层」双维热力图与迷思概念排行。</li>
      <li>想体验诊断对话本身，请从上方<b>智能体本体</b>进入，直接说「我在分步沉淀这里想不通」。</li>
    </ol>
  </div>

  <p class="foot">
    探究工作台为纯静态站点，无构建步骤、无第三方库（看板解析 xlsx 时使用一个本地化的表格工具库）。<br>
    所有示例数据均为合成数据，不含真实学生信息；正式使用时导入的数据会在浏览器本地完成脱敏。
  </p>

</div>
</body>
</html>
`;
}

// ============================================================
async function main() {
  const html = await buildPage();
  fs.writeFileSync(path.join(SITE, "access.html"), html);
  console.log("  ✓ 作品站点/access.html");

  fs.mkdirSync(QR_DIR, { recursive: true });
  for (const e of ENTRIES) {
    if (!e.url) { console.log(`  · 跳过二维码：${e.name}（链接待填）`); continue; }
    const f = path.join(QR_DIR, `${e.key}.png`);
    await qrPng(e.url, f);
    console.log(`  ✓ 提交材料/二维码/${e.key}.png`);
  }

  const missing = ENTRIES.filter(e => !e.url).map(e => e.name);
  if (missing.length) {
    console.log(`\n⚠️  待填链接：${missing.join("、")}。填好后重跑本脚本，页面与二维码会一并更新。`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
