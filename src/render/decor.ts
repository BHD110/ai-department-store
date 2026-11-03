import { isEn } from '../i18n';
import type { Product } from '../types';
import { px, shade, type Ctx } from './sprites';

export const W = 320;
export const H = 180;
export const FLOOR_Y = 118;

// 品类一律用 id（mock 目录与服务端目录同一套 id）；服务端会把自己的颜色写进来
export const CAT_COLOR: Record<string, string> = {
  clean: '#4fb3d9', kitchen: '#d9534f', bath: '#e78fb3', stationery: '#f0c419',
  snack: '#f39c3c', hardware: '#8a9aa8', family: '#9ad17a', home: '#a17bd1',
  appliance: '#a68bb5', textile: '#cf7f6b', storage: '#9fb0b8',
};

type Stop = [number, string, string];
const SKY: Stop[] = [
  [480, '#8fd0ff', '#e4f5ff'], [840, '#6cbcff', '#c9ecff'], [1020, '#f7a46b', '#ffe0a8'],
  [1140, '#5b4a8f', '#e3866d'], [1200, '#1b2150', '#3b3a78'],
];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mix(a: string, b: string, k: number) {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}
export function skyAt(clock: number): [string, string] {
  if (clock <= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
  for (let i = 1; i < SKY.length; i++) {
    if (clock <= SKY[i][0]) {
      const [t0, a0, b0] = SKY[i - 1], [t1, a1, b1] = SKY[i];
      const k = (clock - t0) / (t1 - t0);
      return [mix(a0, a1, k), mix(b0, b1, k)];
    }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}
/** 0 = 白天，1 = 夜里 */
export const nightness = (clock: number) => Math.max(0, Math.min(1, (clock - 1050) / 150));

export function drawRoom(c: Ctx, clock: number, t: number, shopName = '槐树街百货') {
  // 墙纸
  px(c, 0, 0, W, FLOOR_Y, '#f1dcb8');
  for (let x = 0; x < W; x += 12) px(c, x, 0, 6, FLOOR_Y, '#ebd2a8');
  px(c, 0, FLOOR_Y - 10, W, 10, '#b98a5a');
  px(c, 0, FLOOR_Y - 11, W, 1, '#8b5e3c');
  // 地板
  px(c, 0, FLOOR_Y, W, H - FLOOR_Y, '#c58d58');
  for (let y = FLOOR_Y; y < H; y += 8) {
    px(c, 0, y, W, 1, '#a8723f');
    const off = ((y / 8) % 2) * 20;
    for (let x = off; x < W; x += 40) px(c, x, y, 1, 8, '#a8723f');
  }
  // 窗
  const [top, bot] = skyAt(clock);
  const wx = 108, wy = 26, ww = 60, wh = 46;
  const g = c.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
  const n = nightness(clock);
  if (n > 0.5) for (let i = 0; i < 9; i++) px(c, wx + ((i * 23) % ww), wy + ((i * 13) % 26), 1, 1, `rgba(255,255,220,${(n - 0.5) * 2 * (0.5 + 0.5 * Math.sin(t / 300 + i))})`);
  const sunK = (clock - 480) / 720;
  const sx = wx + 8 + sunK * (ww - 16), sy = wy + 30 - Math.sin(sunK * Math.PI) * 24;
  px(c, sx - 3, sy - 3, 6, 6, n > 0.6 ? '#f4f1d0' : '#fff2a8');
  const cx = wx + ((t / 120) % (ww + 30)) - 20;
  c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
  px(c, cx, wy + 8, 14, 3, 'rgba(255,255,255,0.75)'); px(c, cx + 3, wy + 6, 7, 2, 'rgba(255,255,255,0.75)');
  // 远处小镇剪影
  const town = n > 0.5 ? '#2a2c4a' : '#7d9a7a';
  for (let i = 0; i < 6; i++) { const hx = wx + i * 11 - 2, hh = 8 + ((i * 7) % 9); px(c, hx, wy + wh - hh, 9, hh, town); px(c, hx + 1, wy + wh - hh - 3, 7, 3, town); }
  if (n > 0.3) for (let i = 0; i < 6; i++) px(c, wx + i * 11 + 2, wy + wh - 5, 2, 2, `rgba(255,210,120,${n})`);
  c.restore();
  px(c, wx - 3, wy - 3, ww + 6, 3, '#7a4f2e'); px(c, wx - 3, wy + wh, ww + 6, 4, '#7a4f2e');
  px(c, wx - 3, wy, 3, wh, '#7a4f2e'); px(c, wx + ww, wy, 3, wh, '#7a4f2e');
  px(c, wx + ww / 2 - 1, wy, 2, wh, '#7a4f2e'); px(c, wx, wy + wh / 2 - 1, ww, 2, '#7a4f2e');
  // 招牌：中文取首尾拼短名，英文直接截断
  px(c, 104, 4, 68, 15, '#6b4226'); px(c, 105, 5, 66, 13, '#8b5a33');
  const sign = isEn()
    ? (shopName.length > 13 ? shopName.slice(0, 13) : shopName)
    : (shopName.length > 5 ? shopName.slice(0, 3) + shopName.slice(-2) : shopName);
  c.fillStyle = '#ffe9b0'; c.font = '10px "ZCOOL QingKe HuangYou", sans-serif'; c.textAlign = 'center';
  c.fillText(sign, 138, 15); c.textAlign = 'left';
  // 吊灯
  for (const lx of [60, 232]) {
    px(c, lx, 0, 1, 10, '#4a3a2a'); px(c, lx - 5, 10, 11, 4, '#3d5a40'); px(c, lx - 2, 14, 5, 2, n > 0.2 ? '#ffe7a0' : '#d8d0b0');
  }
}

export interface Slot { x: number; y: number; w: number; h: number; sku: string }

export function shelfSlots(inv: Product[]): Slot[] {
  const slots: Slot[] = [];
  const shelves = [8, 186];
  const rows = [36, 62, 88];
  // 服务端有 52 个 SKU：两排货架 × 三格 × 九列，刚好 54 个位置。
  let i = 0;
  for (const sx of shelves) for (const ry of rows) for (let k = 0; k < 9 && i < inv.length; k++, i++) {
    slots.push({ x: sx + 3 + k * 10, y: ry, w: 9, h: 21, sku: inv[i].sku });
  }
  return slots;
}

export function drawShelves(c: Ctx, inv: Product[], hover: string | null) {
  for (const sx of [8, 186]) {
    px(c, sx - 2, 30, 98, 82, '#7a4f2e');
    px(c, sx, 32, 94, 78, '#5a3820');
    for (const ry of [57, 83, 109]) { px(c, sx - 2, ry, 98, 3, '#9a6a40'); px(c, sx - 2, ry + 3, 98, 1, '#4a2e18'); }
  }
  const map = new Map(inv.map((p) => [p.sku, p]));
  for (const s of shelfSlots(inv)) {
    const p = map.get(s.sku)!;
    const col = CAT_COLOR[p.category] ?? '#9aa8b0';
    const n = Math.min(3, p.stock);
    for (let j = 0; j < n; j++) {
      const bx = s.x + j * 3, bh = 9 + ((p.sku.charCodeAt(2) + j) % 3) * 2;
      px(c, bx, s.y + 21 - bh, 2, bh, col);
      px(c, bx, s.y + 21 - bh, 2, 2, shade(col, 1.3));
      px(c, bx + 1, s.y + 21 - bh + 2, 1, bh - 2, shade(col, 0.75));
    }
    if (p.stock === 0) { px(c, s.x + 1, s.y + 13, 7, 6, '#c0392b'); px(c, s.x + 2, s.y + 15, 5, 2, '#fff'); }
    else if (p.stock <= 2) px(c, s.x + 6, s.y + 17, 2, 2, '#ff6b4a');
    if (hover === s.sku) { c.strokeStyle = '#fff3a0'; c.lineWidth = 1; c.strokeRect(s.x - 0.5, s.y - 0.5, s.w, s.h + 1); }
  }
}

export function drawDoor(c: Ctx, open: number, t: number) {
  const dx = 290, dy = 56, dw = 26, dh = FLOOR_Y - 56;
  px(c, dx - 3, dy - 3, dw + 6, dh + 3, '#6b4226');
  px(c, dx, dy, dw, dh, '#fff3d6');
  const w = Math.round(dw * (1 - open * 0.75));
  px(c, dx, dy, w, dh, '#9a6236');
  px(c, dx + 3, dy + 4, w - 6 > 0 ? w - 6 : 0, 18, '#bfe4ff');
  if (w > 6) px(c, dx + w - 5, dy + 32, 2, 3, '#f0c419');
  const swing = open > 0 ? Math.sin(t / 60) * 2 * open : 0;
  px(c, dx + dw / 2 + swing, dy - 2, 1, 4, '#c9a227');
  px(c, dx + dw / 2 - 2 + swing, dy + 2, 5, 4, '#f0c419');
}

export function drawCounter(c: Ctx, cash: number) {
  const x = 36, y = 116, w = 108;
  px(c, x - 2, y, w + 4, 5, '#a5683a');
  px(c, x - 2, y + 5, w + 4, 1, '#6b4226');
  px(c, x, y + 6, w, 30, '#8b5a33');
  for (let i = 0; i < 4; i++) px(c, x + 6 + i * 26, y + 10, 20, 22, '#7a4c2a');
  // 收银机
  px(c, x + 76, y - 12, 22, 12, '#4a5a6a');
  px(c, x + 78, y - 10, 18, 5, cash >= 0 ? '#9ff0a0' : '#ff9a9a');
  px(c, x + 79, y - 4, 16, 3, '#2e3a46');
  px(c, x + 80, y - 18, 14, 6, '#5d6e80');
}

export function drawNightOverlay(c: Ctx, clock: number) {
  const n = nightness(clock);
  if (n <= 0) return;
  c.fillStyle = `rgba(20,18,60,${n * 0.38})`;
  c.fillRect(0, 0, W, H);
  for (const lx of [60, 232]) {
    const g = c.createRadialGradient(lx, 20, 2, lx, 40, 90);
    g.addColorStop(0, `rgba(255,214,140,${0.35 * n})`);
    g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}
