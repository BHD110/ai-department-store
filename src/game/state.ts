import { createCatalog, RESTOCK_TARGET } from '../data/catalog';
import type { ServerCard, ServerState } from '../server/types';
import type { Product, Session, ShopAction, ShopSnapshot, Verdict, VisitRecord } from '../types';

export const OPEN = 8 * 60;
export const CLOSE = 20 * 60;

export interface DayStats {
  day: number;
  visitors: number;
  revenue: number;
  profit: number;
  satSum: number;
  needMet: number;
  personalized: number;
  restockCost: number;
  quotes: { name: string; text: string; sat: number }[];
}

export interface Settlement { revenue: number; profit: number; repDelta: number; abandoned: boolean }

interface Preorder { sku: string; qty: number; due: number; price: number }

const newStats = (day: number): DayStats =>
  ({ day, visitors: 0, revenue: 0, profit: 0, satSum: 0, needMet: 0, personalized: 0, restockCost: 0, quotes: [] });

export class Store {
  day = 1;
  clock = OPEN;
  cash = 2000;
  reputation = 60;
  inventory: Product[] = createCatalog();
  visits: VisitRecord[] = [];
  today: DayStats = newStats(1);
  allDays: DayStats[] = [];
  preorders: Preorder[] = [];
  /** 服务端当天的排队（只用于顶栏和进度展示） */
  queue: { profileId: string; scenarioId: string; arrivedAt?: number }[] = [];
  qidx = 0;

  /** 真实模式下货架由服务端资料生成；mock 模式仍然用内置目录。 */
  constructor(inventory?: Product[]) {
    if (inventory) this.inventory = inventory;
  }

  snapshot(): ShopSnapshot {
    return { day: this.day, clock: this.clock, cash: this.cash, reputation: this.reputation,
      inventory: this.inventory.map((p) => ({ ...p, tags: [...p.tags] })) };
  }

  /** 把服务端的账本快照照原样搬到页面上；页面不再自己算钱、算库存。 */
  applyServerState(st: ServerState | null | undefined) {
    if (!st) return;
    this.day = Number(st.day) || this.day;
    this.cash = Number(st.cash) || 0;
    this.reputation = Number(st.reputation) || 0;
    for (const p of this.inventory) {
      const n = st.stock?.[p.sku];
      if (typeof n === 'number') p.stock = n;
    }

    const t = st.today ?? {};
    const scores = Array.isArray(t.scores) ? t.scores : [];
    const revenue = Number(t.revenue ?? 0);
    const cogs = Number(t.cogs ?? 0);
    const refunds = Number(t.refunds ?? 0);
    const fixed = Number(t.fixedCost ?? 0);
    const restock = Number(t.restock ?? 0);
    const visited = Number(t.served ?? 0) + Number(t.lost ?? 0);

    this.today = {
      ...newStats(this.day),
      visitors: visited,
      revenue,
      profit: t.profit != null ? Number(t.profit) : revenue - cogs - refunds - fixed - restock,
      satSum: scores.reduce((a, c) => a + (typeof c.total === 'number' ? c.total : 0), 0),
      needMet: scores.filter((c) => c.verdict === 'accepted' || c.verdict === 'partial').length,
      personalized: scores.filter((c) => !!c.hidden_need_hit).length,
      restockCost: restock,
      quotes: scores.map((c) => ({
        name: String(c.profile_name ?? '顾客'),
        text: String(c.rationale ?? ''),
        sat: Number(c.total ?? 0),
      })),
    };

    // 今天已经出卡的场次直接用服务端的分数重建，刷新页面也不会重复记一笔
    this.visits = this.visits.filter((v) => v.day !== this.day);
    for (const c of scores) {
      if (!c.session_id) continue;
      this.visits.push({
        sessionId: String(c.session_id),
        day: this.day,
        customerId: String(c.profile_id ?? ''),
        scenarioId: String(c.scenario_id ?? ''),
        kind: String(c.scenario_type ?? c.scenario_id ?? ''),
        verdict: cardVerdict(c),
        revenue: Number(c.cash_delta ?? 0),
        turns: Number(c.turns ?? 0),
      });
    }

    this.queue = Array.isArray(st.queue) ? st.queue : [];
    this.qidx = Number(st.qidx ?? 0);
    const item = this.queue[Math.min(this.qidx, Math.max(0, this.queue.length - 1))];
    if (item && typeof item.arrivedAt === 'number') {
      this.clock = Math.max(OPEN, Math.min(CLOSE - 1, item.arrivedAt * 60));
    }
  }

  product(sku: string) { return this.inventory.find((p) => p.sku === sku); }
  historyOf(customerId: string) { return this.visits.filter((v) => v.customerId === customerId).slice(-5); }

  /**
   * 合并老板新一轮动作到会话。sell / discount 是「结账单」语义：
   * 新一轮里出现就整体替换旧的；其余动作累加。
   */
  mergeActions(s: Session, acts: ShopAction[]) {
    const hasSell = acts.some((a) => a.type === 'sell');
    const hasDisc = acts.some((a) => a.type === 'discount');
    s.actions = s.actions.filter((a) => !(hasSell && a.type === 'sell') && !(hasDisc && a.type === 'discount'));
    for (const a of acts) {
      if ((a.type === 'sell' || a.type === 'gift' || a.type === 'preorder') && !this.product(a.sku)) continue;
      if (a.type === 'sell') a.qty = Math.max(1, Math.min(a.qty, this.product(a.sku)!.stock));
      s.actions.push(a);
    }
  }

  /** 离店结算：顾客满意或平静离开才结账，否则购物车作废 */
  settle(s: Session, v: Verdict, keepCart: boolean): Settlement {
    let revenue = 0;
    let cogs = 0;
    const acts = s.actions;
    const disc = acts.reduce((m, a) => (a.type === 'discount' ? Math.max(m, a.percent) : m), 0);
    const abandoned = !keepCart && acts.some((a) => a.type === 'sell');
    for (const a of acts) {
      const p = 'sku' in a ? this.product(a.sku) : undefined;
      switch (a.type) {
        case 'sell':
          if (abandoned || !p) break;
          revenue += a.unitPrice * a.qty * (1 - disc / 100);
          cogs += p.cost * a.qty;
          p.stock -= a.qty;
          break;
        case 'gift':
          if (!p || p.stock < a.qty) break;
          cogs += p.cost * a.qty;
          p.stock -= a.qty;
          break;
        case 'refund':
          revenue -= a.amount;
          break;
        case 'coupon':
          revenue -= a.amount;
          break;
        case 'exchange': {
          const to = this.product(a.toSku);
          if (to && to.stock >= a.qty) { to.stock -= a.qty; cogs += to.cost * a.qty; }
          break;
        }
        case 'preorder':
          if (p) this.preorders.push({ sku: a.sku, qty: a.qty, due: this.day + Math.max(1, Math.ceil(a.days / 2)), price: p.price });
          break;
      }
    }
    revenue = Math.round(revenue * 100) / 100;
    const profit = Math.round((revenue - cogs) * 100) / 100;
    this.cash = Math.round((this.cash + revenue) * 100) / 100;
    const repDelta = Math.round(((v.satisfaction - 60) / 8) * 10) / 10;
    this.reputation = Math.max(0, Math.min(100, Math.round((this.reputation + repDelta) * 10) / 10));

    const t = this.today;
    t.visitors++;
    t.revenue += revenue;
    t.profit += profit;
    t.satSum += v.satisfaction;
    if (v.needMet) t.needMet++;
    if (v.personalized) t.personalized++;
    t.quotes.push({ name: s.profile.name, text: v.comment, sat: v.satisfaction });

    this.visits.push({ sessionId: s.id, day: this.day, customerId: s.profile.id, scenarioId: s.scenario.id,
      kind: s.scenario.kind, verdict: v, revenue, turns: s.messages.length });
    return { revenue, profit, repDelta, abandoned };
  }

  /** 打烊 → 新的一天：补货、交付预订 */
  nextDay(): { restockCost: number; delivered: number } {
    this.allDays.push(this.today);
    this.day++;
    this.clock = OPEN;
    this.today = newStats(this.day);
    let restockCost = 0;
    for (const p of this.inventory) {
      const need = (RESTOCK_TARGET[p.sku] ?? 0) - p.stock;
      if (need > 0) { restockCost += need * p.cost; p.stock += need; }
    }
    let delivered = 0;
    this.preorders = this.preorders.filter((o) => {
      if (o.due > this.day) return true;
      this.cash += o.price * o.qty;
      this.today.revenue += o.price * o.qty;
      delivered += o.qty;
      return false;
    });
    this.cash = Math.round((this.cash - restockCost) * 100) / 100;
    this.today.restockCost = restockCost;
    return { restockCost, delivered };
  }
}

const VERDICT_ZH: Record<string, string> = {
  accepted: '办明白了',
  partial: '部分满意',
  refused: '被拒绝',
  escalated: '闹大了',
  walked_out: '拂袖而去',
};

const FLAG_ZH: Record<string, string> = {
  hallucinated_policy: '编造店规',
  below_cost: '低于成本',
  over_selling: '硬销',
  blamed_customer: '怪顾客',
  safety_miss: '安全失误',
  agreed_false_claim: '答应虚假说法',
  agreed_fraud: '配合造假',
  sold_age_restricted: '卖给未成年人',
  info_leak: '泄露隐私',
  ignored_accessibility: '忽视不便',
  public_interrogation: '当众盘问',
  embarrassed_customer: '让人难堪',
  too_slow: '拖太久',
  wrong_product: '推错货',
  policy_violation_refund: '违规退款',
  spoil_surprise: '戳破惊喜',
  caved_under_threat: '被威胁就退让',
  denied_experience: '否认顾客感受',
  flat_refusal: '生硬拒绝',
  sales_script: '背话术',
};

/** 服务端评分卡 → 页面通用的离店评价。总分、判词都是服务端算好的，这里只翻译。 */
export function cardVerdict(c: ServerCard): Verdict {
  const tags = (c.flags ?? []).map((f) => FLAG_ZH[f] ?? f);
  if (!tags.length) tags.push(c.verdict ? VERDICT_ZH[c.verdict] ?? c.verdict : '作废');
  return {
    satisfaction: typeof c.total === 'number' ? c.total : 0,
    needMet: c.verdict === 'accepted' || c.verdict === 'partial',
    personalized: !!c.hidden_need_hit,
    comment: String(c.rationale || c.owner_error || c.judge_error || '这一场没有可评的记录。'),
    tags,
  };
}
