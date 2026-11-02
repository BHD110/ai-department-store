import { adaptProfile, adaptScenario } from '../server/data';
import type { DataBundle } from '../server/data';
import type { ServerClient } from '../server/client';
import type { ServerCard, ServerDayReport, ServerEvent, ServerProfile, ServerScenario, ServerState, StatePayload } from '../server/types';
import type { ChatMessage, Mood, Session, ShopAction, Speaker } from '../types';
import type { GameEvent, Stage } from './director';
import type { GameHost } from './host';
import { CLOSE, OPEN, Store, cardVerdict } from './state';

const uid = () => Math.random().toString(36).slice(2, 9);

const ACTION_ICON: Record<string, string> = {
  sell: '🛒', refund: '💸', exchange: '🔁', discount: '🏷', reserve: '📦',
  deliver: '🚚', gift_wrap: '🎁', refuse: '✋', recommend: '💡', note: '📝',
  apologize: '🙇', ask: '❓',
};

/** 服务端给的情绪是 0-100 的分数，像素小人只认五种表情。 */
function moodFromScore(score: number | null | undefined): Mood {
  if (score == null || !Number.isFinite(score)) return 'neutral';
  if (score >= 68) return 'happy';
  if (score >= 45) return 'neutral';
  if (score >= 32) return 'confused';
  if (score >= 18) return 'annoyed';
  return 'angry';
}

function describeAction(
  action: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
  store: Store,
): string {
  if (!action) return '';
  const type = String(action.type ?? '');
  const note = String(result?.note ?? '').trim();
  if (result && result.applied === false) {
    return `✖ ${note || String(result.reason ?? '没有落地')}`;
  }
  if (type === 'ask') {
    return result?.effective_ask ? `★ 问到了点子上：${note}` : '';
  }
  if (note) return `${ACTION_ICON[type] ?? '·'} ${note}`;
  const sku = String(action.sku ?? '');
  const name = store.product(sku)?.name ?? sku;
  if (type === 'sell') return `🛒 售出 ${name} ×${action.qty ?? 1}`;
  if (type === 'refund') return `💸 退款 ${name || '—'}`;
  if (type === 'exchange') return `🔁 换货 ${store.product(String(action.old_sku ?? ''))?.name ?? action.old_sku ?? ''} → ${name}`;
  return '';
}

function adaptAction(action: Record<string, unknown>): ShopAction | null {
  switch (action.type) {
    case 'sell':
      return { type: 'sell', sku: String(action.sku ?? ''), qty: Number(action.qty ?? 1), unitPrice: Number(action.unit_price ?? 0) };
    case 'refund':
      return { type: 'refund', sku: String(action.sku ?? ''), qty: Number(action.qty ?? 1), amount: Number(action.amount ?? 0) };
    case 'exchange':
      return { type: 'exchange', fromSku: String(action.old_sku ?? ''), toSku: String(action.sku ?? ''), qty: Number(action.qty ?? 1) };
    default:
      return null;
  }
}

/**
 * 真模式：页面只当看客。
 * 顾客、店主、评委都在服务端跑，这里订阅事件流，把每一句话、每一个动作、
 * 每一张分数卡交给像素场景和侧栏；按钮只是给服务端发指令。
 */
export class LiveDirector implements GameHost {
  readonly backend = { name: '服务端 · Hermes + MCP' };
  speed = 1;
  paused = false;
  running = true;
  busy = false;
  note = '正在连接服务端…';
  connected = false;
  readonly profileCount: number;
  readonly storeName: string;
  sessions: Session[] = [];
  current: Session | null = null;
  lastReport: ServerDayReport | null = null;

  private listeners: ((e: GameEvent) => void)[] = [];
  private chain: Promise<void> = Promise.resolve();
  private serverPaused = false;
  private currentCard: ServerCard | null = null;
  private leaveMood: Mood = 'neutral';

  constructor(
    public store: Store,
    private data: DataBundle,
    private client: ServerClient,
    private stage: Stage,
  ) {
    this.profileCount = data.profiles.length;
    this.storeName = data.storeName;
  }

  on(fn: (e: GameEvent) => void) { this.listeners.push(fn); }
  private emit(e: GameEvent) { for (const fn of this.listeners) fn(e); }

  // ------------------------------------------------------------- 连接

  async start() { await this.connect(); }

  async connect() {
    const payload = await this.client.state();
    this.applyPayload(payload);
    this.client.events({
      onEvent: (ev) => this.enqueue(() => this.handle(ev)),      onOpen: () => {
        this.connected = true;
        this.flushStatus(this.busy ? this.note : '已连上服务端');
      },
      onError: () => {
        this.connected = false;
        this.flushStatus('事件流断开了，正在等它自己重连…');
      },
    });
  }

  wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private enqueue(fn: () => Promise<void> | void) {
    this.chain = this.chain.then(fn).catch((err) => {
      this.emit({ t: 'error', message: String(err) });
    });
  }

  private flushStatus(note = this.note) {
    this.note = note;
    this.emit({ t: 'status', note, busy: this.busy, connected: this.connected });
  }

  private applyPayload(p: StatePayload) {
    if (p.state) this.store.applyServerState(p.state);
    if (typeof p.running === 'boolean') this.busy = p.running;
    if (typeof p.busy === 'boolean') this.busy = p.busy;
    if (typeof p.paused === 'boolean') this.serverPaused = p.paused;
    if (p.note) this.note = p.note;
    if (p.settings_error) this.note = '模型配置不完整：' + p.settings_error;
    if (p.last_error) this.note = '上一轮出错：' + p.last_error;
    this.emit({ t: 'tick' });
    this.flushStatus();
  }

  // ------------------------------------------------------------- 按钮

  async openDay() {
    await this.call('正在叫服务端开门…', () => this.client.runDay({ days: 1 }));
  }

  async stepOne() {
    await this.call('正在叫服务端接待下一位…', () => this.client.runOne());
  }

  async nextDay() {
    await this.call('正在开新的一天…', () => this.client.nextDay());
    this.lastReport = null;
    this.store.clock = OPEN;
    this.emit({ t: 'tick' });
  }

  async restock() {
    await this.call('正在补货…', () => this.client.restock());
  }

  async togglePause() {
    this.paused = !this.paused;
    this.emit({ t: 'tick' });
    try {
      if (this.paused) {
        if (this.busy) this.applyPayload(await this.client.pause());
      } else if (this.serverPaused) {
        this.applyPayload(await this.client.resume());
      }
    } catch (err) {
      this.emit({ t: 'error', message: '暂停没生效：' + err });
    }
  }

  continueNextDay() {
    void this.nextDay();
  }

  private async call(label: string, run: () => Promise<StatePayload>) {
    this.note = label;
    this.flushStatus();
    try {
      this.applyPayload(await run());
    } catch (err) {
      this.emit({ t: 'error', message: String(err) });
      this.flushStatus(String(err));
    }
  }

  // ------------------------------------------------------------- 事件

  private async handle(ev: ServerEvent) {
    switch (ev.type) {
      case 'state':
        this.store.applyServerState(ev.state as ServerState | undefined);
        this.emit({ t: 'tick' });
        break;
      case 'run:status':
        if (typeof ev.busy === 'boolean') this.busy = ev.busy;
        if (typeof ev.paused === 'boolean') this.serverPaused = ev.paused;
        this.flushStatus(typeof ev.note === 'string' ? ev.note : this.note);
        this.emit({ t: 'tick' });
        break;
      case 'day:start':
        this.store.applyServerState(ev.state as ServerState | undefined);
        this.current = null;
        this.lastReport = null;
        this.emit({ t: 'system', text: `—— 第 ${ev.day} 天，开门营业 ——` });
        this.emit({ t: 'tick' });
        break;
      case 'customer:arrive':
        await this.arrive(ev);
        break;
      case 'owner:say':
        await this.ownerSay(ev);
        break;
      case 'customer:say':
        await this.customerSay(ev);
        break;
      case 'action':
        this.action(ev);
        break;
      case 'tool':
        this.tool(ev);
        break;
      case 'customer:leave':
        this.leave(ev);
        break;
      case 'card':
        this.card(ev);
        break;
      case 'encounter:end':
        await this.endEncounter(ev);
        break;
      case 'day:end':
        this.endDay(ev);
        break;
      default:
        break;
    }
  }

  private async arrive(ev: ServerEvent) {
    const rawProfile = (ev.profile ?? {}) as ServerProfile;
    const rawScenario = (ev.scenario ?? {}) as ServerScenario;
    const profile = this.data.profileMap.get(String(rawProfile.id)) ?? adaptProfile(rawProfile, [rawScenario]);
    const scenario = this.data.scenarioMap.get(String(rawScenario.id)) ?? adaptScenario(rawScenario);
    const session: Session = {
      id: String(ev.session_id ?? uid()),
      profile,
      scenario,
      messages: [],
      actions: [],
      shop: this.store.snapshot(),
      history: [],
    };
    this.current = session;
    this.currentCard = null;
    this.leaveMood = 'neutral';
    this.sessions.push(session);

    const slot = Number(ev.slot ?? 0);
    const item = this.store.queue[slot];
    if (item && typeof item.arrivedAt === 'number') {
      this.store.clock = Math.max(OPEN, Math.min(CLOSE - 1, item.arrivedAt * 60));
    }
    this.emit({ t: 'session', session });
    this.emit({ t: 'tick' });
    await this.stage.customerEnter(profile);

    const text = String(ev.text ?? '');
    if (text) {
      this.push(session, 'customer', text, { mood: 'neutral' });
      await this.stage.bubble('customer', text, 'neutral');
    }
    this.stage.setThinking('shopkeeper');
  }

  private async ownerSay(ev: ServerEvent) {
    const session = this.current;
    const text = String(ev.text ?? '');
    if (!session || !text) return;
    this.stage.setThinking(null);
    this.push(session, 'shopkeeper', text);
    await this.stage.bubble('shopkeeper', text);
    this.stage.setThinking('customer');
  }

  private async customerSay(ev: ServerEvent) {
    const session = this.current;
    const text = String(ev.text ?? '');
    if (!session || !text) return;
    const mood = moodFromScore(typeof ev.mood === 'number' ? ev.mood : null);
        this.push(session, 'customer', text, { mood });
    if (ev.revealed) this.push(session, 'system', '★ 顾客把真正在意的事说出来了');
    await this.stage.bubble('customer', text, mood);
    this.stage.setThinking('shopkeeper');
  }

  /** 店主做了什么：在对话里留一条可折叠的记录，不是代码日志。 */
  private tool(ev: ServerEvent) {
    const session = this.current;
    if (!session) return;
    const label = String(ev.label ?? ev.name ?? '');
    if (!label) return;
    this.push(session, 'system', '', {
      tool: { name: String(ev.name ?? ''), label, detail: String(ev.detail ?? '') },
    });
    this.emit({ t: 'tick' });
  }

  private action(ev: ServerEvent) {
    const session = this.current;
    const action = ev.action as Record<string, unknown> | undefined;
    const result = ev.result as Record<string, unknown> | undefined;
    if (typeof ev.cash === 'number') this.store.cash = ev.cash;
    if (typeof ev.reputation === 'number') this.store.reputation = ev.reputation;
    const line = describeAction(action, result, this.store);
    if (session && line) this.push(session, 'system', line);
    if (session && action && result?.applied) {
      const adapted = adaptAction(action);
      if (adapted) session.actions.push(adapted);
    }
    if (action?.type === 'sell' && result?.applied && typeof result.cash === 'number' && result.cash > 0) {
      this.stage.floatText(`+¥${Number(result.cash).toFixed(1)}`, '#ffd34e');
    }
    this.stage.setThinking('shopkeeper');
    this.emit({ t: 'tick' });
  }

  private leave(ev: ServerEvent) {
    const session = this.current;
    this.leaveMood = ev.angry ? 'angry' : ev.exit === 'satisfied' ? 'happy' : 'neutral';
    if (session) {
      const why = typeof ev.reason === 'string' && ev.reason ? `：${ev.reason}` : '';
      const head = ev.forced ? '回合数到顶，这一场收场' : ev.angry ? '顾客带着火走了' : '顾客准备离店';
      this.push(session, 'system', head + why);
    }
    this.stage.setThinking(null);
  }

  private card(ev: ServerEvent) {
    const session = this.current;
    const card = ev.card as ServerCard | undefined;
    if (!session || !card) return;
    this.currentCard = card;
    const verdict = cardVerdict(card);
    const revenue = Number(card.cash_delta ?? 0);
    this.emit({
      t: 'settled',
      session,
      verdict,
      result: {
        revenue,
        profit: revenue,
        repDelta: Number(card.reputation_delta ?? 0),
        abandoned: !!card.lost_sale,
      },
    });
    if (verdict.satisfaction > 0) {
      this.stage.floatText(`${verdict.satisfaction} 分`, verdict.satisfaction >= 60 ? '#8be28b' : '#ff9a9a');
    }
    this.stage.setThinking(null);
  }

  private async endEncounter(_ev: ServerEvent) {
    this.stage.setThinking(null);
    this.store.clock = Math.min(CLOSE - 1, this.store.clock + 4);
    this.emit({ t: 'tick' });
    await this.stage.customerLeave(this.leaveMood);
    this.current = null;
    this.leaveMood = 'neutral';
  }

  private endDay(ev: ServerEvent) {
    this.store.applyServerState(ev.state as ServerState | undefined);
    this.lastReport = (ev.report as ServerDayReport) ?? null;
    this.current = null;
    this.busy = false;
    this.emit({ t: 'tick' });
    this.flushStatus(`第 ${this.store.day} 天 · 打烊`);
    this.emit({ t: 'dayEnd' });
  }

  // ------------------------------------------------------------- 小工具

  private push(session: Session, speaker: Speaker, text: string, extra: Partial<ChatMessage> = {}) {
    const msg: ChatMessage = { id: uid(), speaker, text, ts: this.store.clock, ...extra };
    session.messages.push(msg);
    this.emit({ t: 'message', session, msg });
    return msg;
  }

  /** 不发网络，只把一条假事件塞进同一条流水线：不开模型也能检查页面。 */
  debugEvent(ev: ServerEvent) {
    this.enqueue(() => this.handle(ev));
  }

  exportJSON() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      backend: this.backend.name,
      day: this.store.day,
      cash: this.store.cash,
      reputation: this.store.reputation,
      inventory: this.store.inventory,
      today: this.store.today,
      visits: this.store.visits,
      sessions: this.sessions,
      lastCard: this.currentCard,
      lastReport: this.lastReport,
    }, null, 2);
  }
}
