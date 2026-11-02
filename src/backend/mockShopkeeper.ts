import type { Category, Product, Session, ShopAction, ShopkeeperTurn } from '../types';

// mock 老板只能看到对话和库存，看不到场景里的隐藏需求 —— 和真实 AI 一样要靠问

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const CN: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function parseQty(t: string): number | undefined {
  const d = t.match(/(\d+)\s*(个|只|包|件|盒|支)/);
  if (d) return Number(d[1]);
  const c = t.match(/([一两二三四五六七八九十])(百)?\s*(个|只|包|件|盒)/);
  if (c) return CN[c[1]] * (c[2] ? 100 : 1);
  return undefined;
}

interface Want { cats: Category[]; want: string[]; avoid: string[]; budget?: number; cheap: boolean }

const RULES: [RegExp, Partial<Want>][] = [
  [/灯/, { cats: ['五金'], want: ['节能'] }],
  [/电池|遥控/, { cats: ['五金'], want: ['大包装'] }],
  [/洗碗|洗洁/, { cats: ['清洁'] }],
  [/洗衣|衣服/, { cats: ['清洁'] }],
  [/宝宝|婴儿|孩子|孙子|小孩|满月/, { want: ['儿童'] }],
  [/痒|过敏|香香|皮肤嫩|敏感/, { want: ['低敏'], avoid: ['香味', '柠檬香'] }],
  [/坚果过敏|对坚果/, { avoid: ['含坚果'] }],
  [/礼物|生日|送人|礼盒/, { want: ['送礼'] }],
  [/血糖|不能吃糖|控糖|注意点/, { cats: ['零食'], want: ['无糖'], avoid: ['含糖'] }],
  [/减肥|低卡|顶饱/, { cats: ['零食'], want: ['低卡'] }],
  [/一次性用品|反复|环保|塑料/, { want: ['环保'], avoid: ['一次性'] }],
  [/考试|笔和本|本子/, { cats: ['文具'], want: ['学生'] }],
  [/画画|涂/, { cats: ['文具'], want: ['儿童'] }],
  [/零食|解馋|早餐|早上吃/, { cats: ['零食'] }],
  [/纸杯/, { cats: ['厨房'], want: ['一次性'] }],
  [/纸尿裤/, { cats: ['母婴'] }],
  [/便宜|钱不多|没钱/, { cheap: true }],
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
  const b = text.match(/(\d+)\s*(块|元)?\s*(以内|左右|块)/);
  if (b) w.budget = Number(b[1]);
  return w;
}

const keyName = (p: Product) => p.name.split(' ')[0];
const mentioned = (inv: Product[], t: string) =>
  inv.find((p) => t.includes(keyName(p))) ?? inv.find((p) => keyName(p).length > 2 && t.includes(keyName(p).slice(-2)));

function bestProducts(inv: Product[], w: Want, text: string): Product[] {
  const scored = inv
    .filter((p) => p.stock > 0 && (!w.budget || p.price <= w.budget))
    .map((p) => {
      let s = 0;
      if (w.cats.includes(p.category)) s += 5;
      for (const t of w.want) if (p.tags.includes(t)) s += 3;
      for (const t of w.avoid) if (p.tags.includes(t)) s -= 10;
      if (text.includes(keyName(p))) s += 6;
      if (w.cheap) s -= p.price / 20;
      return { p, s };
    })
    .filter((x) => x.s > 2)
    .sort((a, b) => b.s - a.s);
  return scored.map((x) => x.p);
}

const PRAISE: Record<string, string> = {
  无香: '完全无香精', 低敏: '低敏配方', 儿童: '小朋友专用', 送礼: '包装体面适合送人', 无糖: '不含蔗糖',
  低卡: '低卡又顶饱', 环保: '能反复用', 节能: '省电耐用', 学生: '学生党常买', 耐用: '经久耐用',
};
const reasons = (p: Product) => p.tags.map((t) => PRAISE[t]).filter(Boolean).slice(0, 2).join('，');

export function mockShopkeeperTurn(s: Session): ShopkeeperTurn {
  const inv = s.shop.inventory;
  const custText = s.messages.filter((m) => m.speaker === 'customer').map((m) => m.text).join(' ');
  const last = [...s.messages].reverse().find((m) => m.speaker === 'customer')?.text ?? '';
  const myTurns = s.messages.filter((m) => m.speaker === 'shopkeeper').length;
  const careless = Math.random() < 0.15;
  const regular = s.history.length > 0 ? `${s.profile.name}又来啦！` : '';

  // —— 售后：退 / 换 / 投诉 ——
  if (/退|掉皮|过期|开过封|换吗|码数|买错/.test(custText)) {
    const p = mentioned(inv, custText);
    if (!p) return { text: `${regular}您别急，是哪一款呢？方便的话给我看下小票。`, actions: [], thought: '售后：先确认商品' };
    if (/换/.test(custText)) {
      return { text: `实在抱歉！没拆封直接给您换，正确的码数我这就拿。`, thought: `换货 ${p.sku}`,
        actions: [{ type: 'exchange', fromSku: p.sku, toSku: p.sku, qty: 1 }] };
    }
    const acts: ShopAction[] = [{ type: 'refund', sku: p.sku, qty: 1, amount: p.price }];
    if (/过期/.test(custText)) acts.push({ type: 'coupon', amount: 5 });
    return { text: `对不起，是我们的问题！「${p.name}」给您全额退 ${p.price} 元${acts.length > 1 ? '，再送张 5 元券赔个不是' : ''}。`,
      actions: acts, thought: `退款 ${p.sku}` };
  }
  if (/没人理|做生意|态度|说法/.test(custText)) {
    return careless && myTurns === 0
      ? { text: '昨天人多，可能没顾上，您今天要买点啥？', actions: [], thought: '投诉：没接住情绪' }
      : { text: '真对不起，昨天是我们怠慢了！这张 10 元券您收下，以后您来我亲自招呼。',
        actions: [{ type: 'coupon', amount: 10 }], thought: '投诉：道歉 + 补偿' };
  }

  // —— 砍价 ——
  if (/便宜点|实在价|行不行|行我就拿/.test(last) && !/纸杯|三百/.test(custText)) {
    const p = mentioned(inv, custText) ?? inv.find((x) => x.tags.includes('耐用'))!;
    const counter = Number(last.match(/(\d+)\s*块/)?.[1] ?? 0);
    if (!counter) return { text: `「${p.name}」是好货，最多给您打个九五折，${(p.price * 0.95).toFixed(0)} 元。`, actions: [], thought: '砍价：试探' };
    const floor = p.cost * 1.15;
    if (counter >= floor) {
      const pct = Math.round((1 - counter / p.price) * 100);
      return { text: `行，交个朋友，${counter} 块拿走！`, thought: `让利 ${pct}%`,
        actions: [{ type: 'sell', sku: p.sku, qty: 1, unitPrice: p.price }, { type: 'discount', percent: pct, reason: '砍价' }] };
    }
    const pct = Math.round((1 - floor / p.price) * 100);
    return { text: `${counter} 实在亏本，${floor.toFixed(0)} 块，再送您一包抹布，够意思吧？`, thought: '守住底价 + 赠品',
      actions: [{ type: 'sell', sku: p.sku, qty: 1, unitPrice: p.price }, { type: 'discount', percent: pct, reason: '砍价' },
        { type: 'gift', sku: 'C05', qty: 1 }] };
  }

  // —— 购买 / 定制 ——
  const w = readWants(custText, careless);
  const hasSignal = w.want.length + w.avoid.length > 0 || w.budget;
  if (myTurns === 0 && !hasSignal && Math.random() < 0.6) {
    return { text: regular + pick(['您是自己用还是送人？有什么讲究吗？', '有没有要特别注意的？比如过敏、预算这些。']),
      actions: [], thought: '信息不足，先追问' };
  }
  const cands = bestProducts(inv, w, custText);
  if (!cands.length) return { text: '这个我们店暂时没有合适的，您能再说说具体要求吗？', actions: [], thought: '无匹配商品' };
  const p = careless && cands.length > 1 ? cands[Math.min(cands.length - 1, 1 + Math.floor(Math.random() * 3))] : cands[0];
  let qty = parseQty(custText) ?? 1;
  const pack = Number(p.name.match(/(\d+)\s*(只|片|支|粒|抽)/)?.[1] ?? 0);
  if (pack && qty > pack) qty = Math.ceil(qty / pack);
  const acts: ShopAction[] = [];
  const sellQty = Math.min(qty, p.stock);
  acts.push({ type: 'sell', sku: p.sku, qty: sellQty, unitPrice: p.price });
  let extra = '';
  if (qty > p.stock) {
    acts.push({ type: 'preorder', sku: p.sku, qty: qty - p.stock, days: 2 });
    extra = `店里只有 ${p.stock} 件，剩下 ${qty - p.stock} 件我给您订，后天到。`;
  }
  if (qty >= 3) { acts.push({ type: 'discount', percent: 10, reason: '量大' }); extra += '量大给您打九折。'; }
  const why = reasons(p);
  return { text: `${regular}推荐这款「${p.name}」${why ? '，' + why : ''}，${p.price} 元${sellQty > 1 ? ` × ${sellQty}` : ''}。${extra}`,
    actions: acts, thought: `匹配 ${p.sku}${careless ? '（粗心：忽略了禁忌）' : ''}` };
}
