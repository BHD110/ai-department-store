import { t } from '../i18n';
import type { Stage } from '../game/director';
import type { Store } from '../game/state';
import type { CustomerProfile, Mood, Speaker } from '../types';
import { drawCounter, drawDoor, drawNightOverlay, drawRoom, drawShelves, H, nightness, shelfSlots, W } from './decor';
import { drawCat, drawDots, drawEmote, drawPerson, type Look } from './sprites';

const KEEPER: Look = { skin: '#f0c8a0', hair: '#4a2a18', shirt: '#f4efe4', pants: '#3a3a4a', apron: '#3f8f5f' };
const KEEPER_POS = { x: 92, y: 134 };
const S = 2; // 人物放大倍数
const DOOR_POS = { x: 302, y: 118 };
const COUNTER_POS = { x: 186, y: 168 };

interface Actor { profile: CustomerProfile; x: number; y: number; tx: number; ty: number; mood: Mood; emote: Mood | null; step: number }

export class Scene implements Stage {
  private c: CanvasRenderingContext2D;
  private actor: Actor | null = null;
  private door = 0;
  private doorTarget = 0;
  private thinking: Speaker | null = null;
  private hover: string | null = null;
  private dust = Array.from({ length: 14 }, (_, i) => ({ x: 110 + (i * 17) % 60, y: 40 + (i * 29) % 80, s: 0.2 + (i % 5) * 0.08 }));
  private bubbles: Partial<Record<Speaker, HTMLDivElement>> = {};
  private last = performance.now();

  constructor(
    private canvas: HTMLCanvasElement,
    private layer: HTMLElement,
    private store: Store,
    private speed: () => number,
    private paused: () => boolean,
    private shopName = t('app.brandFallback'),
  ) {
    canvas.width = W;
    canvas.height = H;
    this.c = canvas.getContext('2d')!;
    this.c.imageSmoothingEnabled = false;
    canvas.addEventListener('mousemove', (e) => this.onHover(e));
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.tip.hidden = true; });
    requestAnimationFrame((t) => this.loop(t));
  }

  private tip = Object.assign(document.createElement('div'), { className: 'shelf-tip', hidden: true });

  private toLocal(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  private onHover(e: MouseEvent) {
    if (!this.tip.parentElement) this.layer.appendChild(this.tip);
    const { x, y } = this.toLocal(e);
    const slot = shelfSlots(this.store.inventory).find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    this.hover = slot?.sku ?? null;
    if (!slot) { this.tip.hidden = true; return; }
    const p = this.store.product(slot.sku)!;
    this.tip.innerHTML = `<b>${p.emoji} ${p.name}</b><span>${t('scene.tooltipStock', { price: p.price, n: p.stock })}</span><em>${p.tags.join(' · ')}</em>`;
    this.tip.style.left = `${(slot.x / W) * 100}%`;
    this.tip.style.top = `${((slot.y + slot.h + 4) / H) * 100}%`;
    this.tip.hidden = false;
  }

  private loop(t: number) {
    const dt = Math.min(50, t - this.last);
    this.last = t;
    if (!this.paused()) this.update(dt * this.speed());
    this.draw(t);
    requestAnimationFrame((n) => this.loop(n));
  }

  private update(dt: number) {
    this.door += (this.doorTarget - this.door) * Math.min(1, dt / 120);
    const a = this.actor;
    if (a) {
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const v = 0.055 * dt;
      if (d > v) { a.x += (dx / d) * v; a.y += (dy / d) * v; a.step += dt; }
      else { a.x = a.tx; a.y = a.ty; a.step = 0; }
    }
    for (const p of this.dust) { p.y -= p.s * dt * 0.02; p.x += Math.sin(p.y / 9) * 0.05; if (p.y < 28) p.y = 112; }
  }

  private draw(t: number) {
    const c = this.c;
    const clock = this.store.clock;
    drawRoom(c, clock, t, this.shopName);
    drawShelves(c, this.store.inventory, this.hover);
    drawDoor(c, this.door, t);
    if (nightness(clock) < 0.6) {
      c.fillStyle = 'rgba(255,248,220,0.10)';
      c.beginPath(); c.moveTo(108, 72); c.lineTo(168, 72); c.lineTo(200, 175); c.lineTo(100, 175); c.fill();
      for (const p of this.dust) { c.fillStyle = 'rgba(255,255,240,0.55)'; c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    }
    const blink = t % 2800 < 140;
    const kMood: Mood = this.actor?.mood === 'happy' ? 'happy' : 'neutral';
    this.big(KEEPER_POS.x, KEEPER_POS.y, () => drawPerson(c, 0, 0, KEEPER, kMood, 0, Math.sin(t / 600), blink));
    drawCounter(c, this.store.cash);
    drawCat(c, 42, 116, t, !!this.actor && this.actor.x < 220);
    const a = this.actor;
    if (a) {
      const frame = a.step > 0 ? Math.floor(a.step / 140) % 2 : 0;
      const bob = a.step > 0 ? 0 : Math.sin(t / 500) * 0.6;
      this.big(a.x, a.y, () => drawPerson(c, 0, 0, a.profile.look, a.mood, frame, bob, t % 3300 < 130));
      if (a.emote) this.big(a.x, a.y - 70, () => drawEmote(c, 0, 0, a.emote!, t));
      if (this.thinking === 'customer') this.big(a.x, a.y - 74, () => drawDots(c, 0, 0, t));
    }
    if (this.thinking === 'shopkeeper') this.big(KEEPER_POS.x, KEEPER_POS.y - 76, () => drawDots(c, 0, 0, t));
    drawNightOverlay(c, clock);
  }

  /** 以 (x, y) 为原点放大 S 倍绘制，保持像素对齐 */
  private big(x: number, y: number, fn: () => void) {
    const c = this.c;
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(S, S);
    fn();
    c.restore();
  }

  private until(cond: () => boolean) {
    return new Promise<void>((res) => { const tick = () => (cond() ? res() : requestAnimationFrame(tick)); tick(); });
  }

  private sleep(ms: number) {
    return new Promise<void>((res) => {
      let left = ms;
      const id = setInterval(() => { if (!this.paused()) left -= 50 * this.speed(); if (left <= 0) { clearInterval(id); res(); } }, 50);
    });
  }

  async customerEnter(p: CustomerProfile) {
    this.clearBubbles();
    this.doorTarget = 1;
    await this.sleep(250);
    this.actor = { profile: p, x: DOOR_POS.x, y: DOOR_POS.y, tx: COUNTER_POS.x, ty: COUNTER_POS.y, mood: 'neutral', emote: null, step: 0 };
    await this.sleep(300);
    this.doorTarget = 0;
    await this.until(() => !this.actor || (this.actor.x === this.actor.tx && this.actor.y === this.actor.ty));
  }

  async customerLeave(mood: Mood) {
    const a = this.actor;
    if (!a) return;
    a.mood = mood; a.emote = mood;
    await this.sleep(900);
    this.clearBubbles();
    a.emote = null; a.tx = DOOR_POS.x; a.ty = DOOR_POS.y;
    await this.until(() => a.x > DOOR_POS.x - 30);
    this.doorTarget = 1;
    await this.until(() => a.x === a.tx);
    this.actor = null;
    await this.sleep(250);
    this.doorTarget = 0;
  }

  setThinking(who: Speaker | null) { this.thinking = who; }

  async bubble(speaker: Speaker, text: string, mood?: Mood) {
    if (speaker === 'system') return;
    if (speaker === 'customer' && this.actor && mood) { this.actor.mood = mood; this.actor.emote = mood === 'neutral' ? null : mood; }
    for (const b of Object.values(this.bubbles)) b?.classList.add('old');
    this.bubbles[speaker]?.remove();
    const el = document.createElement('div');
    el.className = `bubble ${speaker}`;
    const pos = speaker === 'customer' && this.actor ? { x: this.actor.x, y: this.actor.y - 64 } : { x: KEEPER_POS.x, y: KEEPER_POS.y - 62 };
    el.style.left = `${(pos.x / W) * 100}%`;
    el.style.bottom = `${((H - pos.y) / H) * 100}%`;
    this.layer.appendChild(el);
    this.bubbles[speaker] = el;
    const chars = [...text];
    for (let i = 1; i <= chars.length; i++) {
      el.textContent = chars.slice(0, i).join('');
      await this.sleep(28);
    }
    await this.sleep(700 + chars.length * 35);
  }

  private clearBubbles() {
    for (const b of Object.values(this.bubbles)) b?.remove();
    this.bubbles = {};
  }

  floatText(text: string, color: string) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(COUNTER_POS.x / W) * 100 + (Math.random() - 0.5) * 8}%`;
    el.style.top = `${(96 / H) * 100 + Math.random() * 6}%`;
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
}
