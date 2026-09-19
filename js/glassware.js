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

/* ============================================================
 * 基础
 * ============================================================ */

export const GLASS = {
  stroke: 'rgba(160,180,196,0.55)',
  soft: 'rgba(160,180,196,0.26)',
  lw: 1.6,
};

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
    ctx.save();
    ctx.beginPath();
    pathFn(ctx);
    ctx.clip();
    const yTop = box.y + box.h * (1 - Math.min(1, level));
    ctx.fillStyle = rgba(liquid);

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
      ctx.fillRect(-span, 0, span * 2, span);
    } else {
      ctx.fillRect(box.x - 2, yTop, box.w + 4, box.h - (yTop - box.y) + 4);
    }

    // 液面高光
    if (highlight) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      if (Math.abs(tilt) > 1e-4) {
        const span = (box.w + box.h);
        ctx.moveTo(-span, 0);
        ctx.lineTo(span, 0);
      } else {
        ctx.moveTo(box.x - 2, yTop);
        ctx.lineTo(box.x + box.w + 2, yTop);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  pathFn(ctx);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
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
}

/**
 * 量筒
 *
 * 两个曾经的错处：管口做成左右对称的 V 形缺口（那是漏斗不是量筒，
 * 量筒只有**单侧**壶嘴），底座画成比管身还宽的椭圆，看着像脱离的圆盘。
 */
export function cylinder(ctx, box, o = {}) {
  const tilt = o.tilt || 0;
  if (!tilt) return cylinderBody(ctx, box, o);
  // 绕**几何中心**旋转。液面仍按世界水平填充，见 vessel 的 tilt 说明。
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate(tilt);
  cylinderBody(ctx, { x: -box.w / 2, y: -box.h / 2, w: box.w, h: box.h }, o);
  ctx.restore();
}

function cylinderBody(ctx, box, o = {}) {
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
  vessel(ctx, path, { ...box, h: h - footH }, { ...o, tilt: o.tilt || 0 });

  graduations(ctx, { x, y: rimY + 10, w, h: tubeBottom - rimY - 16 }, 6,
    { side: 'left', len: Math.min(13, w * 0.45) });

  // 六角底座：比管身宽，但做成有厚度的脚，不是一片碟。
  // 倾斜（倒液）时不画——底座会翘到上面，看着像第二个瓶口。
  if (!o.tilt) {
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
export function buchner(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  const cylH = h * 0.40;                 // 直筒段
  const taperH = h * 0.34;               // 收口段
  const plateY = y + cylH;
  const stemW = Math.max(6, w * 0.16);
  const cx = x + w / 2;
  const sx = cx - stemW / 2;

  const outline = c => {
    c.moveTo(x, y);
    c.lineTo(x, plateY);
    c.lineTo(sx, plateY + taperH);
    c.lineTo(sx, y + h);
    c.lineTo(sx + stemW, y + h);
    c.lineTo(sx + stemW, plateY + taperH);
    c.lineTo(x + w, plateY);
    c.lineTo(x + w, y);
  };

  // 液体只可能在上面的直筒里
  vessel(ctx, c => {
    c.moveTo(x, y);
    c.lineTo(x, plateY);
    c.lineTo(x + w, plateY);
    c.lineTo(x + w, y);
    c.closePath();
  }, { x, y, w, h: cylH }, { liquid: o.liquid, level: o.level });

  // 收口段与细管
  vessel(ctx, outline, box, { liquid: o.dropColor, level: o.dripping ? 0.35 : 0 });

  // 多孔瓷板
  ctx.save();
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 1, plateY);
  ctx.lineTo(x + w - 1, plateY);
  ctx.stroke();
  ctx.fillStyle = GLASS.soft;
  for (let i = 0; i < 8; i++) {
    const px = x + 7 + (w - 14) * (i / 7);
    ctx.beginPath();
    ctx.arc(px, plateY - 3.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 滤饼堆在瓷板上
  if (o.cake > 0.01) {
    const ch = (cylH * 0.55) * Math.min(1, o.cake);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, plateY - 8 - ch, w - 4, ch + 6);
    ctx.fillStyle = rgba(o.cakeColor || [150, 212, 202, 0.85]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
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
  const b = fitAspect(box, 0.26, 'bottom');
  const { x, y, w, h } = b;

  // 皿底最深处为 h（二次曲线控制点取 1.85h 时，最低点在 0.925h）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + w / 2, y + h * 1.85, x + w, y);
  ctx.strokeStyle = GLASS.stroke;
  ctx.lineWidth = GLASS.lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // 皿内可用的深度：二次曲线在横向位置 u 处为 4u(1−u)·0.925h
  const depthFn = u => 3.7 * u * (1 - u);

  if (o.crystal > 0.01) {
    crystals(ctx, {
      x: x + w * 0.12, y: y + h * 0.30,
      w: w * 0.76, h: h * 0.72,
    }, o.t || 0, o.crystal, { color: o.crystalColor, spin: false, depthFn });
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
 * 场景画布
 * ============================================================ */

/**
 * 一块可以播放动画的画布。
 * 装置绘制函数是纯的，动画由这里统一驱动——
 * 这样「哪一步在冒泡、哪一步在长晶体」只由绘制回调里的参数决定。
 */
export class Scene {
  constructor(canvas) {
    this.cv = canvas;
    this._raf = null;
    this._t0 = 0;
    this._draw = null;
    this._loop = this._loop.bind(this);
    this._onResize = () => this.render();
    window.addEventListener('resize', this._onResize);
  }

  /** 设定绘制回调；回调签名为 (ctx, w, h, t秒) */
  set(fn) { this._draw = fn; this.render(); }

  render() { if (this._draw) this._paint(); }

  _paint() {
    const c = fit(this.cv);
    if (!c || !this._draw) return null;
    this._draw(c.ctx, c.w, c.h, this._t || 0);
    return c;
  }

  start() {
    if (this._raf) return;
    this._t0 = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
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
