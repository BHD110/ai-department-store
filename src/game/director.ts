import { PROFILES } from '../data/profiles';
import { KIND_WEIGHT, SCENARIO_MAP } from '../data/scenarios';
import type { ChatMessage, CustomerProfile, Mood, Session, ShopAction, SimBackend, Speaker, Verdict } from '../types';
import { CLOSE, Store, type Settlement } from './state';

/** 场景层需要实现的可等待动画 */
export interface Stage {
  customerEnter(p: CustomerProfile): Promise<void>;
  customerLeave(mood: Mood): Promise<void>;
  bubble(speaker: Speaker, text: string, mood?: Mood): Promise<void>;
  floatText(text: string, color: string): void;
  setThinking(who: Speaker | null): void;
}

export type GameEvent =
  | { t: 'session'; session: Session }
  | { t: 'message'; session: Session; msg: ChatMessage }
  | { t: 'actions'; session: Session; actions: ShopAction[] }
  | { t: 'settled'; session: Session; verdict: Verdict; result: Settlement }
  | { t: 'status'; note: string; busy: boolean; connected: boolean }
  | { t: 'system'; text: string }
  | { t: 'tick' }
  | { t: 'dayEnd' }
  | { t: 'error'; message: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class Director {
  speed = 1;
  paused = false;
  running = false;
  busy = false;
  note = '本地 mock';
  connected = true;
  readonly profileCount = PROFILES.length;
  readonly storeName = '小镇百货';
  sessions: Session[] = [];
  current: Session | null = null;
  private listeners: ((e: GameEvent) => void)[] = [];
  private lastCustomer = '';
  private dayResolve: (() => void) | null = null;

  constructor(public store: Store, public backend: SimBackend, private stage: Stage) {}

  on(fn: (e: GameEvent) => void) { this.listeners.push(fn); }
  private emit(e: GameEvent) { for (const fn of this.listeners) fn(e); }

  /** 受暂停和倍速影响的等待 */
  async wait(ms: number) {
    let left = ms;
    while (left > 0) {
      await new Promise((r) => setTimeout(r, 50));
      if (!this.paused) left -= 50 * this.speed;
    }
  }

  private advance(min: number) {
    this.store.clock = Math.min(CLOSE, this.store.clock + min);
    this.emit({ t: 'tick' });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      if (this.store.clock >= CLOSE) {
        this.emit({ t: 'dayEnd' });
        await new Promise<void>((r) => (this.dayResolve = r));
        continue;
      }
      try {
        await this.serveOne();
      } catch (err) {
        this.emit({ t: 'error', message: String(err) });
        this.stage.setThinking(null);
        if (this.current) await this.stage.customerLeave('confused');
        this.current = null;
        await this.wait(1500);
      }
      // 口碑越好，下一位来得越快
      const gap = 12 + Math.random() * 30 * (1.4 - this.store.reputation / 100);
      this.advance(Math.round(gap));
      await this.wait(700);
    }
  }

  /** 日报关闭后调用 */
  continueNextDay() {
    const r = this.store.nextDay();
    this.emit({ t: 'tick' });
    if (r.delivered) this.stage.floatText(`预订到货 ${r.delivered} 件`, '#7ec4ff');
    this.dayResolve?.();
    this.dayResolve = null;
  }

  private chooseCustomer(): CustomerProfile {
    const pool = PROFILES.filter((p) => p.id !== this.lastCustomer);
    const p = pick(pool);
    this.lastCustomer = p.id;
    return p;
  }

  private chooseScenario(p: CustomerProfile) {
    const list = p.scenarioIds.map((id) => SCENARIO_MAP.get(id)!);
    const ws = list.map((s) => KIND_WEIGHT[s.kind] ?? 1);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((r -= ws[i]) <= 0) return list[i];
    return list[list.length - 1];
  }

  private push(s: Session, speaker: Speaker, text: string, extra: Partial<ChatMessage> = {}) {
    const msg: ChatMessage = { id: uid(), speaker, text, ts: this.store.clock, ...extra };
    s.messages.push(msg);
    this.emit({ t: 'message', session: s, msg });
    return msg;
  }

  private async serveOne() {
    const profile = this.chooseCustomer();
    const scenario = this.chooseScenario(profile);
    const s: Session = { id: uid(), profile, scenario, messages: [], actions: [],
      shop: this.store.snapshot(), history: this.store.historyOf(profile.id) };
    this.current = s;
    this.sessions.push(s);
    this.emit({ t: 'session', session: s });
    await this.stage.customerEnter(profile);

    let lastMood: Mood = 'neutral';
    for (let round = 0; round < 6; round++) {
      s.shop = this.store.snapshot();
      this.stage.setThinking('customer');
      const c = await this.backend.customerTurn(s);
      this.stage.setThinking(null);
      lastMood = c.mood;
      this.push(s, 'customer', c.text, { mood: c.mood });
      this.advance(2);
      await this.stage.bubble('customer', c.text, c.mood);
      if (c.leave) break;

      this.stage.setThinking('shopkeeper');
      const k = await this.backend.shopkeeperTurn(s);
      this.stage.setThinking(null);
      this.store.mergeActions(s, k.actions ?? []);
      this.push(s, 'shopkeeper', k.text, { actions: k.actions, thought: k.thought });
      if (k.actions?.length) this.emit({ t: 'actions', session: s, actions: k.actions });
      this.advance(2);
      await this.stage.bubble('shopkeeper', k.text);
    }

    const verdict = await this.backend.judge(s);
    const keep = verdict.needMet || lastMood === 'happy' || lastMood === 'neutral';
    const result = this.store.settle(s, verdict, keep);
    if (result.abandoned) this.push(s, 'system', `${profile.name}把东西放回了货架。`);
    this.push(s, 'system', `离店评价：「${verdict.comment}」 满意度 ${verdict.satisfaction}`);
    this.emit({ t: 'settled', session: s, verdict, result });

    if (result.revenue > 0) this.stage.floatText(`+¥${result.revenue.toFixed(1)}`, '#ffd34e');
    else if (result.revenue < 0) this.stage.floatText(`-¥${(-result.revenue).toFixed(1)}`, '#ff7a7a');
    this.stage.floatText(`${result.repDelta >= 0 ? '+' : ''}${result.repDelta} 口碑`, result.repDelta >= 0 ? '#8be28b' : '#ff9a9a');
    const leaveMood: Mood = verdict.satisfaction >= 75 ? 'happy' : verdict.satisfaction >= 50 ? 'neutral' : 'angry';
    await this.stage.customerLeave(leaveMood);
    this.current = null;
  }

  exportJSON() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), backend: this.backend.name,
      days: [...this.store.allDays, this.store.today], visits: this.store.visits, sessions: this.sessions }, null, 2);
  }
}
