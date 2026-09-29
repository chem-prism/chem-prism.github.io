/**
 * 玻璃仪器与实验装置的绘制工具
 *
 * views.js 里的 Beaker 只能画烧杯——那够「参数型」模拟器用（调滑块看曲线），
 * 但要还原一个真实的制备实验（称量 → 溶解 → 加热 → 趁热过滤 → 蒸发 →
 * 结晶 → 抽滤 → 洗涤 → 晾干 → 称重 → 比色），需要一整套器皿。
 *
 * 本模块只负责「画」——把某个装置画在给定的矩形框里。
 * 实验流程与化学判断在 sims/ 里，不在这里。
 *
 * 约定：
 *   · 每个装置函数签名统一为 draw(ctx, box, opts)，box = {x, y, w, h}
 *     为装置**内部**的包围盒（不含外壁线宽）。
 *   · 颜色用 [r,g,b,a] 数组表示，与 views.js 的 indicatorColor 等一致。
 *   · 动画量（气泡相位、晶体生长）由调用方传时间 t 进来，本模块不持有状态。
 */

import { fit } from './views.js';
import { prussianBlueColor, PRUSSIAN_WHITE } from './chem.js';

/* ============================================================
 * 基础
 * ============================================================ */

export const GLASS = {
  stroke: 'rgba(160,180,196,0.55)',
  soft: 'rgba(160,180,196,0.26)',
  lw: 1.6,
};

/**
 * 玻璃色，只给透明度。
 *
 * 有 4 个参数型模拟器（aas / chromatography / extraction / gravimetry）需要自己
 * 画一小块玻璃，各自抄了一遍 `rgba(160,180,196,x)`。色相重复了 22 次，
 * 但**透明度是有意的**——0.10 的浅阴影到 0.7 的高光，共 12 档，各不相同。
 * 所以这里只收敛色相、保留各自的 alpha，不要图省事一并替成 GLASS.stroke/soft，
 * 那会把刻意做出来的层次压平。
 */
export const glassColor = (a) => `rgba(160,180,196,${a})`;

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

const rgba = ([r, g, b, a = 1]) => `rgba(${r},${g},${b},${a})`;

/** 两色之间线性插值，k ∈ [0,1] */
export function mix(c1, c2, k) {
  const t = Math.min(1, Math.max(0, k));
  return [0, 1, 2, 3].map(i => {
    const a = c1[i] ?? (i === 3 ? 1 : 0);
    const b = c2[i] ?? (i === 3 ? 1 : 0);
    const v = a + (b - a) * t;
    return i === 3 ? v : Math.round(v);
  });
}

/**
 * 容器的通用画法：
 *   1. 裁切到器皿内壁，按液位填液体
 *   2. 描玻璃轮廓
 * pathFn(ctx) 负责定义**内壁**路径（调用前本函数会 beginPath）。
 */
export function vessel(ctx, pathFn, box, o = {}) {
  const { liquid, level = 0, lw = GLASS.lw, stroke = GLASS.stroke, highlight = true, tilt = 0 } = o;

  if (liquid && level > 0.002) {
    const [lr, lg, lb, la = 1] = liquid;
    ctx.save();
    ctx.beginPath();
    pathFn(ctx);
    ctx.clip();
    const yTop = box.y + box.h * (1 - Math.min(1, level));

    if (Math.abs(tilt) > 1e-4) {
      /*
       * 容器倾斜时，液面在**世界坐标**里仍是水平的——这是重力说了算的。
       * 若照管轴方向填，画出来就是一个跟着器皿一起歪掉的液面，一眼假。
       *
       * 调用方已 rotate(tilt)，所以世界「向下」在局部坐标里是 (sin tilt, cos tilt)。
       * 把坐标系转回 −tilt 再向下填，就得到世界水平的液面。
       */
      const span = (box.w + box.h) * 2;
      ctx.translate(box.x + box.w / 2, yTop);
      ctx.rotate(-tilt);
      // 倾斜时用纯色（渐变会跟坐标系走，失去纵深感）
      ctx.fillStyle = rgba(liquid);
      ctx.fillRect(-span, 0, span * 2, span);
    } else {
      // 液体纵向渐变：顶部略淡、底部略深，模拟光线从上方射入的纵深感
      const liqGrad = ctx.createLinearGradient(0, yTop, 0, box.y + box.h);
      liqGrad.addColorStop(0, `rgba(${lr},${lg},${lb},${la * 0.78})`);
      liqGrad.addColorStop(1, `rgba(${lr},${lg},${lb},${Math.min(la * 1.08, 1)})`);
      ctx.fillStyle = liqGrad;
      ctx.fillRect(box.x - 2, yTop, box.w + 4, box.h - (yTop - box.y) + 4);
    }

    // 液面效果：弯月面椭圆 + 高光线
    if (highlight) {
      if (Math.abs(tilt) > 1e-4) {
        // 倾斜时保持原来的直线高光（已在旋转坐标系里）
        const span = (box.w + box.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-span, 0);
        ctx.lineTo(span, 0);
        ctx.stroke();
      } else {
        /*
         * 正立时：弯月面（凹面朝上）。
         *
         * 玻璃中的水被器壁"拉高"、管心最低——滴定读数读的就是这个最低点
         * （实验三十一：视线与弯液面最低点同高）。所以弧线必须是"微笑"形。
         *
         * ⚠️ ellipse 的第 8 个参数 counterclockwise 必须给 true。
         * 默认 false 时从 π 走到 0 会绕椭圆**上半周**，弧顶反而比两端高，
         * 画出来是"皱眉"形——方向刚好反了（已用像素实测确认）。
         */
        const meniscusRy = Math.max(2.5, Math.min(5, box.w * 0.04));
        const meniscusRx = box.w * 0.42;
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(
          box.x + box.w / 2, yTop,
          meniscusRx, meniscusRy,
          0, Math.PI, 0, true   // true → 走下半周：两端高、中心低
        );
        ctx.stroke();
        // 液面下方一条细高光线增强分界感
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(box.x + box.w * 0.08, yTop + meniscusRy);
        ctx.lineTo(box.x + box.w * 0.92, yTop + meniscusRy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /*
   * 这里**故意不画接触阴影**。
   *
   * 曾经在 vessel() 里加过一道椭圆软阴影（ctx.filter='blur(5px)'），实测有三个问题，
   * 所以撤掉了，不是忘了——
   *   1. 看不见：在场景底色 #111a20（R=17）上最暗只压到 R=14，Δ3/255。
   *      就算把 alpha 提到 0.6、blur 降到 3 也只有很淡的一块，等于白付开销。
   *   2. 跟着歪：调用方 rotate(tilt) 之后，阴影也进了旋转坐标系，
   *      倾倒的量筒底下会甩出一道斜的暗条（已实测）。
   *   3. 放错层：vessel() 只拿到一个矩形框，无从知道器皿底下是什么。
   *      夹在铁架台上的滴定管、拿在手上的移液管、温度计，底部都不接触台面，
   *      给它们画"坐在台面上"的阴影本身就是错的。
   *
   * 「器皿落在台面上」是**场景**才知道的事，所以在场景层解决：
   * 见本文件末尾的 BENCH_Y 与 drawBench()。
   */

  // 玻璃描边
  ctx.save();
  ctx.beginPath();
  pathFn(ctx);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  /*
   * 玻璃左壁渐变高光：screen 合成叠一道竖向白色渐变，模拟玻璃左侧的透光。
   *
   * ⚠️ 这一笔**不能挂在液位上**（`liquid && level > 0.002`），曾经就是这么写的，后果实测如下
   * （`_glassware-test.html` 的「液位扫描」行，取样 y 在液面之上）：
   *     液位 0     → 管腔 = 背景色 (17,26,32)，一个像素没画
   *     液位 0.02  → 左半侧抬到 (36,44,50)，向右衰减
   *     液位 0.5   → 液面之上**与 0.02 逐位相同**
   * 也就是说：有没有液体，会让整个管腔在「纯背景」和「横跨约 60% 管宽的一层柔和亮带」
   * 之间硬跳。眼睛把后者读成「这管子装了东西」——于是空试管看着像盛了黑色液体。
   *
   * 两条修法：
   *   ① **与液位解耦**：空的玻璃也有壁反光，两者连续，不再是一次跳变。
   *   ② **收窄**：0.14→0.34 而不是 0→0.32。宽渐晕像「填充」，窄带才像「玻璃壁反光」。
   *
   * 注意**不加内腔底色**：平铺一层底色同样会被读成「填充」，方向是反的。
   * 空玻璃之所以像空玻璃，正是因为背景能透过来。
   */
  if (!o.noGlassSheen) {
    const sheenGrad = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
    sheenGrad.addColorStop(0,    'rgba(255,255,255,0)');
    sheenGrad.addColorStop(0.13, 'rgba(255,255,255,0)');
    sheenGrad.addColorStop(0.24, 'rgba(255,255,255,0.16)');
    sheenGrad.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    sheenGrad.addColorStop(0.52, 'rgba(255,255,255,0)');
    sheenGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    pathFn(ctx);
    ctx.clip();
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  }
}

/**
 * 在给定框里按**自然宽高比**居中放置器皿。
 *
 * 不能直接拿调用方的框当形状——框是按版面给的，比例和器皿无关。
 * 直接照抄会把蒸发皿拉成高杯子、把表面皿拉成拱门。
 * anchor='bottom' 时贴着框底放（器皿坐在台面上）。
 */
export function fitAspect(box, aspect, anchor = 'center') {
  let w = box.w, h = w * aspect;
  if (h > box.h) { h = box.h; w = h / aspect; }
  const x = box.x + (box.w - w) / 2;
  const y = anchor === 'bottom'
    ? box.y + box.h - h
    : box.y + (box.h - h) / 2;
  return { x, y, w, h };
}

/** 刻度线 */
function graduations(ctx, box, n, o = {}) {
  const { side = 'right', len = 11, inset = 4 } = o;
  ctx.save();
  ctx.strokeStyle = GLASS.soft;
  ctx.lineWidth = 1;
  for (let i = 1; i <= n; i++) {
    const y = box.y + (box.h * i) / (n + 1);
    const x0 = side === 'right' ? box.x + box.w - len - inset : box.x + inset;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** 居中文字 */
function label(ctx, text, cx, y, o = {}) {
  const { size = 11, color = cssVar('--faint', '#4c5b67'), weight = '' } = o;
  ctx.save();
  ctx.font = `${weight} ${size}px "PingFang SC", sans-serif`.trim();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, cx, y);
  ctx.restore();
}

/* ============================================================
 * 器皿
 * ============================================================ */

/**
 * 锥形瓶（三角瓶）—— 制备实验的反应容器
 *
 * 真实锥形瓶：细颈、圆肩、侧壁几乎是直的锥面、平底。肩部是**平滑过渡**，
 * 不是折角——折角一出来就不像锥形瓶了。
 */
export function conicalFlask(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const neckW = Math.max(11, w * 0.24);
  const neckH = h * 0.34;
  const bodyH = h - neckH;
  const shoulderY = y + neckH;
  const nx = x + (w - neckW) / 2;
  const r = Math.min(7, w * 0.09);

  const path = c => {
    c.moveTo(nx, y);
    c.lineTo(nx, shoulderY);
    // 圆肩：控制点留在脖子正下方，曲线先竖直再外张
    c.quadraticCurveTo(nx, shoulderY + bodyH * 0.30, x, y + h - r);
    c.quadraticCurveTo(x, y + h, x + r, y + h);
    c.lineTo(x + w - r, y + h);
    c.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    c.quadraticCurveTo(nx + neckW, shoulderY + bodyH * 0.30, nx + neckW, shoulderY);
    c.lineTo(nx + neckW, y);
  };

  // 液面只算瓶身，且封顶在肩以下——真实操作里锥形瓶从不装满到瓶颈
  const filled = Math.min(1, Math.max(0, o.level || 0)) * 0.94 * bodyH;
  const level = filled / h;          // filled 已是「离瓶底多高」，直接除以总高
  vessel(ctx, path, box, { ...o, level });

  // 瓶口：一圈略宽的口沿
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw + 0.6;
  ctx.beginPath();
  ctx.moveTo(nx - 2.5, y);
  ctx.lineTo(nx + neckW + 2.5, y);
  ctx.stroke();
  ctx.restore();

  // 与 beaker 同一形状：倾倒的落点用 mouth，液流才不会落在瓶颈外面
  return { box, mouth: { x: x + w / 2, y }, bottom: { x: x + w / 2, y: y + h } };
}

/** Beaker and attachment coordinates share the same fitted geometry. */
export function beaker(ctx, box, o = {}) {
  const b = fitAspect(box, 1.05, 'bottom');
  const { x, y, w, h } = b;
  vessel(ctx, c => {
    c.moveTo(x - w * 0.06, y);
    c.lineTo(x, y + h * 0.04);
    c.lineTo(x, y + h - 6);
    c.quadraticCurveTo(x, y + h, x + 6, y + h);
    c.lineTo(x + w - 6, y + h);
    c.quadraticCurveTo(x + w, y + h, x + w, y + h - 6);
    c.lineTo(x + w, y);
  }, b, o);
  graduations(ctx, { x, y: y + h * 0.14, w, h: h * 0.72 }, 4);
  return { box: b, mouth: { x: x + w / 2, y }, bottom: { x: x + w / 2, y: y + h } };
}

export function gasMeasuringTube(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = Math.min(w * 0.18, 8);
  const path = c => {
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  };
  vessel(ctx, path, box, o);
  if (o.rim !== false) rimEllipse(ctx, x + w / 2, y, w / 2, o);
  graduations(ctx, { x, y: y + 10, w, h: h - 20 }, 10, { side: 'right', len: Math.min(14, w * 0.55) });
  ctx.save();
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillStyle = cssVar('--faint', '#4c5b67');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('mL', x + w - 3, y + 10);
  ctx.restore();
}

export function burette(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const tubeW = Math.max(12, w * 0.28);
  const tx = x + (w - tubeW) / 2;
  const bodyH = h * 0.82;
  const liquid = o.liquid || [160, 215, 205, 0.35];
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw;
  ctx.beginPath();
  ctx.moveTo(tx, y);
  ctx.lineTo(tx, y + bodyH);
  ctx.lineTo(tx + tubeW, y + bodyH);
  ctx.lineTo(tx + tubeW, y);
  ctx.stroke();
  ctx.restore();
  vessel(ctx, c => {
    c.rect(tx, y, tubeW, bodyH);
  }, { x: tx, y, w: tubeW, h: bodyH }, { liquid, level: o.level ?? 0.18 });
  ctx.save();
  ctx.strokeStyle = GLASS.soft;
  ctx.fillStyle = cssVar('--faint', '#4c5b67');
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 10; i++) {
    const yy = y + 8 + (bodyH - 16) * i / 10;
    ctx.beginPath();
    ctx.moveTo(tx + tubeW, yy);
    ctx.lineTo(tx + tubeW + (i % 2 ? 5 : 9), yy);
    ctx.stroke();
    if (i % 2 === 0) ctx.fillText(String(i * 5), tx + tubeW + 12, yy);
  }
  const my = y + 8 + (bodyH - 16) * (1 - (o.level ?? 0.18));
  ctx.strokeStyle = cssVar('--w-green', '#6bbc57');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(tx + tubeW / 2, my, tubeW * 0.45, 3.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx + tubeW / 2, y + bodyH);
  ctx.lineTo(tx + tubeW / 2, y + bodyH + 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tx + tubeW / 2, y + bodyH + 14, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.moveTo(tx + tubeW / 2 + 7, y + bodyH + 14);
  ctx.lineTo(tx + w * 0.84, y + bodyH + 24);
  ctx.lineTo(tx + w * 0.84, y + h);
  ctx.stroke();
  ctx.restore();
}

export function volumetricFlask(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const neckW = w * 0.22, neckH = h * 0.42, nx = x + (w - neckW) / 2;
  const path = c => {
    c.moveTo(nx, y);
    c.lineTo(nx, y + neckH);
    c.quadraticCurveTo(nx, y + neckH + h * 0.12, x, y + h * 0.78);
    c.quadraticCurveTo(x + w * 0.05, y + h, x + w * 0.25, y + h);
    c.lineTo(x + w * 0.75, y + h);
    c.quadraticCurveTo(x + w * 0.95, y + h, x + w, y + h * 0.78);
    c.quadraticCurveTo(nx + neckW, y + neckH + h * 0.12, nx + neckW, y + neckH);
    c.lineTo(nx + neckW, y);
  };
  vessel(ctx, path, box, o);
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(nx - 5, y);
  ctx.lineTo(nx + neckW + 5, y);
  ctx.moveTo(nx, y + neckH * 0.48);
  ctx.lineTo(nx + neckW, y + neckH * 0.48);
  ctx.stroke();
  ctx.restore();
}

export function pipette(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(o.angle || 0);
  ctx.strokeStyle = GLASS.stroke;
  ctx.fillStyle = 'rgba(190,210,220,0.20)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-w * 0.38, -3);
  ctx.lineTo(w * 0.28, -3);
  ctx.quadraticCurveTo(w * 0.36, -3, w * 0.40, -8);
  ctx.lineTo(w * 0.47, -8);
  ctx.lineTo(w * 0.47, 8);
  ctx.lineTo(w * 0.40, 8);
  ctx.quadraticCurveTo(w * 0.36, 3, w * 0.28, 3);
  ctx.lineTo(-w * 0.38, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * 平口器皿的管口椭圆。
 *
 * 平口的管子（试管、量气管、比色管）如果只画一条横线封口，看上去是「一根实心柱子」；
 * 补一小段椭圆，才读得出「这是个开口的空腔」。宽度取管宽的一半、高度压到 0.15 左右，
 * 就是俯视一点的透视感——比值再大就变成一个盘子了。
 */
function rimEllipse(ctx, cx, cy, rx, o = {}) {
  ctx.save();
  ctx.strokeStyle = o.stroke || GLASS.stroke;
  ctx.lineWidth = Math.max(1, GLASS.lw * 0.85);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(2, rx * 0.30), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function testTube(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = w / 2;
  const path = c => {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h - r);
    c.arc(x + r, y + h - r, r, 0, Math.PI);
    c.closePath();
  };
  vessel(ctx, path, box, o);
  if (o.rim !== false) rimEllipse(ctx, x + w / 2, y, r, o);
}

export function stirPlate(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.fillStyle = 'rgba(36,45,53,0.95)';
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.4;
  ctx.roundRect ? ctx.roundRect(x, y, w, h, 5) : ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,220,230,0.32)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.45, y + h * 0.37, w * 0.25, h * 0.13, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = cssVar('--w-red', '#e05a4f');
  ctx.beginPath(); ctx.arc(x + w * 0.82, y + h * 0.66, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function thermometer(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.strokeStyle = GLASS.stroke; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h - 8); ctx.stroke();
  ctx.fillStyle = cssVar('--w-red', '#e05a4f');
  ctx.beginPath(); ctx.arc(x + w / 2, y + h - 5, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x + w / 2 - 2, y + h * 0.35, 4, h * 0.58);
  ctx.restore();
}

export function stopwatch(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = Math.min(w, h) * 0.36, cx = x + w / 2, cy = y + h * 0.57;
  ctx.save();
  ctx.strokeStyle = GLASS.stroke; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.55, cy - r * 0.15); ctx.stroke();
  ctx.fillStyle = cssVar('--text', '#dde5ec'); ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center'; ctx.fillText(o.text || '00.0 s', cx, cy + r + 15);
  ctx.restore();
}

/**
 * 铁架台：底座 + 立杆 + 可选铁夹。
 *
 * **回传夹持锚点**，调用方据此摆放被夹的器皿——铁圈和被夹物各算各的坐标，
 * 一定会对不齐（`magnesium-molar` 就是这么错的：铁圈空悬在试管口上方 35 px，
 * 试管自己站在台面上）。用法：
 *
 *   const st = retortStand(ctx, {…}, { clamp: { y: …, radius: 26 } });
 *   // 把试管摆到「管身正好落在圈里」
 *   testTube(ctx, { x: st.clamp.x - w / 2, y: st.clamp.y - 40, w, h });
 *
 * @returns { pole, clamp? } —— clamp 为 {x, y, radius}（圈心与半径，世界坐标）
 */
export function retortStand(ctx, { x, y, w, h }, o = {}) {
  ctx.save();
  ctx.strokeStyle = o.stroke || GLASS.stroke;
  ctx.fillStyle = 'rgba(120,145,160,0.13)';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y + h - 10, w, 10);
  ctx.strokeRect(x, y + h - 10, w, 10);
  const pole = x + w * 0.3;
  ctx.beginPath();
  ctx.moveTo(pole, y + h - 10);
  ctx.lineTo(pole, y);
  ctx.stroke();
  // 一个铁架台往往要夹两件器皿（如置换法：反应管 + 量气筒），
  // 所以 clamp 既接受单个对象，也接受数组。
  const wants = o.clamp ? (Array.isArray(o.clamp) ? o.clamp : [o.clamp]) : [];
  const clamps = wants.map(spec => {
    const radius = spec.radius || 30;
    const cx = spec.x != null ? spec.x : pole + radius + 12;
    const cy = spec.y;
    // 横臂到**圈的左缘**为止。画到圈心的话，臂会从器皿中间穿过去——
    // 玻璃是透明的，臂就明晃晃地横在管子里（踩过）
    ctx.beginPath();
    ctx.moveTo(pole, cy);
    ctx.lineTo(cx - radius * 0.9, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, Math.max(4, radius * 0.17), 0, 0, Math.PI * 2);
    ctx.stroke();
    return { x: cx, y: cy, radius };
  });
  ctx.restore();
  // clamp 保留单数形式（老调用方在用），新增 clamps 数组
  return { pole, clamp: clamps[0] || null, clamps };
}

export function tubing(ctx, points, o = {}) {
  ctx.save();
  ctx.lineWidth = o.width || 6;
  ctx.strokeStyle = o.color || 'rgba(160,174,184,0.85)';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.restore();
}

/**
 * 量筒
 *
 * 两个曾经的错处：管口做成左右对称的 V 形缺口（那是漏斗不是量筒，
 * 量筒只有**单侧**壶嘴），底座画成比管身还宽的椭圆，看着像脱离的圆盘。
 */
/**
 * 壶嘴在**未旋转**坐标系里的位置。
 *
 * ⚠️ 想倾倒必须让 `tilt > π/2`（≈1.571 rad）：只有转过 90°，壶嘴才低于筒心，
 * 液体才会往外流。实测 81.4°（1.42 rad）时壶嘴比筒心还高 0.15h——
 * 液体全聚到筒底端，一点也倒不出来，而筒身几乎躺平，画出来像一块斜板。
 */
function cylinderAnchors(box) {
  const { x, y, w, h } = box;
  const spout = Math.min(9, w * 0.55);
  const rimY = y + 7;
  return {
    mouth: { x: x + w / 2, y: rimY },
    spout: { x: x + spout * 0.5, y: rimY - spout * 0.85 },   // 壶嘴尖端
    bottom: { x: x + w / 2, y: y + h },
  };
}

/**
 * 量筒。返回锚点 `{ box, tilt, mouth, spout, bottom }`（世界坐标）——
 * 倾倒的液流必须从 `spout` 出发，手写起点必然对不上。
 *
 * ⚠️ 锚点计算**不能**靠在旋转坐标系里调一次 `cylinderBody` 去取返回值：
 * 那样会把它**再画一遍**（同一个器皿画两次，边缘发虚）。踩过。
 */
export function cylinder(ctx, box, o = {}) {
  const tilt = o.tilt || 0;
  const a = cylinderAnchors(box);
  if (!tilt) {
    cylinderBody(ctx, box, o, 0);
    return { box, tilt: 0, ...a };
  }
  // 绕**几何中心**旋转。液面仍按世界水平填充，见 vessel 的 tilt 说明。
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate(tilt);
  cylinderBody(ctx, { x: -box.w / 2, y: -box.h / 2, w: box.w, h: box.h }, o, tilt);
  ctx.restore();
  // 同一个旋转，把锚点换算回世界坐标
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const ox = box.x + box.w / 2, oy = box.y + box.h / 2;
  const w2 = p => {
    const dx = p.x - ox, dy = p.y - oy;
    return { x: ox + dx * c - dy * s, y: oy + dx * s + dy * c };
  };
  return { box, tilt, mouth: w2(a.mouth), spout: w2(a.spout), bottom: w2(a.bottom) };
}

function cylinderBody(ctx, box, o = {}, tilt = 0) {
  const { x, y, w, h } = box;
  const spout = Math.min(9, w * 0.55);
  const rimY = y + 7;
  const footH = Math.max(7, Math.min(12, h * 0.07));
  const tubeBottom = y + h - footH;

  const path = c => {
    c.moveTo(x + w, rimY);                              // 右管口
    c.lineTo(x + spout * 1.35, rimY);
    c.lineTo(x + spout * 0.5, rimY - spout * 0.85);     // 单侧壶嘴
    c.lineTo(x, rimY);
    c.lineTo(x, tubeBottom - 5);
    c.quadraticCurveTo(x, tubeBottom, x + 5, tubeBottom);
    c.lineTo(x + w - 5, tubeBottom);
    c.quadraticCurveTo(x + w, tubeBottom, x + w, tubeBottom - 5);
  };
  vessel(ctx, path, { ...box, h: h - footH }, { ...o, tilt });

  graduations(ctx, { x, y: rimY + 10, w, h: tubeBottom - rimY - 16 }, 6,
    { side: 'left', len: Math.min(13, w * 0.45) });

  // The base remains attached when a cylinder is tilted.
  {
    const fw = Math.min(w * 1.25, w + 18);
    const fx = x + (w - fw) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fx, y + h);
    ctx.lineTo(fx + fw, y + h);
    ctx.lineTo(x + w, tubeBottom);
    ctx.lineTo(x, tubeBottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(160,180,196,0.10)';
    ctx.fill();
    ctx.strokeStyle = GLASS.stroke;
    ctx.lineWidth = GLASS.lw;
    ctx.stroke();
    ctx.restore();
  }
}

/** 短颈漏斗 + 滤纸 */
export function funnel(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const coneH = h * 0.52;
  const stemW = Math.max(5, w * 0.11);
  const cx = x + w / 2;
  const sx = cx - stemW / 2;

  // 锥体（内壁）
  const conePath = c => {
    c.moveTo(x, y);
    c.lineTo(sx, y + coneH);
    c.lineTo(sx + stemW, y + coneH);
    c.lineTo(x + w, y);
    c.closePath();
  };
  // 液面在锥体里
  if (o.level > 0.002) {
    ctx.save();
    ctx.beginPath();
    conePath(ctx);
    ctx.clip();
    const yTop = y + coneH * (1 - Math.min(1, o.level));
    ctx.fillStyle = rgba(o.liquid || [225, 232, 238, 0.3]);
    ctx.fillRect(x - 2, yTop, w + 4, coneH);
    ctx.restore();
  }
  // 滤纸（贴在锥体内壁的浅色三角）
  if (o.paper !== false) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(sx + 0.5, y + coneH - 3);
    ctx.lineTo(sx + stemW - 0.5, y + coneH - 3);
    ctx.lineTo(x + w - 3, y + 3);
    ctx.closePath();
    ctx.fillStyle = o.paperDirty ? 'rgba(190,170,120,0.35)' : 'rgba(226,232,238,0.10)';
    ctx.fill();
    ctx.restore();
  }
  vessel(ctx, conePath, { ...box, h: coneH }, { ...o, liquid: null, level: 0 });

  // 短颈
  vessel(ctx, c => {
    c.moveTo(sx, y + coneH);
    c.lineTo(sx, y + h);
    c.lineTo(sx + stemW, y + h);
    c.lineTo(sx + stemW, y + coneH);
  }, { x: sx, y: y + coneH, w: stemW, h: h - coneH },
  { liquid: o.stemLiquid || o.liquid, level: o.stemLevel ?? 0.65 });
}

/**
 * 蒸发皿 —— 浅底、敞口、平底，用来蒸发浓缩
 *
 * 关键在**浅**。照调用方给的框直接画会得到一个高杯子，
 * 所以这里按自然宽高比（高 ≈ 宽的四分之一）重算，并贴着框底放。
 */
export function evapDish(ctx, box, o = {}) {
  const b = fitAspect(box, 0.28, 'bottom');
  const { x, y, w, h } = b;

  const path = c => {
    c.moveTo(x, y);
    c.bezierCurveTo(x + w * 0.05, y + h * 0.9, x + w * 0.16, y + h, x + w * 0.32, y + h);
    c.lineTo(x + w * 0.68, y + h);
    c.bezierCurveTo(x + w * 0.84, y + h, x + w * 0.95, y + h * 0.9, x + w, y);
  };
  vessel(ctx, path, b, o);

  // 皿口：一圈加厚的口沿
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw + 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1.5, y);
  ctx.lineTo(x + w + 1.5, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * 水浴锅（含套圈）
 *
 * 套圈是架在**锅沿上**的圆环，蒸发皿坐在环孔里。
 * 画成一片椭圆会看着像锅盖，所以这里画成双线圆环。
 */
export function waterBath(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const wallTop = y + h * 0.26;
  const potBottom = y + h;
  const potH = potBottom - wallTop;

  const body = c => {
    c.moveTo(x + 4, wallTop);
    c.lineTo(x + 4, potBottom - 9);
    c.quadraticCurveTo(x + 4, potBottom, x + 15, potBottom);
    c.lineTo(x + w - 15, potBottom);
    c.quadraticCurveTo(x + w - 4, potBottom, x + w - 4, potBottom - 9);
    c.lineTo(x + w - 4, wallTop);
  };

  // 水位只按锅体高度算，封顶在锅沿以下
  const waterFrac = Math.min(1, Math.max(0, o.water ?? 0.68));
  vessel(ctx, body, box, {
    liquid: o.liquid || [150, 190, 215, 0.26],
    level: (waterFrac * potH) / h,
  });

  // 锅沿
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw + 0.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 2, wallTop);
  ctx.lineTo(x + w - 2, wallTop);
  ctx.stroke();
  ctx.restore();

  // 套圈：双线圆环坐在锅沿上
  const ringW = Math.min(o.ringW ?? w * 0.6, w * 0.86);
  const ry = ringW * 0.12;
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, wallTop + (o.ringY ?? 0), ringW / 2, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, wallTop + (o.ringY ?? 0), ringW / 2 - 3.5, Math.max(2, ry - 2.6), 0, 0, Math.PI * 2);
  ctx.strokeStyle = GLASS.soft;
  ctx.stroke();
  ctx.restore();

  // 水面冒的热气
  if (o.steam > 0.02) steam(ctx, { x, y: wallTop - h * 0.55, w, h: h * 0.55 }, o.t || 0, o.steam);
}

/**
 * 布氏漏斗（减压抽滤）
 *
 * 结构：上段是直筒（放滤纸和多孔瓷板），下段收成锥形，再接一段细管。
 * 抽滤时滤饼就堆在瓷板上。
 */
/**
 * 布氏漏斗。
 *
 * ⚠️ 形状是**浅碗锥 + 短颈**，不是直筒。
 * 曾经写成「直筒段占 40% 高、上下等宽」，于是画出来是一个巨大的梯形盒子，
 * 碗里还盛着一整块**矩形**液体——一眼就不像布氏漏斗（图见 `_scenes-all.html` 的
 * mohr-salt 第 8/9 步）。现在碗壁是收口的锥，液体裁在锥里，液面自然上宽下窄。
 *
 * @param o.cake  滤饼厚度 0~1（堆在瓷板上，宽度随瓷板、不是满碗宽）
 * @param o.dripping 是否正在滴液
 */
export function buchner(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const bowlH = h * 0.54;                       // 碗（锥）占大头
  const plateW = Math.max(10, w * 0.22);        // 瓷板宽度
  const plateY = y + bowlH;
  const cx = x + w / 2;
  const px0 = cx - plateW / 2, px1 = cx + plateW / 2;
  const stemW = Math.max(6, w * 0.14);
  const sx = cx - stemW / 2;
  const neckY = plateY + h * 0.10;              // 颈部（瓷板到细管之间）

  const bowlPath = c => {
    c.moveTo(x, y);
    c.lineTo(px0, plateY);
    c.lineTo(px1, plateY);
    c.lineTo(x + w, y);
    c.closePath();
  };

  // 碗里的液体：裁在锥形里，液面才跟着碗的宽度收
  vessel(ctx, bowlPath, { x, y, w, h: bowlH }, { liquid: o.liquid, level: o.level });

  // 外轮廓：碗壁 + 颈 + 细管
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(px0, plateY);
  ctx.lineTo(sx, neckY);
  ctx.lineTo(sx, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(px1, plateY);
  ctx.lineTo(sx + stemW, neckY);
  ctx.lineTo(sx + stemW, y + h);
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // 多孔瓷板
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(px0, plateY);
  ctx.lineTo(px1, plateY);
  ctx.stroke();
  ctx.fillStyle = GLASS.soft;
  for (let i = 0; i < 5; i++) {
    const qx = px0 + 3 + (plateW - 6) * (i / 4);
    ctx.beginPath();
    ctx.arc(qx, plateY - 3.2, 1.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 滤饼：堆在瓷板上，宽度跟着瓷板走，是个中间略高的小丘
  if (o.cake > 0.01) {
    const cw = plateW * (0.72 + 0.26 * Math.min(1, o.cake));
    const ch = Math.min(bowlH * 0.42, 22) * Math.min(1, o.cake);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, plateY);
    ctx.quadraticCurveTo(cx - cw * 0.26, plateY - ch, cx, plateY - ch);
    ctx.quadraticCurveTo(cx + cw * 0.26, plateY - ch, cx + cw / 2, plateY);
    ctx.closePath();
    ctx.fillStyle = rgba(o.cakeColor || [150, 212, 202, 0.85]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  /* 滴液：从细管口往下滴。
   * 传了 o.t 就按相位下落（越落越淡，落到底就重来）；不传就画三滴静止的——
   * 后者是给自检页那种「不跑 rAF」的场合留的。 */
  if (o.dripping) {
    ctx.save();
    ctx.fillStyle = rgba(o.dropColor || [200, 226, 220, 0.6]);
    const tipY = y + h;
    if (o.t) {
      for (let i = 0; i < 3; i++) {
        const ph = ((o.t * 0.85) + i / 3) % 1;
        ctx.globalAlpha = Math.sin(Math.PI * ph) * 0.9;
        ctx.beginPath();
        ctx.ellipse(cx, tipY + 4 + ph * 30, 2.3, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, tipY - 14 + i * 9, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/**
 * 抽滤瓶（带支管）
 * 形状与锥形瓶同源：细颈圆肩锥体。液面同样封在肩以下。
 */
export function suctionFlask(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const neckW = Math.max(11, w * 0.28);
  const neckH = h * 0.30;
  const bodyH = h - neckH;
  const shoulderY = y + neckH;
  const nx = x + (w - neckW) / 2;
  const r = Math.min(7, w * 0.08);

  const path = c => {
    c.moveTo(nx, y);
    c.lineTo(nx, shoulderY);
    c.quadraticCurveTo(nx, shoulderY + bodyH * 0.30, x, y + h - r);
    c.quadraticCurveTo(x, y + h, x + r, y + h);
    c.lineTo(x + w - r, y + h);
    c.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    c.quadraticCurveTo(nx + neckW, shoulderY + bodyH * 0.30, nx + neckW, shoulderY);
    c.lineTo(nx + neckW, y);
  };

  const filled = Math.min(1, Math.max(0, o.level || 0)) * 0.92 * bodyH;
  vessel(ctx, path, box, { ...o, level: filled / h });

  // 支管接在**瓶颈**侧面——抽滤瓶的支管本来就在颈上，不在瓶身。
  // 近端起点正好落在颈壁上（不越过），两端不封口，看着就是长在瓶上的。
  const armY = y + neckH * 0.82;
  const x0 = nx + neckW;
  const aw = Math.max(5, neckW * 0.44);
  const dx = w * 0.34, dy = -h * 0.15;
  const x1 = x0 + dx, y1 = armY + dy;
  const ang = Math.atan2(dy, dx);
  const px = Math.sin(ang) * aw / 2, py = -Math.cos(ang) * aw / 2;

  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x0, armY - py);
  ctx.lineTo(x1 - px, y1 - py);
  ctx.lineTo(x1 + px, y1 + py);
  ctx.lineTo(x0, armY + py);
  ctx.stroke();
  ctx.restore();

  // 瓶口
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw + 0.6;
  ctx.beginPath();
  ctx.moveTo(nx - 3, y);
  ctx.lineTo(nx + neckW + 3, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * 表面皿（晾干用）
 * 也是**浅**的——一个浅浅的穹顶，不是拱门。同样按自然宽高比重算。
 */
/**
 * 表面皿（晾干用）
 *
 * 画成**开口朝上的浅碟**而不是朝下的穹顶——晶体是摊在皿里的，
 * 朝下的穹顶会让晶体看起来悬在弧线外面。
 */
export function watchGlass(ctx, box, o = {}) {
  const b = fitAspect(box, 0.12, 'bottom');
  const { x, y, w, h } = b;

  // 皿底最深处为 h（二次曲线控制点取 1.85h 时，最低点在 0.925h）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y + h * 2, x + w, y);
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // 皿内可用的深度：二次曲线在横向位置 u 处为 4u(1−u)·0.925h
  const depthFn = u => 3.7 * u * (1 - u);

  if (o.crystal > 0.01) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y + h * 2, x + w, y);
    ctx.closePath();
    ctx.clip();
    crystals(ctx, {
      x: x + w * 0.12, y: y + h * 0.10,
      w: w * 0.76, h: h * 0.65,
    }, o.t || 0, o.crystal, { color: o.crystalColor, spin: false, depthFn });
    ctx.restore();
  }
}

/**
 * 比色管（25 mL，带标线）
 * 管口是**平口开放**的（之前画成圆角，看着像封口的安瓿），只有底部收圆。
 */
export function comparisonTube(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = w * 0.42;                       // 底部圆角半径
  const path = c => {
    c.moveTo(x, y);                          // 平口
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.closePath();
  };
  vessel(ctx, path, box, o);
  if (o.rim !== false) rimEllipse(ctx, x + w / 2, y, w / 2, o);

  // 25 mL 标线
  ctx.save();
  ctx.strokeStyle = GLASS.soft;
  ctx.lineWidth = 1;
  const my = y + h * 0.28;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.4, my);
  ctx.lineTo(x + w, my);
  ctx.stroke();
  ctx.restore();

  // 口沿
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw + 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 1, y);
  ctx.lineTo(x + w + 1, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * 试剂瓶。本项目第一次画试剂瓶——此前各 sim 都用容量瓶或烧杯冒充，
 * 但试剂瓶有收口瓶颈、肩、螺口盖/磨口塞和标签区，冒充不了。
 *
 * o.shape 三种形态（自然宽高比不同，必须走 fitAspect）：
 *   'narrow' 细口瓶（液体试剂，默认）h/w ≈ 2.35
 *   'wide'   广口瓶（固体试剂）      h/w ≈ 1.65
 *   'drop'   滴瓶（指示剂液体，带尖嘴滴头与胶帽）h/w ≈ 2.60
 * o = { shape, liquid, solid, level, cap: 'screw'|'stopper', brown,
 *       label: ['EDTA 标液', '0.005 M'], labelTone: 'light'|'amber' }
 * 液位只按瓶身有效容积算、封顶在肩以下（conicalFlask 那条规矩同样适用）。
 */
export function reagentBottle(ctx, box, o = {}) {
  const shape = o.shape || 'narrow';
  const aspect = shape === 'wide' ? 1.65 : shape === 'drop' ? 2.60 : 2.35;
  const b = fitAspect(box, aspect, 'bottom');
  const { x, y, w, h } = b;
  const neckW = w * (shape === 'wide' ? 0.62 : 0.36);
  const nx = x + (w - neckW) / 2;
  const neckH = h * (shape === 'wide' ? 0.10 : 0.20);
  const bodyTop = y + h * (shape === 'wide' ? 0.22 : 0.34);
  const r = Math.min(6, w * 0.10);

  const path = c => {
    c.moveTo(nx, y);
    c.lineTo(nx, y + neckH);
    c.quadraticCurveTo(nx, bodyTop, x, bodyTop);            // 左肩：先竖直、再外张
    c.lineTo(x, y + h - r);
    c.quadraticCurveTo(x, y + h, x + r, y + h);
    c.lineTo(x + w - r, y + h);
    c.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    c.lineTo(x + w, bodyTop);
    c.quadraticCurveTo(x + w, bodyTop, nx + neckW, y + neckH);
    c.lineTo(nx + neckW, y);
  };

  // 液位：瓶身有效高度 = 底到肩线，封顶 0.94 防止灌进瓶颈
  const bodyH = y + h - bodyTop;
  const filled = Math.min(1, Math.max(0, o.level ?? 0)) * 0.94 * bodyH;
  vessel(ctx, path, b, { ...o, level: filled / h });

  // 广口瓶的固体粉末：瓶底一小丘；颗粒坐标用 R2 序列（crystals 的教训）
  if (o.solid && (o.level ?? 0) > 0.01) {
    const moundH = bodyH * 0.30 * Math.min(1, o.level);
    const n = Math.round(10 + 26 * Math.min(1, o.level));
    ctx.save();
    ctx.fillStyle = rgba(o.solid);
    for (let i = 0; i < n; i++) {
      const u = (i * 0.7548776662466927) % 1;
      const v = (i * 0.5698402909980532) % 1;
      const ux = 0.10 + 0.80 * u;
      const taper = Math.sin(Math.PI * ux);                 // 边缘薄、中间厚
      const gx = x + w * ux;
      const gy = y + h - 2 - moundH * taper * (0.15 + 0.85 * v);
      ctx.beginPath();
      ctx.arc(gx, gy, 1.3 + 2.0 * v, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 棕色瓶：瓶身叠一层棕调 + 轮廓换暖色
  if (o.brown) {
    ctx.save();
    ctx.beginPath();
    path(ctx);
    ctx.clip();
    ctx.fillStyle = 'rgba(122,72,32,0.20)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    path(ctx);
    ctx.strokeStyle = 'rgba(168,124,84,0.55)';
    ctx.lineWidth = GLASS.lw;
    ctx.stroke();
    ctx.restore();
  }

  // 标签区（最多两行，字号自动缩小以放进纸面，不溢出）
  if (o.label && o.label.length) {
    const lw = w * 0.72, lh = Math.min(h * 0.26, w * 0.72);
    const lx = x + (w - lw) / 2, ly = bodyTop + bodyH * 0.16;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(lx, ly, lw, lh, 2) : ctx.rect(lx, ly, lw, lh);
    ctx.fillStyle = o.labelTone === 'amber' ? 'rgba(228,214,170,0.88)' : 'rgba(232,232,226,0.86)';
    ctx.fill();
    ctx.clip();
    const lines = o.label.slice(0, 2);
    let fs = Math.max(8, Math.round(w * 0.15));
    ctx.font = `600 ${fs}px "PingFang SC", sans-serif`;
    for (const t of lines) {
      while (fs > 6 && ctx.measureText(t).width > lw - 6) {
        fs -= 1;
        ctx.font = `600 ${fs}px "PingFang SC", sans-serif`;
      }
    }
    ctx.fillStyle = 'rgba(40,46,52,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((t, i) => {
      ctx.fillText(t, lx + lw / 2, ly + lh * (lines.length === 1 ? 0.5 : 0.30 + 0.40 * i));
    });
    ctx.restore();
  }

  // 封口：螺口盖 / 玻璃磨口塞 / 滴瓶的滴头
  const capH = Math.max(5, w * 0.11);
  ctx.save();
  if (shape === 'drop') {
    // 滴头：颈口上收成细尖，再套一个小胶帽
    const tipH = h * 0.045;
    ctx.beginPath();
    ctx.moveTo(nx, y);
    ctx.lineTo(nx + neckW, y);
    ctx.lineTo(nx + neckW * 0.70, y - tipH);
    ctx.lineTo(nx + neckW * 0.30, y - tipH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(190,210,220,0.22)';
    ctx.fill();
    ctx.strokeStyle = GLASS.stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y - tipH - w * 0.11, neckW * 0.62, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(130,66,76,0.92)';
    ctx.fill();
  } else if (o.cap === 'stopper') {
    ctx.beginPath();
    ctx.moveTo(nx - 2, y);
    ctx.lineTo(nx + neckW + 2, y);
    ctx.lineTo(nx + neckW * 0.72, y - capH);
    ctx.lineTo(nx + neckW * 0.28, y - capH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(190,210,220,0.22)';
    ctx.fill();
    ctx.strokeStyle = GLASS.stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(nx - 2.5, y - capH, neckW + 5, capH, 2)
                  : ctx.rect(nx - 2.5, y - capH, neckW + 5, capH);
    ctx.fillStyle = 'rgba(60,68,76,0.95)';
    ctx.fill();
    ctx.strokeStyle = GLASS.stroke;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();

  return { box: b, mouth: { x: nx + neckW / 2, y } };
}

/**
 * 洗耳球（吸球）——课件：移取 100.00 mL 水样「用手动助吸器或洗耳球都可以」，
 * 这里画洗耳球。梨形：底宽、腰收、顶接短嘴。
 * o = { squeeze: 0~1, angle }；squeeze 把球体横向压一压，表示正在吸液。
 */
export function washBulb(ctx, box, o = {}) {
  const b = fitAspect(box, 1.20, 'center');
  const { x, y, w, h } = b;
  const sq = Math.min(1, Math.max(0, o.squeeze || 0));
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(o.angle || 0);
  ctx.scale(1 - 0.12 * sq, 1);
  const hw = w / 2, hh = h / 2;
  ctx.beginPath();
  ctx.moveTo(0, hh);
  ctx.bezierCurveTo(hw * 1.02, hh, hw * 0.86, hh * 0.10, hw * 0.40, -hh * 0.52);
  ctx.lineTo(hw * 0.24, -hh * 0.78);
  ctx.lineTo(-hw * 0.24, -hh * 0.78);
  ctx.lineTo(-hw * 0.40, -hh * 0.52);
  ctx.bezierCurveTo(-hw * 0.86, hh * 0.10, -hw * 1.02, hh, 0, hh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56,62,70,0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,166,180,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // 高光弧：模拟橡胶反光（stirringRod 同款双层画法）
  ctx.beginPath();
  ctx.ellipse(-hw * 0.34, hh * 0.10, hw * 0.22, hh * 0.42, 0.25, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // 短嘴
  ctx.beginPath();
  ctx.moveTo(0, -hh * 0.78);
  ctx.lineTo(0, -hh * 1.06);
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  return { box: b };
}

/* ============================================================
 * 台面设备
 * ============================================================ */

/** 电热板 */
export function hotplate(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const topH = h * 0.3;
  ctx.save();
  ctx.fillStyle = 'rgba(40,48,56,0.9)';
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, topH, 3) : ctx.rect(x, y, w, topH);
  ctx.fill();
  ctx.stroke();

  // 面板
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + 3, y + topH, w - 6, h - topH - 2, 3) : ctx.rect(x + 3, y + topH, w - 6, h - topH - 2);
  ctx.fillStyle = 'rgba(28,34,40,0.95)';
  ctx.fill();
  ctx.stroke();

  // 加热指示：温度越高越亮
  const k = Math.min(1, Math.max(0, o.heat || 0));
  if (k > 0.02) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(224,90,79,${0.18 + 0.55 * k})`;
    ctx.arc(x + w * 0.24, y + topH + (h - topH) * 0.45, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 旋钮
  ctx.beginPath();
  ctx.fillStyle = 'rgba(70,80,90,0.9)';
  ctx.arc(x + w * 0.72, y + topH + (h - topH) * 0.45, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GLASS.stroke;
  ctx.stroke();
  ctx.restore();

  if (o.steam > 0.02) steam(ctx, { x, y: y - h * 0.9, w, h: h * 0.9 }, o.t || 0, o.steam);
}

/** 台秤 / 电子天平 */
export function balance(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const panY = y + h * 0.16;
  const readH = h * 0.30;

  ctx.save();
  // 秤盘
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.14, panY);
  ctx.lineTo(x + w * 0.86, panY);
  ctx.stroke();
  // A real support joins the pan to the housing; feet sit at box.bottom.
  ctx.fillStyle = 'rgba(120,140,155,0.6)';
  ctx.fillRect(x + w * 0.46, panY, w * 0.08, h * 0.10);
  ctx.fillRect(x + w * 0.14, y + h * 0.86, w * 0.10, h * 0.14);
  ctx.fillRect(x + w * 0.76, y + h * 0.86, w * 0.10, h * 0.14);
  // 盘上的东西
  if (o.item) {
    ctx.fillStyle = rgba(o.itemColor || [120, 126, 132, 0.9]);
    const iw = w * 0.34 * (o.itemSize ?? 1);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, panY - 5, iw / 2, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 机身
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + w * 0.06, y + h * 0.26, w * 0.88, h * 0.60, 4)
    : ctx.rect(x + w * 0.06, y + h * 0.26, w * 0.88, h * 0.60);
  ctx.fillStyle = 'rgba(30,37,44,0.95)';
  ctx.fill();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 读数窗
  const rx = x + w * 0.13, ry = y + h * 0.36, rw = w * 0.74, rh = h * 0.22;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, 2) : ctx.rect(rx, ry, rw, rh);
  ctx.fillStyle = 'rgba(12,17,22,0.95)';
  ctx.fill();

  if (o.reading != null && o.reading !== '') {
    ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.fillStyle = k2c(o.tone, o.reading);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.reading, rx + rw / 2, ry + rh / 2 + 0.5);
  }
  ctx.restore();
}

const k2c = (tone, fallback) => ({
  good: cssVar('--w-green', '#6bbc57'),
  warn: cssVar('--w-amber', '#e8a33d'),
  bad: cssVar('--w-red', '#e05a4f'),
}[tone] || cssVar('--text', '#dde5ec'));

/**
 * 玻璃棒
 * 要有实心玻璃的观感：一条过细的线看着像铁丝，撑不起「搅拌」这个动作。
 */
export function stirringRod(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const ang = (o.angle ?? 18) * Math.PI / 180;
  const lw = Math.max(5, w * 0.30);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(ang);
  ctx.lineCap = 'round';
  // 棒身：浅色填充 + 描边，读起来才是一根玻璃棒
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, h / 2);
  ctx.strokeStyle = 'rgba(170,190,205,0.30)';
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/**
 * 台式 pH 计整机：机身（显示屏 + 设置/校准/读数三键）+ 立杆 + 夹持臂 + 复合电极。
 * 电极从臂端垂下，玻璃球泡停在 bulbY 处——调用方把烧杯/缓冲瓶放在它下面，
 * 让球泡浸入液面（课件要求「玻璃泡全部浸没」）。
 *
 * o = { reading:'3.35', slopePct:98.2, bulbY, note:'' }
 * 返回 { bulb: {x, y} }，供调用方对齐液面。
 */
export function phMeter(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const bodyW = w * 0.52, bodyH = Math.max(56, h * 0.30);
  const bodyX = x, bodyY = y + h - bodyH;

  // 立杆与夹持臂（先画，压在机身后面）
  const px = x + w * 0.60;
  const ay = y + h * 0.10;
  const ax = x + w * 0.86;
  ctx.save();
  ctx.strokeStyle = 'rgba(120,140,155,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px, bodyY + bodyH * 0.35);
  ctx.lineTo(px, ay);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.restore();

  // 复合电极：从臂端垂下的细玻璃管，上段为参比套管，末端玻璃球泡
  const bulbY = o.bulbY ?? y + h * 0.88;
  const ex = ax;
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(ex, ay);
  ctx.lineTo(ex, bulbY - 6);
  ctx.stroke();
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(ex, ay + 4);
  ctx.lineTo(ex, ay + Math.max(10, (bulbY - ay) * 0.30));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, bulbY - 4, 4.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(190,210,220,0.30)';
  ctx.fill();
  ctx.stroke();
  // 电缆：从电极顶端弧线回到机身
  ctx.strokeStyle = 'rgba(90,102,114,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ex, ay + 2);
  ctx.bezierCurveTo(ex - w * 0.10, y + h * 0.02, bodyX + bodyW * 0.9, y + h * 0.06,
    bodyX + bodyW * 0.94, bodyY + 4);
  ctx.stroke();
  ctx.restore();

  // 机身
  ctx.save();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bodyX, bodyY, bodyW, bodyH, 4) : ctx.rect(bodyX, bodyY, bodyW, bodyH);
  ctx.fillStyle = 'rgba(30,37,44,0.95)';
  ctx.fill();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 显示屏：读数 + （校准时）斜率
  const sx = bodyX + bodyW * 0.10, sy = bodyY + bodyH * 0.10;
  const sw = bodyW * 0.80, sh = bodyH * 0.46;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(sx, sy, sw, sh, 2) : ctx.rect(sx, sy, sw, sh);
  ctx.fillStyle = 'rgba(12,17,22,0.95)';
  ctx.fill();
  if (o.reading != null && o.reading !== '') {
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = cssVar('--text', '#dde5ec');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(o.reading), sx + sw / 2, sy + sh * (o.slopePct != null ? 0.36 : 0.52));
  }
  if (o.slopePct != null) {
    ctx.font = '8px ui-monospace, Menlo, monospace';
    ctx.fillStyle = cssVar('--w-amber', '#e8a33d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`斜率 ${Number(o.slopePct).toFixed(1)}%`, sx + sw / 2, sy + sh * 0.78);
  }

  // 三个键：设置 / 校准 / 读数
  const keys = ['设置', '校准', '读数'];
  const kw = bodyW * 0.24, kh = bodyH * 0.20;
  keys.forEach((lb, i) => {
    const kx = bodyX + bodyW * (0.10 + 0.30 * i);
    const ky = bodyY + bodyH * 0.66;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(kx, ky, kw, kh, 2) : ctx.rect(kx, ky, kw, kh);
    ctx.fillStyle = 'rgba(70,80,90,0.9)';
    ctx.fill();
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(200,212,222,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lb, kx + kw / 2, ky + kh / 2 + 0.5);
  });
  ctx.restore();

  return { bulb: { x: ex, y: bulbY - 4 } };
}

/**
 * 1 cm 比色皿（小尺寸图示）。四面透光，两侧毛面以磨砂色区分；
 * 盛液 2/3（课件要求）；正面近口处一个小 V 标记——配对时要求
 * 「带 V 的面始终朝同一方向」，这样每次光路经过的两面不变。
 * o = { liquid: [r,g,b,a], level = 0.66 }
 */
export function cuvette(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = Math.min(3, w * 0.18);
  const path = c => {
    c.moveTo(x, y + 5);
    c.lineTo(x, y + h - r);
    c.quadraticCurveTo(x, y + h, x + r, y + h);
    c.lineTo(x + w - r, y + h);
    c.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    c.lineTo(x + w, y + 5);
  };
  const level = Math.min(1, Math.max(0, o.level ?? 0.66)) * 0.9;
  vessel(ctx, path, { x, y, w, h }, { liquid: o.liquid, level, highlight: false });
  // 两次毛面（左右两侧的窄磨砂条）
  ctx.save();
  ctx.fillStyle = 'rgba(200,210,220,0.16)';
  ctx.fillRect(x, y + 5, Math.max(2, w * 0.14), h - 5);
  ctx.fillRect(x + w - Math.max(2, w * 0.14), y + 5, Math.max(2, w * 0.14), h - 5);
  // 口沿
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 5);
  ctx.lineTo(x + w + 1, y + 5);
  ctx.stroke();
  // V 标记
  if (w >= 14) {
    ctx.font = `${Math.max(7, Math.round(w * 0.28))}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = 'rgba(190,205,218,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('v', x + w * 0.52, y + 0.5);
  }
  ctx.restore();
}

/**
 * 分光光度计整机（美谱达 V-1100D 简化形）。
 * 课件 P14 的五个部件对应到画面：光源（左端暖色指示灯）、
 * 单色器（机身头部转盘 = 波长旋钮）、吸收池（试样室里的比色皿）、
 * 检测器（屏上读数）、显示器（绿色 LCD）。
 * P35 面板上的操作件也照画：波长旋钮、MODE 键、∨ 调零、∧ 参比 100%T、
 * 以及切换「参比/样品」的拉杆。
 *
 * o = { wavelength: 480, reading: '0.430', mode: 'A', cell: [r,g,b,a], lidOpen: false }
 * 返回 { cell: {x, y, w, h} }（比色皿位置，供调用方标注）。
 */
export function spectrophotometer(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const bodyH = Math.max(74, h * 0.60);
  const bodyY = y + h - bodyH;

  ctx.save();
  // 机身
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, bodyY, w, bodyH, 4) : ctx.rect(x, bodyY, w, bodyH);
  ctx.fillStyle = 'rgba(30,37,44,0.95)';
  ctx.fill();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 单色器舱盖（机身上沿的窄条）
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + 3, bodyY + 3, w - 6, bodyH * 0.16, 2)
    : ctx.rect(x + 3, bodyY + 3, w - 6, bodyH * 0.16);
  ctx.fillStyle = 'rgba(44,54,64,0.95)';
  ctx.fill();

  // 光源指示灯（左端，暖色）
  ctx.beginPath();
  ctx.arc(x + w * 0.035, bodyY + bodyH * 0.11, Math.max(2.6, w * 0.018), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(232,163,61,0.85)';
  ctx.fill();

  // 试样室（左下的内凹舱）：比色皿立在舱内
  const compW = w * 0.34, compX = x + w * 0.06;
  const compY = bodyY + bodyH * 0.28, compH = bodyH * 0.58;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(compX, compY, compW, compH, 2) : ctx.rect(compX, compY, compW, compH);
  ctx.fillStyle = 'rgba(16,21,27,0.95)';
  ctx.fill();
  ctx.strokeStyle = GLASS.soft;
  ctx.lineWidth = 1;
  ctx.stroke();
  const cellBox = {
    x: compX + compW * 0.34, y: compY + compH * 0.16,
    w: compW * 0.32, h: compH * 0.78,
  };
  cuvette(ctx, cellBox, { liquid: o.cell || [225, 232, 238, 0.25] });

  // 参比/样品拉杆（试样室上沿的小柄）
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(compX + compW * 0.78, compY - 5, compW * 0.18, 5, 2)
    : ctx.rect(compX + compW * 0.78, compY - 5, compW * 0.18, 5);
  ctx.fillStyle = 'rgba(90,104,118,0.9)';
  ctx.fill();

  // 绿色 LCD：波长 + 读数
  const lcdX = x + w * 0.46, lcdY = bodyY + bodyH * 0.26;
  const lcdW = w * 0.48, lcdH = bodyH * 0.42;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(lcdX, lcdY, lcdW, lcdH, 2) : ctx.rect(lcdX, lcdY, lcdW, lcdH);
  ctx.fillStyle = 'rgba(8,26,16,0.95)';
  ctx.fill();
  ctx.font = '8px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(63,220,127,0.85)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`波长 ${Number(o.wavelength ?? 480).toFixed(1)} nm`, lcdX + 5, lcdY + 4);
  if (o.reading != null && o.reading !== '') {
    ctx.font = '600 15px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#3fdc7f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(o.reading), lcdX + lcdW * 0.55, lcdY + lcdH * 0.66);
    ctx.font = '9px ui-monospace, Menlo, monospace';
    ctx.fillText(o.mode || 'A', lcdX + lcdW * 0.90, lcdY + lcdH * 0.66);
  }

  // 波长旋钮 + 三键（机身右下）
  const ky = bodyY + bodyH * 0.80;
  const kx = x + w * 0.50;
  ctx.beginPath();
  ctx.arc(kx, ky + bodyH * 0.06, Math.max(7, w * 0.045), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(70,80,90,0.9)';
  ctx.fill();
  ctx.strokeStyle = GLASS.soft;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,212,222,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(kx, ky + bodyH * 0.06);
  ctx.lineTo(kx + Math.max(4, w * 0.028), ky + bodyH * 0.06 - Math.max(3, w * 0.02));
  ctx.stroke();
  const keys = ['MODE', '∨', '∧'];
  const kw = w * 0.10, kh = bodyH * 0.16;
  keys.forEach((lb, i) => {
    const bx = x + w * (0.62 + 0.13 * i);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, ky, kw, kh, 2) : ctx.rect(bx, ky, kw, kh);
    ctx.fillStyle = 'rgba(70,80,90,0.9)';
    ctx.fill();
    ctx.font = '7px "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(200,212,222,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lb, bx + kw / 2, ky + kh / 2 + 0.5);
  });
  ctx.restore();

  return { cell: cellBox };
}

/* ---------- 配合物实验（实验 10）：离心机、离心管、试管架 ---------- */

/**
 * 台式低速离心机（照 TDZ4-WS 画）：白色机身 + 蓝色面板（转速/时间显示 + 箭头与起停键）
 * + 门盖与门锁拉手；o.open 时画打开的转子仓（角转子一圈 18 个管孔，按 t 旋转）。
 * o = { open: true, rpm: 3000, minutes: 5, spinning: false, unbalanced: false, t }
 */
export function centrifuge(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const bodyH = h * 0.62;
  const bodyY = y + h - bodyH;
  ctx.save();
  // 机身（白色机器，与深色场景拉开）
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, bodyY, w, bodyH, 5) : ctx.rect(x, bodyY, w, bodyH);
  ctx.fillStyle = 'rgba(206,212,218,0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,152,163,0.8)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 蓝色操作面板
  const px = x + w * 0.10, py = bodyY + bodyH * 0.30;
  const pw = w * 0.80, ph = bodyH * 0.42;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 3) : ctx.rect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(58,104,178,0.92)';
  ctx.fill();
  // 屏幕
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(px + pw * 0.06, py + ph * 0.14, pw * 0.50, ph * 0.38, 2)
    : ctx.rect(px + pw * 0.06, py + ph * 0.14, pw * 0.50, ph * 0.38);
  ctx.fillStyle = 'rgba(10,18,30,0.95)';
  ctx.fill();
  ctx.font = '600 9px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#7fc4ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(o.rpm ?? 3000)} r/min`, px + pw * 0.31, py + ph * 0.24);
  ctx.fillText(`${Math.round(o.minutes ?? 5)} min`, px + pw * 0.31, py + ph * 0.44);
  // 按键（箭头 + 起停）
  const keys = ['▲', '▼', '启动'];
  keys.forEach((lb, i) => {
    const kx = px + pw * (0.64 + 0.12 * i);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(kx, py + ph * 0.20, pw * 0.10, ph * 0.50, 2)
      : ctx.rect(kx, py + ph * 0.20, pw * 0.10, ph * 0.50);
    ctx.fillStyle = 'rgba(226,232,238,0.92)';
    ctx.fill();
    ctx.font = '7px "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(40,50,60,0.95)';
    ctx.fillText(lb, kx + pw * 0.05, py + ph * 0.45);
  });
  // 门锁拉手（右侧）
  ctx.fillStyle = 'rgba(120,132,142,0.9)';
  ctx.fillRect(x + w - 4, bodyY + bodyH * 0.30, 4, bodyH * 0.22);
  // 门盖 / 打开的转子仓
  if (o.open) {
    const rx = x + w * 0.14, ry = y + h * 0.04;
    const rw = w * 0.72, rh = h * 0.40;
    // 仓体
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, 4) : ctx.rect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(178,186,194,0.9)';
    ctx.fill();
    ctx.stroke();
    // 转子：一圈管孔
    const cxr = rx + rw / 2, cyr = ry + rh / 2, rr = Math.min(rw, rh) * 0.34;
    const spin = o.spinning ? (o.t || 0) * 2.4 : 0;
    ctx.beginPath();
    ctx.arc(cxr, cyr, rr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52,60,68,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,132,142,0.8)';
    ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = spin + k * Math.PI / 6;
      ctx.beginPath();
      ctx.arc(cxr + Math.cos(a) * rr * 0.68, cyr + Math.sin(a) * rr * 0.68, Math.max(2, rr * 0.14), 0, Math.PI * 2);
      ctx.fillStyle = k < 2 ? 'rgba(190,210,230,0.9)' : 'rgba(28,34,40,0.9)';
      ctx.fill();
    }
    // 门盖（打开：立在后面）
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + w * 0.14, y - h * 0.10, w * 0.72, h * 0.12, 3)
      : ctx.rect(x + w * 0.14, y - h * 0.10, w * 0.72, h * 0.12);
    ctx.fillStyle = 'rgba(196,202,210,0.9)';
    ctx.fill();
    ctx.stroke();
    if (o.unbalanced) {
      ctx.font = '600 10px "PingFang SC", sans-serif';
      ctx.fillStyle = '#e05a4f';
      ctx.textAlign = 'left';
      ctx.fillText('振动！', cxr + rr + 6, cyr);
    }
  } else {
    // 合盖
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + w * 0.06, y + h * 0.10, w * 0.88, bodyH * 0.34, 4)
      : ctx.rect(x + w * 0.06, y + h * 0.10, w * 0.88, bodyH * 0.34);
    ctx.fillStyle = 'rgba(196,202,210,0.92)';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 10 mL 离心管（塑料，螺旋盖、锥形底）。o = { liquid, level, pellet, pelletColor }
 * pellet = 0..1 底部沉淀的高度占比（离心后压实）。
 */
export function centrifugeTube(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = w * 0.5;
  const bodyTop = y + h * 0.12;
  const path = c => {
    c.moveTo(x, bodyTop);
    c.lineTo(x, y + h - r * 1.6);
    c.quadraticCurveTo(x, y + h, x + w / 2, y + h);
    c.quadraticCurveTo(x + w, y + h, x + w, y + h - r * 1.6);
    c.lineTo(x + w, bodyTop);
  };
  const level = Math.min(2 / 3, Math.max(0, o.level ?? 0.5)) * 0.92;   // 课件：不超过 2/3
  vessel(ctx, path, { x, y: bodyTop, w, h: h - (bodyTop - y) }, { liquid: o.liquid, level, highlight: false });
  // 盖
  ctx.save();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x - 1.5, y, w + 3, h * 0.11, 2) : ctx.rect(x - 1.5, y, w + 3, h * 0.11);
  ctx.fillStyle = 'rgba(90,110,130,0.9)';
  ctx.fill();
  ctx.restore();
  // 沉淀（锥底）
  if (o.pellet > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + w * 0.14, y + h - r * 1.2);
    ctx.lineTo(x + w * 0.86, y + h - r * 1.2);
    ctx.lineTo(x + w / 2, y + h - 1);
    ctx.closePath();
    ctx.fillStyle = rgba(o.pelletColor || [235, 238, 240, 0.95]);
    ctx.globalAlpha = Math.min(1, o.pellet);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * 试管架：一条横杆 + N 支试管（可带液色、底部沉淀色）。
 * o.tubes = [{ liquid: [r,g,b,a], level, solid: [r,g,b,a], solidLevel, label, dashed }]
 * dashed = true 时试管用虚线描边（表示"没做这一支"）。
 */
export function testTubeRack(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const tubes = o.tubes || [];
  const n = Math.max(1, tubes.length);
  const slot = w / n;
  const tw = Math.min(slot * 0.52, h * 0.30);
  const th = h * 0.86;
  ctx.save();
  // 架子（两条横杆）
  const railY1 = y + h * 0.34, railY2 = y + h * 0.94;
  ctx.strokeStyle = 'rgba(140,156,170,0.7)';
  ctx.lineWidth = Math.max(3, h * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.03, railY1); ctx.lineTo(x + w * 0.97, railY1);
  ctx.moveTo(x + w * 0.03, railY2); ctx.lineTo(x + w * 0.97, railY2);
  ctx.stroke();
  // 试管
  tubes.forEach((tb, k) => {
    const bx = x + slot * k + (slot - tw) / 2;
    const tubeBox = { x: bx, y: y + h * 0.06, w: tw, h: th };
    if (tb.dashed) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(120,132,142,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(tubeBox.x, tubeBox.y, tubeBox.w, tubeBox.h, tubeBox.w * 0.4)
        : ctx.rect(tubeBox.x, tubeBox.y, tubeBox.w, tubeBox.h);
      ctx.stroke();
      ctx.restore();
    } else {
      testTube(ctx, tubeBox, { liquid: tb.liquid, level: tb.level ?? 0.5 });
      /* 上层不互溶相（萃取分层：上层戊醇 / 下层水相）。
         以前没有这个字段，代码只好把整支管的下半段涂成一种颜色——
         而「分层」恰恰是萃取的全部意义，那样画等于没表达。 */
      if (tb.topLiquid && (tb.topLevel ?? 0) > 0.002) {
        const tl = Math.min(1, tb.topLevel);
        const bottom = tubeBox.y + tubeBox.h * (1 - (tb.level ?? 0.5));
        ctx.save();
        ctx.beginPath();
        ctx.rect(tubeBox.x - 1, bottom - tubeBox.h * tl, tubeBox.w + 2, tubeBox.h * tl + 1);
        ctx.clip();
        ctx.fillStyle = rgba(tb.topLiquid);
        ctx.fillRect(tubeBox.x - 1, bottom - tubeBox.h * tl, tubeBox.w + 2, tubeBox.h * tl);
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tubeBox.x, bottom);
        ctx.lineTo(tubeBox.x + tubeBox.w, bottom);
        ctx.stroke();
        ctx.restore();
      }
      // solid 是**沉淀颜色**（[r,g,b,a]），数量走 solidLevel——两者曾混用一个字段，
      // 数组颜色被 `> 0.02` 静默判否（沉淀永远不画）、传数字则 rgba(0.15) 直接崩。
      const amount = tb.solidLevel ?? (Array.isArray(tb.solid) ? 0.9 : 0);
      if (Array.isArray(tb.solid) && amount > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(tubeBox.x + tubeBox.w / 2, tubeBox.y + tubeBox.h - tubeBox.w * 0.45,
          tubeBox.w * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = rgba(tb.solid);
        ctx.globalAlpha = Math.min(1, amount);
        ctx.fill();
        ctx.restore();
      }
    }
    if (tb.label) {
      ctx.font = '9px "PingFang SC", sans-serif';
      ctx.fillStyle = 'rgba(160,180,196,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(tb.label, bx + tw / 2, railY2 + 6);
    }
  });
  ctx.restore();
}

/* ---------- 蓝晒（实验 08）：印相卡、曝光箱、显影盘 ---------- */

/** 叶脉剪纸剪影（蓝晒的「素材」）——确定性路径，供印相卡反复使用 */
function leafSilhouette(ctx, box, color) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  // 主茎：从左下到右上
  ctx.lineWidth = Math.max(1.4, w * 0.022);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.12, y + h * 0.88);
  ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.55, x + w * 0.86, y + h * 0.14);
  ctx.stroke();
  // 六对侧叶：沿主茎参数取点，小叶椭圆与茎约 50°
  for (let k = 0; k < 6; k++) {
    const t0 = 0.12 + k * 0.145;
    const sx = x + w * (0.12 + 0.74 * t0);
    const sy = y + h * (0.88 - 0.74 * t0 + 0.12 * t0 * t0);
    const rl = (0.16 - k * 0.018);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * (0.11 - k * 0.012), h * rl * 0.5, sgn * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

const PAPER_WHITE = [242, 245, 246, 1];

/**
 * 蓝晒印相卡。
 * o = {
 *   state: 'exposed'（曝光后未洗：底色黄绿、被叶子挡住的地方反而是普鲁士白）
 *        | 'washed'（水洗后：底色已白，靠 oxidized 从普鲁士白渐渐变蓝）
 *   density: 0..1   曝光足量度（背景最终蓝的深浅）
 *   oxidized: 0..1  空气中的氧把普鲁士白氧化成普鲁士蓝的进度
 *   mottle: 0..1    流水显影的洇痕（高亮区被冲出的花白）
 *   blur: 0..1      未干就曝光：花纹边缘发糊
 *   sheen: true     带水光（显影盘中）
 * }
 */
export function cyanotypePrint(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = Math.min(3, w * 0.05);
  const state = o.state || 'washed';
  const density = Math.max(0, Math.min(1, o.density ?? 0.96));
  const oxidized = Math.max(0, Math.min(1, o.oxidized ?? 1));
  // 纸
  // 曝光态的光化学方向别画反：**受光的是背景**——光敏剂分解、黄绿褪去，
  // 变成近白的普鲁士白；被叶子挡住的地方「什么都没发生」，保持黄绿色。
  const EXPOSED_GREEN = [204, 214, 138, 1];                  // 感光剂的黄绿
  ctx.save();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  const field = state === 'exposed'
    ? mix(EXPOSED_GREEN, [PRUSSIAN_WHITE[0], PRUSSIAN_WHITE[1], PRUSSIAN_WHITE[2], 1], density)
    : mix(PAPER_WHITE, prussianBlueColor(density), oxidized);
  ctx.fillStyle = `rgb(${field[0]},${field[1]},${field[2]})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,132,142,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();
  // 花纹（叶子剪影）：曝光态还留着未反应的黄绿，水洗后是纸白
  const silColor = state === 'exposed'
    ? `rgb(${EXPOSED_GREEN[0]},${EXPOSED_GREEN[1]},${EXPOSED_GREEN[2]})`
    : 'rgb(242,245,246)';
  const blur = Math.max(0, Math.min(1, o.blur || 0));
  if (blur > 0.02) {
    for (const off of [-4, -2, 0, 2, 4]) {
      ctx.globalAlpha = 0.42;
      leafSilhouette(ctx, { x: x + blur * off, y: y + blur * off * 0.5, w, h }, silColor);
    }
    ctx.globalAlpha = 1;
  } else {
    leafSilhouette(ctx, { x, y, w, h }, silColor);
  }
  // 流水显影的洇痕：几条水平冲出条带
  const mottle = Math.max(0, Math.min(1, o.mottle || 0));
  if (mottle > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${0.30 * mottle})`;
    for (let k = 0; k < 4; k++) {
      const yy = y + h * (0.16 + 0.21 * k);
      ctx.fillRect(x, yy, w, h * 0.05 * (0.7 + 0.3 * ((k * 0.7548776662) % 1)));
    }
  }
  // 带水的反光
  if (o.sheen) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const yy = y + h * (0.30 + 0.22 * k);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.10, yy);
      ctx.lineTo(x + w * 0.90, yy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * 紫外曝光箱：顶部灯罩（两支紫外灯管 + 计时小屏）+ 光锥 + 底部夹好的
 * 「亚克力板三明治」（下板、印相卡、素材、上板、四角夹子）。
 * o = { on: true, seconds: 40, print: <cyanotypePrint 的 o> }
 */
export function uvExposureBox(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const lampH = h * 0.20;
  const trayY = y + h * 0.52;
  const trayH = h * 0.44;

  ctx.save();
  // 灯罩
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + w * 0.06, y, w * 0.88, lampH, 4) : ctx.rect(x + w * 0.06, y, w * 0.88, lampH);
  ctx.fillStyle = 'rgba(30,37,44,0.95)';
  ctx.fill();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 两支紫外灯管
  if (o.on !== false) {
    for (let k = 0; k < 2; k++) {
      const ty = y + lampH * (0.34 + 0.34 * k);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x + w * 0.12, ty, w * 0.52, Math.max(2.4, lampH * 0.12), 1.5)
        : ctx.rect(x + w * 0.12, ty, w * 0.52, Math.max(2.4, lampH * 0.12));
      ctx.fillStyle = 'rgba(168,128,255,0.95)';
      ctx.fill();
    }
  }
  // 计时小屏
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + w * 0.70, y + lampH * 0.22, w * 0.22, lampH * 0.56, 2)
    : ctx.rect(x + w * 0.70, y + lampH * 0.22, w * 0.22, lampH * 0.56);
  ctx.fillStyle = 'rgba(12,17,22,0.95)';
  ctx.fill();
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(168,128,255,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(o.seconds ?? 40)} s`, x + w * 0.81, y + lampH * 0.50);
  // 光锥
  if (o.on !== false) {
    const cone = ctx.createLinearGradient(0, y + lampH, 0, trayY);
    cone.addColorStop(0, 'rgba(168,128,255,0.20)');
    cone.addColorStop(1, 'rgba(168,128,255,0.04)');
    ctx.beginPath();
    ctx.moveTo(x + w * 0.16, y + lampH);
    ctx.lineTo(x + w * 0.84, y + lampH);
    ctx.lineTo(x + w * 0.94, trayY);
    ctx.lineTo(x + w * 0.06, trayY);
    ctx.closePath();
    ctx.fillStyle = cone;
    ctx.fill();
  }
  // 夹好的三明治
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + w * 0.06, trayY, w * 0.88, trayH, 3) : ctx.rect(x + w * 0.06, trayY, w * 0.88, trayH);
  ctx.fillStyle = 'rgba(40,48,56,0.85)';
  ctx.fill();
  ctx.strokeStyle = GLASS.soft;
  ctx.stroke();
  // 印相卡（曝光态：黄绿底 + 普鲁士白花纹）
  cyanotypePrint(ctx,
    { x: x + w * 0.13, y: trayY + trayH * 0.14, w: w * 0.74, h: trayH * 0.64 },
    { state: 'exposed', density: o.density ?? 0.96, ...(o.print || {}) });
  // 上板（半透明亚克力）
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + w * 0.10, trayY + trayH * 0.08, w * 0.80, trayH * 0.76, 2)
    : ctx.rect(x + w * 0.10, trayY + trayH * 0.08, w * 0.80, trayH * 0.76);
  ctx.fillStyle = 'rgba(200,220,235,0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,200,215,0.45)';
  ctx.stroke();
  // 四角夹子
  ctx.fillStyle = 'rgba(60,68,76,0.95)';
  for (const [cx0, cy0] of [[0.08, 0.06], [0.90, 0.06], [0.08, 0.90], [0.90, 0.90]]) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + w * cx0, trayY + trayH * cy0, w * 0.05, trayH * 0.10, 2)
      : ctx.rect(x + w * cx0, trayY + trayH * cy0, w * 0.05, trayH * 0.10);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 显影盘：长方形相片盘 + 水 + 正在显影的印相卡。
 * o = { density, oxidized, mottle, t, sheen }
 */
export function developTray(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const r = Math.min(6, w * 0.06);
  ctx.save();
  // 盘体（外沿 + 内底）
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y + h * 0.16, w, h * 0.80, r) : ctx.rect(x, y + h * 0.16, w, h * 0.80);
  ctx.fillStyle = 'rgba(48,56,64,0.92)';
  ctx.fill();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x + w * 0.05, y + h * 0.24, w * 0.90, h * 0.64, r * 0.6)
    : ctx.rect(x + w * 0.05, y + h * 0.24, w * 0.90, h * 0.64);
  ctx.fillStyle = 'rgba(28,36,44,0.95)';
  ctx.fill();
  // 水
  ctx.fillStyle = 'rgba(180,210,228,0.30)';
  ctx.fill();
  // 水面微光（随时间轻微起伏）
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  const t = o.t || 0;
  for (let k = 0; k < 3; k++) {
    const yy = y + h * (0.36 + 0.16 * k) + Math.sin(t * 0.8 + k) * 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.10, yy);
    ctx.lineTo(x + w * 0.90, yy);
    ctx.stroke();
  }
  // 盘中正在显影的印相卡
  cyanotypePrint(ctx,
    { x: x + w * 0.20, y: y + h * 0.30, w: w * 0.60, h: h * 0.50 },
    { state: 'washed', oxidized: o.oxidized ?? 0.35, density: o.density ?? 0.96, mottle: o.mottle || 0, sheen: true });
  ctx.restore();
}

/* ============================================================
 * 现象：气泡、晶体、热气
 * ============================================================ */

/** 从液面下往上冒的气泡；rate 为 0 时不画 */
export function bubbles(ctx, box, t, rate = 0.5, o = {}) {
  if (rate <= 0.01) return;
  const n = Math.round(4 + 14 * Math.min(1, rate));
  ctx.save();
  ctx.fillStyle = o.color || 'rgba(235,245,250,0.62)';
  for (let i = 0; i < n; i++) {
    // 用下标错开相位，不依赖随机数——同一 t 每次画出来是同一帧
    const ph = ((t * (0.35 + 0.06 * (i % 5)) + i * 0.137) % 1);
    const bx = box.x + box.w * (0.14 + 0.72 * ((i * 0.618) % 1));
    const by = box.y + box.h * (1 - ph);
    const r = (1.4 + 1.9 * ((i * 0.377) % 1)) * (0.55 + 0.45 * ph);
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 晶体：amount ∈ [0,1] 控制长出的数量与大小 */
export function crystals(ctx, box, t, amount = 0, o = {}) {
  if (amount <= 0.005) return;
  const col = o.color || [150, 212, 202, 0.9];
  const n = Math.round(3 + 16 * Math.min(1, amount));
  const grow = Math.min(1, 0.25 + 0.75 * amount);
  ctx.save();
  for (let i = 0; i < n; i++) {
    // 二维低差异序列（R2）：两个乘数必须**互不成简单线性关系**。
    // 之前用 0.618 与 0.382，而 0.382 = 1 − 0.618，
    // 于是两点必然满足 v = 1 − u —— 所有晶体排成一条斜线。
    const u = (i * 0.7548776662466927) % 1;
    const v = (i * 0.5698402909980532) % 1;
    const ux = 0.06 + 0.88 * u;
    const cx = box.x + box.w * ux;
    /*
     * 弧底容器（表面皿、蒸发皿）里，靠边的位置皿底很浅。
     * depthFn(ux) 给出该横向位置上「可用深度」占框高的比例，
     * 不约束的话靠边的晶体会掉到皿外面去。
     */
    const dmax = o.depthFn ? Math.max(0.14, o.depthFn(ux)) : 1;
    const cy = box.y + box.h * (0.18 + 0.8 * v * dmax);
    const s = (2.6 + 6.4 * v) * grow;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * 1.7) % (Math.PI * 2) + t * 0.06 * (o.spin === false ? 0 : 1));
    ctx.beginPath();
    // 单斜晶的简化轮廓：四边形 + 一个切角
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.82, -s * 0.18);
    ctx.lineTo(s * 0.5, s);
    ctx.lineTo(-s * 0.66, s * 0.62);
    ctx.lineTo(-s * 0.8, -s * 0.36);
    ctx.closePath();
    ctx.fillStyle = rgba(col);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * 器皿底部的固体粉末/颗粒（铁粉、草酸亚铁、AgCl 沉淀……）。
 *
 * 本质就是 `crystals()` 的小尺寸静态版本，但语义另起一名——
 * 下游看到「powderPile」不会以为这里在画晶体。传死 t=0 且 spin:false，
 * 所以它**永远静止**（粉末不该自己旋转）。
 *
 * @param box 只给器皿底部那一小条就对了：函数会把颗粒铺满给定框，
 *            所以要自己把框收到底部（见 mohr-salt 第 2 步的用法）
 */
export function powderPile(ctx, box, amount = 0.5, o = {}) {
  const col = o.color || IRON_POWDER_COLOR;
  const n = Math.round(7 + 24 * Math.min(1, amount));
  const rMax = Math.max(1.6, box.h * 0.16);
  ctx.save();
  ctx.fillStyle = rgba(col);
  for (let i = 0; i < n; i++) {
    // 与 crystals 同一套 R2 低差异序列（两个乘数互不成简单线性关系）
    const u = (i * 0.7548776662466927) % 1;
    const v = (i * 0.5698402909980532) % 1;
    const px = box.x + box.w * (0.05 + 0.9 * u);
    // 堆成小丘：中间高、两侧落到框底
    const mound = Math.max(0.18, 1 - Math.abs(u - 0.5) * 1.7);
    const py = box.y + box.h * (1 - mound * (0.25 + 0.75 * v));
    ctx.beginPath();
    ctx.arc(px, py, rMax * (0.45 + 0.75 * v), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 热气 / 蒸汽 */
export function steam(ctx, box, t, intensity = 1) {
  const n = Math.round(3 + 7 * Math.min(1, intensity));
  ctx.save();
  for (let i = 0; i < n; i++) {
    const ph = ((t * 0.22 + i * 0.19) % 1);
    const sx = box.x + box.w * (0.28 + 0.44 * ((i * 0.618) % 1));
    const sy = box.y + box.h * (1 - ph);
    const a = 0.22 * (1 - ph) * Math.min(1, intensity);
    ctx.beginPath();
    ctx.fillStyle = `rgba(210,225,235,${a})`;
    ctx.ellipse(sx + Math.sin(ph * 6 + i) * 5, sy, 5 + 9 * ph, 3 + 5 * ph, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 絮状沉淀（Mg(OH)₂、CaCO₃ 等）——为什么不复用 crystals：
 *   · 形状是柔软的絮团（圆弧团块交叠），不是单斜晶多边形与硬边高光
 *   · 运动是缓慢下沉、各自停在不同的高度（浑浊感）；不旋转
 *   · 半透明白色
 * 落点用 R2 低差异序列；⚠️ 两个乘数不能成简单线性关系（crystals 的教训）。
 * amount ∈ [0,1]；o = { color, settle: true 时直接落在最终位置（跳过下沉动画） }
 */
export function precipitateFlocs(ctx, box, t, amount = 0, o = {}) {
  if (amount <= 0.005) return;
  const a = Math.min(1, amount);
  const col = o.color || [226, 236, 244, 0.32 * a];
  const n = Math.round(4 + 16 * a);
  ctx.save();
  ctx.fillStyle = rgba(col);
  for (let i = 0; i < n; i++) {
    const u = (i * 0.7548776662466927) % 1;
    const v = (i * 0.5698402909980532) % 1;
    const cx0 = box.x + box.w * (0.08 + 0.84 * u);
    const restY = box.y + box.h * (0.42 + 0.52 * v);        // 各自停在不同的高度 → 浑浊感
    const p = o.settle ? 1 : Math.min(1, t * 0.09 + i * 0.021);
    const cy = box.y + box.h * 0.06 + (restY - (box.y + box.h * 0.06)) * p;
    const cx = cx0 + Math.sin(t * 0.5 + i * 1.3) * 2.0;     // 轻微横漂
    const s = 2.0 + 3.0 * v;
    ctx.beginPath();
    ctx.arc(cx, cy, s, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.75, cy - s * 0.35, s * 0.62, 0, Math.PI * 2);
    ctx.arc(cx - s * 0.62, cy + s * 0.42, s * 0.58, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ============================================================
 * 溶液的宏观颜色
 * ============================================================ */

/** FeSO₄ 溶液：蓝绿色，随 Fe³⁺ 增多转黄褐 */
export function ferrousSolutionColor(mgFe3PerG = 0) {
  const k = Math.min(1, Math.max(0, mgFe3PerG) / 0.30);
  return [
    Math.round(96 + 132 * k),
    Math.round(196 - 32 * k),
    Math.round(188 - 102 * k),
    0.5 + 0.26 * k,
  ];
}

/** 摩尔盐晶体：浅蓝绿 */
export const MOHR_CRYSTAL_COLOR = [150, 214, 204, 0.88];

/** 铁粉 */
export const IRON_POWDER_COLOR = [104, 110, 118, 0.92];

/** 无色溶液（酸、水、乙醇） */
export const CLEAR_COLOR = [222, 232, 240, 0.20];

/* ============================================================
 * 场景台面
 * ============================================================ */

/**
 * 台面线在画布高度里的比例。
 *
 * 「器皿坐在台面上」是场景层的事，不该塞进 vessel()——那里只拿到一个矩形框，
 * 分不清锥形瓶和夹在铁架台上的滴定管（详见 vessel() 里的说明）。
 * 5 个过程型模拟器原先各写各的 `H * 0.88`，数值虽然一样，但改一处就会漂，
 * 所以统一到这里。
 */
export const BENCH_Y = 0.88;

/**
 * 画台面线。所有「放在台面上」的器皿都应让它底边落在 H * BENCH_Y 上。
 * 本文件不再提供「反推顶边 y」的辅助函数——器皿各自按 h 算自己的位置即可。
 */
export function drawBench(ctx, W, H) {
  const y = H * BENCH_Y;
  ctx.save();
  ctx.strokeStyle = 'rgba(160,180,196,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.06, y);
  ctx.lineTo(W * 0.94, y);
  ctx.stroke();
  ctx.restore();
  return y;
}

/* ============================================================
 * 场景画布
 * ============================================================ */

/**
 * 一块可以播放动画的画布。
 * 装置绘制函数是纯的，动画由这里统一驱动——
 * 这样「哪一步在冒泡、哪一步在长晶体」只由绘制回调里的参数决定。
 *
 * 绘制回调签名：`(ctx, w, h, t, ts)`
 *   t  —— 自 `start()` 起的总秒数。**循环动画**（气泡、热气、液流）用它。
 *   ts —— **本步已进行的秒数**，由 `set(fn, { resetClock: true })` 归零。
 *         只给「入场/一次性」动画用（沉淀下沉、晶体析出、液面到位）。
 *
 * ⚠️ 两者搞反的症状很好认：
 *   循环动画用 ts → 每次切步，气泡/热汽会瞬移回起点；
 *   一次性动画用 t  → 学生在第 3 步停留 60 秒再跳到「生成沉淀」那一步，
 *                     絮团早就沉完了，什么也看不到（这就是 ts 要解决的问题）。
 */
export class Scene {
  constructor(canvas) {
    this.cv = canvas;
    this._raf = null;
    this._t0 = 0;
    this._t = 0;
    this._ts0 = 0;         // 本步时间轴的零点（以 _t 为基准）
    this._draw = null;
    this._snap = null;     // 切步过渡用的上一帧快照
    this._snapAt = 0;
    // 只在构造时判一次，别每帧判
    this._reduceMotion = typeof matchMedia === 'function'
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._loop = this._loop.bind(this);
    this._onResize = () => this.render();
    window.addEventListener('resize', this._onResize);
  }

  /**
   * 设定绘制回调。
   * @param opts.resetClock  把「本步已进行秒数」ts 归零
   * @param opts.transition  与上一帧做 ~250ms 交叉淡入（切步用；**拖滑块不要传**，会频闪）
   */
  set(fn, opts = {}) {
    if (opts.transition && this._draw && !this._reduceMotion && this.cv.width) {
      const s = this._snap || (this._snap = document.createElement('canvas'));
      s.width = this.cv.width;
      s.height = this.cv.height;
      s.getContext('2d').drawImage(this.cv, 0, 0);
      this._snapAt = this._t;
    } else if (opts.transition === false) {
      this._snap = null;
    }
    this._draw = fn;
    if (opts.resetClock) this._ts0 = this._t;   // 切步时通常两者同时要，所以不清快照
    this.render();
  }

  render() { if (this._draw) this._paint(); }

  _paint() {
    const c = fit(this.cv);
    if (!c || !this._draw) return null;
    const t = this._t || 0;
    // set() 可能在下一帧之前被调用（拖滑块每帧都调），所以 _t 可能还停在上一帧，
    // 用 max(0,…) 兜住，否则 ts 会出现负值
    const ts = Math.max(0, t - (this._ts0 || 0));
    this._draw(c.ctx, c.w, c.h, t, ts);

    // 切步交叉淡入：新场景已经画好，把上一帧快照按 1→0 叠上去
    if (this._snap) {
      const a = 1 - Math.min(1, (t - this._snapAt) / 0.25);
      if (a <= 0) {
        this._snap = null;
      } else {
        c.ctx.save();
        c.ctx.globalAlpha = a;
        c.ctx.drawImage(this._snap, 0, 0, c.w, c.h);
        c.ctx.restore();
      }
    }
    return c;
  }

  start() {
    if (this._raf) return;
    this._t0 = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._snap = null;    // 停下来的话快照就没意义了，别在恢复时闪回旧画面
  }

  _loop(now) {
    this._t = (now - this._t0) / 1000;
    this._paint();
    this._raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
  }
}
