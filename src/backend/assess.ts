import type { Product, Session, ShopAction } from '../types';

export interface Assessment {
  needMet: boolean;
  personalized: boolean;
  violations: string[]; // 踩到的雷
  spend: number; // 顾客本次净支出
  apologized: boolean;
  soldSkus: string[];
}

const APOLOGY = /抱歉|对不起|不好意思|是我们的问题|给您添麻烦/;

export function productOf(inv: Product[], sku: string) {
  return inv.find((p) => p.sku === sku);
}

/** 根据场景隐藏需求 + 老板的实际动作，客观判定是否满足（不看嘴上说了什么） */
export function assess(s: Session): Assessment {
  const sc = s.scenario;
  const inv = s.shop.inventory;
  const acts = s.actions;
  const sells = acts.filter((a): a is Extract<ShopAction, { type: 'sell' }> => a.type === 'sell');
  const refunds = acts.filter((a) => a.type === 'refund');
  const discount = acts.reduce((m, a) => (a.type === 'discount' ? Math.max(m, a.percent) : m), 0);
  const coupon = acts.reduce((m, a) => (a.type === 'coupon' ? m + a.amount : m), 0);
  const gifts = acts.filter((a) => a.type === 'gift');
  const preorders = acts.filter((a) => a.type === 'preorder');

  let spend = sells.reduce((m, a) => m + a.unitPrice * a.qty, 0) * (1 - discount / 100);
  spend -= refunds.reduce((m, a) => m + (a.type === 'refund' ? a.amount : 0), 0);
  spend = Math.round(spend * 100) / 100;

  const soldProducts = sells.map((a) => productOf(inv, a.sku)).filter(Boolean) as Product[];
  const violations: string[] = [];
  for (const p of soldProducts) {
    for (const t of sc.avoidTags ?? []) if (p.tags.includes(t)) violations.push(`${p.name}（${t}）`);
  }
  const matches = (p: Product) =>
    (!sc.wantCategory || p.category === sc.wantCategory) &&
    (sc.wantTags ?? []).every((t) => p.tags.includes(t));
  const anyMatch = soldProducts.some(matches);
  const withinBudget = !sc.maxBudget || spend <= sc.maxBudget;
  const apologized = s.messages.some((m) => m.speaker === 'shopkeeper' && APOLOGY.test(m.text));
  const qtySold = sells.reduce((m, a) => m + a.qty, 0);
  const qtyPre = preorders.reduce((m, a) => m + (a.type === 'preorder' ? a.qty : 0), 0);

  let needMet = false;
  let personalized = false;
  switch (sc.kind) {
    case 'buy':
    case 'inquiry':
    case 'custom':
      needMet = anyMatch && withinBudget && violations.length === 0;
      personalized = needMet && ((sc.wantTags?.length ?? 0) > 0 || (sc.avoidTags?.length ?? 0) > 0);
      if (sc.kind === 'inquiry' && !needMet) needMet = soldProducts.some((p) => p.category === sc.wantCategory);
      break;
    case 'bulk':
      needMet = soldProducts.some(matches) && qtySold >= (sc.qty ?? 1);
      personalized = needMet && (discount > 0 || coupon > 0 || gifts.length > 0);
      break;
    case 'outofstock':
      needMet = qtySold + qtyPre >= (sc.qty ?? 1);
      personalized = needMet && qtyPre > 0;
      break;
    case 'refund':
      needMet = refunds.some((r) => r.type === 'refund' && r.sku === sc.refundSku) ||
        acts.some((a) => a.type === 'exchange' && a.fromSku === sc.refundSku);
      personalized = needMet && apologized;
      break;
    case 'exchange':
      needMet = acts.some((a) => (a.type === 'exchange' || a.type === 'refund') &&
        ('fromSku' in a ? a.fromSku : a.sku) === sc.refundSku);
      personalized = needMet && apologized;
      break;
    case 'complaint':
      needMet = apologized && (coupon > 0 || refunds.length > 0 || gifts.length > 0);
      personalized = apologized;
      break;
    case 'haggle': {
      const target = sells.find((a) => a.sku === sc.refundSku);
      needMet = !!target && spend <= (sc.maxBudget ?? Infinity) * (gifts.length ? 1.12 : 1);
      personalized = needMet && (gifts.length > 0 || discount > 0);
      break;
    }
  }
  return { needMet, personalized, violations, spend, apologized, soldSkus: soldProducts.map((p) => p.sku) };
}
