import { pick } from '../i18n';
import { shortName } from '../data/catalog';
import type { Category, Product, Session, ShopAction, ShopkeeperTurn } from '../types';

// mock 老板只能看到对话和库存，看不到场景里的隐藏需求 —— 和真实 AI 一样要靠问。
// 正则同时认中英两套说法：英文模式下顾客说的是英文开场白，一样要能接住。

const pickOne = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const CN: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseQty(t: string): number | undefined {
  const d = t.match(/(\d+)\s*(个|只|包|件|盒|支|片|粒|抽|pcs|pieces?|packs?|boxes?|bottles?|bags?|rolls?|cups?|pairs?)?/i);
  if (d && d[2]) return Number(d[1]);
  const c = t.match(/([一两二三四五六七八九十])(百)?\s*(个|只|包|件|盒)/);
  if (c) return CN[c[1]] * (c[2] ? 100 : 1);
  return undefined;
}

interface Want { cats: Category[]; want: string[]; avoid: string[]; budget?: number; cheap: boolean }

// 中文/英文的关键词都收进来；标签词与目录里的当前语言标签一致
const RULES: [RegExp, Partial<Want>][] = [
  [/灯|bulb|light|lamp/i, { cats: ['hardware'], want: [pick('节能', 'energy-saving')] }],
  [/电池|遥控|battery|remote/i, { cats: ['hardware'], want: [pick('大包装', 'bulk pack')] }],
  [/洗碗|洗洁|dish ?soap|dishwashing/i, { cats: [pick('清洁', 'clean')] }],
  [/洗衣|衣服|laundry|clothes/i, { cats: [pick('清洁', 'clean')] }],
  [/宝宝|婴儿|孩子|孙子|小孩|满月|baby|newborn|infant|kid|child|grandson/i, { want: [pick('儿童', 'for kids')] }],
  [/痒|过敏|香香|皮肤嫩|敏感|itch|allerg|sensitiv|fragran|scent/i, { want: [pick('低敏', 'hypoallergenic')], avoid: [pick('香味', 'scented'), pick('柠檬香', 'lemon scent')] }],
  [/坚果过敏|对坚果|nut allergy|allergic to nuts|nuts/i, { avoid: [pick('含坚果', 'contains nuts')] }],
  [/礼物|生日|送人|礼盒|gift|birthday|present/i, { want: [pick('送礼', 'gift')] }],
  [/血糖|不能吃糖|控糖|sugar|diabet/i, { cats: [pick('零食', 'snack')], want: [pick('无糖', 'sugar-free')], avoid: [pick('含糖', 'sugary')] }],
  [/减肥|低卡|顶饱|diet|low-cal|low calorie|filling/i, { cats: [pick('零食', 'snack')], want: [pick('低卡', 'low-cal')] }],
  [/一次性用品|反复|环保|塑料|reusable|eco|disposable|plastic|sustainab/i, { want: [pick('环保', 'eco-friendly')], avoid: [pick('一次性', 'disposable')] }],
  [/考试|笔和本|本子|exam|notebook|pencil/i, { cats: [pick('文具', 'stationery')], want: [pick('学生', 'student')] }],
  [/画画|涂|draw|crayon|scribbl|paint/i, { cats: [pick('文具', 'stationery')], want: [pick('儿童', 'for kids')] }],
  [/零食|解馋|早餐|早上吃|snack|craving|breakfast/i, { cats: [pick('零食', 'snack')] }],
  [/纸杯|paper cups?|cup/i, { cats: [pick('厨房', 'kitchen')], want: [pick('一次性', 'disposable')] }],
  [/纸尿裤|diaper/i, { cats: [pick('母婴', 'family')] }],
  [/便宜|钱不多|没钱|cheap|broke|no money|tight on money/i, { cheap: true }],
];

function readWants(text: string, careless: boolean): Want {
  const w: Want = { cats: [], want: [], avoid: [], cheap: false };
  for (const [re, r] of RULES) {
    if (!re.test(text)) continue;
    w.cats.push(...(r.cats ?? []));
    w.want.push(...(r.want ?? []));
    if (!careless) w.avoid.push(...(r.avoid ?? []));
    w.cheap ||= !!r.cheap;
  }
  const b = text.match(/(\d+)\s*(块|元|yuan|bucks)?\s*(以内|左右|块|or under|or less|at most|within|max|under)?/i);
  if (b && (b[2] || b[3])) w.budget = Number(b[1]);
  return w;
}

const keyName = (p: Product) => shortName(p);
const mentioned = (inv: Product[], t: string) => {
  const lower = t.toLowerCase();
  return inv.find((p) => lower.includes(keyName(p).toLowerCase()))
    ?? inv.find((p) => keyName(p).length > 2 && lower.includes(keyName(p).toLowerCase().slice(-2)));
};

function bestProducts(inv: Product[], w: Want, text: string): Product[] {
  const lower = text.toLowerCase();
  const scored = inv
    .filter((p) => p.stock > 0 && (!w.budget || p.price <= w.budget))
    .map((p) => {
      let s = 0;
      if (w.cats.includes(p.category)) s += 5;
      for (const t of w.want) if (p.tags.includes(t)) s += 3;
      for (const t of w.avoid) if (p.tags.includes(t)) s -= 10;
      if (lower.includes(keyName(p).toLowerCase())) s += 6;
      if (w.cheap) s -= p.price / 20;
      return { p, s };
    })
    .filter((x) => x.s > 2)
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.p);
}

const PRAISE: Record<string, [string, string]> = {
  无香: ['完全无香精', 'completely fragrance-free'],
  低敏: ['低敏配方', 'hypoallergenic formula'],
  儿童: ['小朋友专用', 'made for kids'],
  送礼: ['包装体面适合送人', 'presentable packaging, great as a gift'],
  无糖: ['不含蔗糖', 'no sucrose'],
  低卡: ['低卡又顶饱', 'low-cal but filling'],
  环保: ['能反复用', 'reusable'],
  节能: ['省电耐用', 'energy-saving and durable'],
  学生: ['学生党常买', 'a student staple'],
  耐用: ['经久耐用', 'built to last'],
};
const reasons = (p: Product) => p.tags
  .map((t) => (PRAISE[t] ? pick(PRAISE[t][0], PRAISE[t][1]) : ''))
  .filter(Boolean)
  .slice(0, 2)
  .join(pick('，', ', '));

export function mockShopkeeperTurn(s: Session): ShopkeeperTurn {
  const inv = s.shop.inventory;
  const custText = s.messages.filter((m) => m.speaker === 'customer').map((m) => m.text).join(' ');
  const last = [...s.messages].reverse().find((m) => m.speaker === 'customer')?.text ?? '';
  const myTurns = s.messages.filter((m) => m.speaker === 'shopkeeper').length;
  const careless = Math.random() < 0.15;
  const regular = s.history.length > 0 ? pick(`${s.profile.name}又来啦！`, `${s.profile.name}'s back! `) : '';

  // —— 售后：退 / 换 / 投诉 ——
  if (/退|掉皮|过期|开过封|换吗|码数|买错|refund|return|peel|flak|expired|opened|exchange|wrong size|bought the wrong/i.test(custText)) {
    const p = mentioned(inv, custText);
    if (!p) return { text: pick(`${regular}您别急，是哪一款呢？方便的话给我看下小票。`, `${regular}No rush — which one was it? Show me the receipt if you have it.`), actions: [], thought: pick('售后：先确认商品', 'After-sales: confirm the item') };
    if (/换|exchange|swap/i.test(custText)) {
      return { text: pick('实在抱歉！没拆封直接给您换，正确的码数我这就拿。', "So sorry! Unopened swaps are no problem — I'll grab the right one now."), thought: pick(`换货 ${p.sku}`, `Exchange ${p.sku}`),
        actions: [{ type: 'exchange', fromSku: p.sku, toSku: p.sku, qty: 1 }] };
    }
    const acts: ShopAction[] = [{ type: 'refund', sku: p.sku, qty: 1, amount: p.price }];
    if (/过期|expire/i.test(custText)) acts.push({ type: 'coupon', amount: 5 });
    return { text: pick(
      `对不起，是我们的问题！「${p.name}」给您全额退 ${p.price} 元${acts.length > 1 ? '，再送张 5 元券赔个不是' : ''}。`,
      `We're sorry, it's on us! "${p.name}" fully refunded at ¥${p.price}${acts.length > 1 ? ', plus a ¥5 coupon by way of apology' : ''}.`,
    ), actions: acts, thought: pick(`退款 ${p.sku}`, `Refund ${p.sku}`) };
  }
  if (/没人理|做生意|态度|说法|ignored|no one|nobody|attitude|do business|how you treat|attention/i.test(custText)) {
    return careless && myTurns === 0
      ? { text: pick('昨天人多，可能没顾上，您今天要买点啥？', 'Yesterday was busy — we may have missed you. What can I get you today?'), actions: [], thought: pick('投诉：没接住情绪', 'Complaint: missed the emotion') }
      : { text: pick('真对不起，昨天是我们怠慢了！这张 10 元券您收下，以后您来我亲自招呼。', "We're truly sorry about yesterday! Take this ¥10 coupon, and next time I'll serve you personally."),
        actions: [{ type: 'coupon', amount: 10 }], thought: pick('投诉：道歉 + 补偿', 'Complaint: apology + compensation') };
  }

  // —— 砍价 ——
  if (/便宜点|实在价|行不行|行我就拿|cheaper|best price|regulars' price|go way back|give me a deal|make it cheaper/i.test(last) && !/纸杯|三百|cups?|\b300\b/i.test(custText)) {
    const p = mentioned(inv, custText) ?? inv.find((x) => x.tags.includes(pick('耐用', 'durable')))!;
    const counter = Number(last.match(/(\d+)\s*(?:块|yuan|bucks)/i)?.[1] ?? 0);
    if (!counter) return { text: pick(`「${p.name}」是好货，最多给您打个九五折，${(p.price * 0.95).toFixed(0)} 元。`, `"${p.name}" is good stuff — the best I can do is 5% off, ¥${(p.price * 0.95).toFixed(0)}.`), actions: [], thought: pick('砍价：试探', 'Haggle: probing') };
    const floor = p.cost * 1.15;
    if (counter >= floor) {
      const pct = Math.round((1 - counter / p.price) * 100);
      return { text: pick(`行，交个朋友，${counter} 块拿走！`, `Deal, for friendship — ¥${counter} and it's yours!`), thought: pick(`让利 ${pct}%`, `Conceded ${pct}%`),
        actions: [{ type: 'sell', sku: p.sku, qty: 1, unitPrice: p.price }, { type: 'discount', percent: pct, reason: pick('砍价', 'haggle') }] };
    }
    const pct = Math.round((1 - floor / p.price) * 100);
    return { text: pick(
      `${counter} 实在亏本，${floor.toFixed(0)} 块，再送您一包抹布，够意思吧？`,
      `¥${counter} would be a real loss — ¥${floor.toFixed(0)}, and I'll throw in a pack of cloth wipes. Fair enough?`,
    ), thought: pick('守住底价 + 赠品', 'Hold the floor + freebie'),
      actions: [{ type: 'sell', sku: p.sku, qty: 1, unitPrice: p.price }, { type: 'discount', percent: pct, reason: pick('砍价', 'haggle') },
        { type: 'gift', sku: 'C05', qty: 1 }] };
  }

  // —— 购买 / 定制 ——
  const w = readWants(custText, careless);
  const hasSignal = w.want.length + w.avoid.length > 0 || w.budget;
  if (myTurns === 0 && !hasSignal && Math.random() < 0.6) {
    return { text: regular + pickOne(pick(
      ['您是自己用还是送人？有什么讲究吗？', '有没有要特别注意的？比如过敏、预算这些。'],
      ['Is it for you or a gift? Any particular needs?', 'Anything to watch out for — allergies, budget?'],
    )), actions: [], thought: pick('信息不足，先追问', 'Not enough info, ask first') };
  }
  const cands = bestProducts(inv, w, custText);
  if (!cands.length) return { text: pick('这个我们店暂时没有合适的，您能再说说具体要求吗？', "We don't have a good match yet — could you tell me a bit more about what you need?"), actions: [], thought: pick('无匹配商品', 'No matching product') };
  const p = careless && cands.length > 1 ? cands[Math.min(cands.length - 1, 1 + Math.floor(Math.random() * 3))] : cands[0];
  let qty = parseQty(custText) ?? 1;
  const m = p.name.match(/(\d+)\s*(只|片|支|粒|抽|pcs|pieces?|packs?)|×\s*(\d+)/i);
  const pack = Number(m?.[1] ?? m?.[3] ?? 0);
  if (pack && qty > pack) qty = Math.ceil(qty / pack);
  const acts: ShopAction[] = [];
  const sellQty = Math.min(qty, p.stock);
  acts.push({ type: 'sell', sku: p.sku, qty: sellQty, unitPrice: p.price });
  let extra = '';
  if (qty > p.stock) {
    acts.push({ type: 'preorder', sku: p.sku, qty: qty - p.stock, days: 2 });
    extra = pick(
      `店里只有 ${p.stock} 件，剩下 ${qty - p.stock} 件我给您订，后天到。`,
      `Only ${p.stock} in stock — I'll order the remaining ${qty - p.stock} for you, arriving the day after tomorrow.`,
    );
  }
  if (qty >= 3) { acts.push({ type: 'discount', percent: 10, reason: pick('量大', 'bulk') }); extra += pick('量大给您打九折。', ' Buy plenty and I take 10% off.'); }
  const why = reasons(p);
  return { text: pick(
    `${regular}推荐这款「${p.name}」${why ? '，' + why : ''}，${p.price} 元${sellQty > 1 ? ` × ${sellQty}` : ''}。${extra}`,
    `${regular}I'd recommend "${p.name}"${why ? ', ' + why : ''} — ¥${p.price}${sellQty > 1 ? ` × ${sellQty}` : ''}. ${extra}`,
  ), actions: acts, thought: pick(`匹配 ${p.sku}${careless ? '（粗心：忽略了禁忌）' : ''}`, `Matched ${p.sku}${careless ? ' (careless: ignored the taboo)' : ''}`) };
}
