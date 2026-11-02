import type { CustomerProfile, Mood } from '../types';

export type Ctx = CanvasRenderingContext2D;

export function px(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export type Look = CustomerProfile['look'] & { apron?: string };

/**
 * 像素小人，(x, y) = 脚底中心。约 30px 高。
 * frame: 走路帧 0/1；bob: 呼吸起伏
 */
export function drawPerson(c: Ctx, x: number, y: number, look: Look, mood: Mood, frame: number, bob = 0, blink = false) {
  const b = Math.round(bob);
  // 影子
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(x, y, 8, 2, 0, 0, Math.PI * 2);
  c.fill();
  // 腿
  const l1 = frame === 1 ? -1 : 0;
  const l2 = frame === 1 ? 0 : -1;
  px(c, x - 4, y - 7 + l1, 3, 7 - 0, look.pants);
  px(c, x + 1, y - 7 + l2, 3, 7, look.pants);
  px(c, x - 5, y - 1 + l1, 4, 1, '#2a1d17');
  px(c, x + 1, y - 1 + l2, 4, 1, '#2a1d17');
  // 身体
  const by = y - 17 + b;
  px(c, x - 5, by, 10, 10, look.shirt);
  px(c, x - 5, by + 8, 10, 2, shade(look.shirt, 0.8));
  if (look.apron) {
    px(c, x - 4, by + 2, 8, 9, look.apron);
    px(c, x - 2, by + 5, 4, 2, shade(look.apron, 0.8));
  }
  // 手臂
  const sw = frame === 1 ? 1 : 0;
  px(c, x - 7, by + 1 + sw, 2, 6, look.shirt);
  px(c, x + 5, by + 1 - sw + 1, 2, 6, look.shirt);
  px(c, x - 7, by + 7 + sw, 2, 2, look.skin);
  px(c, x + 5, by + 8 - sw, 2, 2, look.skin);
  // 头
  const hy = by - 9;
  px(c, x - 4, hy, 8, 9, look.skin);
  px(c, x - 5, hy + 3, 1, 3, look.skin);
  px(c, x + 4, hy + 3, 1, 3, look.skin);
  // 头发
  px(c, x - 5, hy - 1, 10, 3, look.hair);
  px(c, x - 5, hy + 1, 1, 3, look.hair);
  px(c, x + 4, hy + 1, 1, 2, look.hair);
  if (look.hat) {
    px(c, x - 6, hy - 1, 12, 2, look.hat);
    px(c, x - 4, hy - 4, 8, 3, look.hat);
    px(c, x - 4, hy - 2, 8, 1, shade(look.hat, 0.75));
  }
  // 眼睛
  const ey = hy + 4;
  if (blink) {
    px(c, x - 3, ey + 1, 2, 1, '#2b2020');
    px(c, x + 1, ey + 1, 2, 1, '#2b2020');
  } else {
    px(c, x - 3, ey, 1, 2, '#2b2020');
    px(c, x + 2, ey, 1, 2, '#2b2020');
  }
  // 腮红 + 嘴
  px(c, x - 4, ey + 2, 1, 1, 'rgba(230,110,110,0.55)');
  px(c, x + 3, ey + 2, 1, 1, 'rgba(230,110,110,0.55)');
  const my = hy + 7;
  if (mood === 'happy') { px(c, x - 1, my, 2, 1, '#7a2c2c'); px(c, x - 2, my - 1, 1, 1, '#7a2c2c'); px(c, x + 1, my - 1, 1, 1, '#7a2c2c'); }
  else if (mood === 'angry' || mood === 'annoyed') {
    px(c, x - 1, my, 2, 1, '#7a2c2c');
    px(c, x - 3, ey - 1, 2, 1, '#2b2020');
    px(c, x + 1, ey - 1, 2, 1, '#2b2020');
  } else if (mood === 'confused') px(c, x, my, 1, 1, '#7a2c2c');
  else px(c, x - 1, my, 2, 1, '#9a4a4a');
}

/** 头顶情绪图标 */
export function drawEmote(c: Ctx, x: number, y: number, mood: Mood, t: number) {
  const fy = y + Math.sin(t / 200) * 1.5;
  if (mood === 'happy') {
    const k = '#ff5c7a';
    px(c, x - 3, fy, 2, 1, k); px(c, x + 1, fy, 2, 1, k);
    px(c, x - 4, fy + 1, 8, 2, k); px(c, x - 3, fy + 3, 6, 1, k); px(c, x - 2, fy + 4, 4, 1, k); px(c, x - 1, fy + 5, 2, 1, k);
  } else if (mood === 'angry' || mood === 'annoyed') {
    const k = mood === 'angry' ? '#ff3b3b' : '#ff8a3b';
    px(c, x - 3, fy, 2, 2, k); px(c, x + 1, fy, 2, 2, k); px(c, x - 3, fy + 3, 2, 2, k); px(c, x + 1, fy + 3, 2, 2, k);
    px(c, x - 1, fy + 2, 2, 1, k);
  } else if (mood === 'confused') {
    const k = '#5ab0ff';
    px(c, x - 2, fy, 4, 1, k); px(c, x + 2, fy + 1, 1, 2, k); px(c, x, fy + 3, 2, 1, k); px(c, x, fy + 4, 1, 1, k); px(c, x, fy + 6, 1, 1, k);
  }
}

/** 思考中的三个点 */
export function drawDots(c: Ctx, x: number, y: number, t: number) {
  px(c, x - 7, y - 1, 15, 7, '#fffaf0');
  px(c, x - 8, y, 1, 5, '#fffaf0');
  px(c, x + 8, y, 1, 5, '#fffaf0');
  for (let i = 0; i < 3; i++) {
    const on = Math.floor(t / 250) % 4 > i;
    px(c, x - 5 + i * 4, y + 2, 2, 2, on ? '#3a2c28' : '#cbbfae');
  }
}

/** 柜台上打盹的橘猫，尾巴会摇 */
export function drawCat(c: Ctx, x: number, y: number, t: number, awake: boolean) {
  const o = '#e8954a', d = '#c4733a';
  px(c, x, y - 5, 12, 5, o);
  px(c, x + 2, y - 4, 2, 3, d); px(c, x + 6, y - 4, 2, 3, d);
  px(c, x + 9, y - 8, 6, 6, o);
  px(c, x + 9, y - 10, 2, 2, o); px(c, x + 13, y - 10, 2, 2, o);
  if (awake) { px(c, x + 10, y - 6, 1, 1, '#2a2a2a'); px(c, x + 13, y - 6, 1, 1, '#2a2a2a'); }
  else { px(c, x + 10, y - 6, 2, 1, d); px(c, x + 13, y - 6, 1, 1, d); }
  const w = Math.round(Math.sin(t / 380) * 2);
  px(c, x - 3, y - 3 + w, 3, 2, o);
  px(c, x - 5, y - 5 + w * 1.5, 2, 3, o);
  if (!awake) {
    const z = (t / 900) % 1;
    c.globalAlpha = 1 - z;
    c.fillStyle = '#ffffff';
    c.font = '6px monospace';
    c.fillText('z', x + 16 + z * 4, y - 11 - z * 8);
    c.globalAlpha = 1;
  }
}
