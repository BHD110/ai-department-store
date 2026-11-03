import { CAT_COLOR } from '../render/decor';
import type { CustomerProfile, Product, Scenario } from '../types';
import type { ServerCatalog, ServerProfile, ServerScenario } from './types';

export interface DataBundle {
  storeName: string;
  startStock: number;
  categories: { id: string; name: string; color: string }[];
  catalog: ServerCatalog;
  products: Product[];
  profiles: CustomerProfile[];
  profileMap: Map<string, CustomerProfile>;
  scenarios: Scenario[];
  scenarioMap: Map<string, Scenario>;
}

/** 服务端的场景类型 → 像素界面已有的配色分组 */
export const KIND_BY_TYPE: Record<string, string> = {
  导购: 'buy',
  比价: 'haggle',
  批量: 'bulk',
  退货: 'refund',
  换货: 'exchange',
  投诉: 'complaint',
  售后: 'refund',
  紧急: 'buy',
  特殊要求: 'custom',
  伦理陷阱: 'complaint',
};

const CAT_EMOJI: Record<string, string> = {
  clean: '🧴',
  bath: '🧼',
  kitchen: '🍳',
  appliance: '🔌',
  textile: '🧺',
  storage: '🗂️',
  stationery: '✏️',
  family: '😷',
};

const NAME_EMOJI: [RegExp, string][] = [
  [/洗衣|洗洁|消毒|清洁|除菌/, '🧴'],
  [/洗发|沐浴|护发|肥皂|香皂|洗手/, '🧼'],
  [/牙膏|牙刷/, '🪥'],
  [/毛巾|浴巾|抹布/, '🧻'],
  [/纸|抽纸|卫生纸/, '🧻'],
  [/杯|壶|保温/, '🥤'],
  [/锅|碗|盘|勺|刀/, '🍳'],
  [/灯泡|台灯|灯管/, '💡'],
  [/电池/, '🔋'],
  [/插排|插座|电线|延长线/, '🔌'],
  [/风扇|电饭|加湿|取暖/, '🔌'],
  [/拖把|扫把|簸箕/, '🧹'],
  [/垃圾袋/, '🗑️'],
  [/收纳|箱|筐|整理/, '🧺'],
  [/伞/, '☂️'],
  [/拖鞋|鞋/, '🩴'],
  [/袜|床单|被|枕/, '🧦'],
  [/口罩/, '😷'],
  [/手套/, '🧤'],
  [/蚊香|花露|樟脑|驱蚊/, '🦟'],
  [/饼干|糖|零食|坚果/, '🍪'],
  [/牛奶|酸奶/, '🥛'],
  [/酒|啤酒|白酒/, '🍷'],
  [/笔|本|文具|胶带/, '✏️'],
  [/婴儿|尿裤|尿布|湿巾/, '👶'],
];

function emojiFor(name: string, cat: string): string {
  for (const [re, emoji] of NAME_EMOJI) if (re.test(name)) return emoji;
  return CAT_EMOJI[cat] ?? '📦';
}

export function adaptProfile(p: ServerProfile, scenarios: ServerScenario[]): CustomerProfile {
  const look = p.look ?? {};
  return {
    id: p.id,
    name: p.name,
    age: p.age ?? 0,
    job: p.job ?? '',
    persona: p.pub?.surface ?? p.tone ?? '',
    speech: [p.tone, p.catchphrase ? `「${p.catchphrase}」` : ''].filter(Boolean).join('；'),
    budget: [0, Math.max(0, p.budget ?? 0)],
    traits: p.traits ?? [],
    look: {
      skin: look.skin ?? '#f0cfb3',
      hair: look.hair ?? '#2a2a2a',
      shirt: look.shirt ?? '#7fb8a4',
      pants: look.pants ?? '#37474f',
      height: look.height,
      bag: look.bag,
    },
    scenarioIds: scenarios.filter((s) => (s.profiles ?? []).includes(p.id)).map((s) => s.id),
    tone: p.tone,
    catchphrase: p.catchphrase,
    patience: p.patience,
    pub: p.pub,
    hidden: p.hidden,
  };
}

export function adaptScenario(s: ServerScenario): Scenario {
  return {
    id: s.id,
    kind: KIND_BY_TYPE[s.type ?? ''] ?? 'buy',
    title: s.title ?? s.id,
    hiddenNeed: s.need_summary ?? s.hidden_line ?? '',
    opener: s.opening?.[0] ?? '',
    typeLabel: s.type,
    needSummary: s.need_summary,
    hiddenLine: s.hidden_line,
    opening: s.opening,
    ideal: s.ideal,
    mustNot: s.must_not,
    skus: s.skus,
  };
}

function adaptProduct(sku: ServerCatalog['skus'][number], startStock: number): Product {
  return {
    sku: sku.id,
    name: sku.name,
    short: sku.name.split(' ')[0],
    category: sku.cat,
    price: sku.price,
    cost: sku.cost,
    stock: startStock,
    tags: sku.fit ?? [],
    emoji: emojiFor(sku.name, sku.cat),
  };
}

/** 资料只有服务端一份：52 个 SKU、14 位顾客、25 个场景。 */
export async function loadServerData(client: {
  get<T>(path: string): Promise<T>;
}): Promise<DataBundle> {
  const [catalog, profilesRaw, scenariosRaw] = await Promise.all([
    client.get<ServerCatalog>('/data/catalog.json'),
    client.get<{ list: ServerProfile[] }>('/data/profiles.json'),
    client.get<{ list: ServerScenario[] }>('/data/scenarios.json'),
  ]);

  const startStock = Number(catalog.consts?.start_stock ?? 12);
  const scenarios = scenariosRaw.list.map(adaptScenario);
  const scenarioMap = new Map(scenarios.map((s) => [s.id, s]));
  const profiles = profilesRaw.list.map((p) => adaptProfile(p, scenariosRaw.list));
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // 货架上的小方块用服务端分类的颜色，页面不再自己维护一套色表
  for (const cat of catalog.categories) CAT_COLOR[cat.id] = cat.color;

  return {
    storeName: catalog.store_name,
    startStock,
    categories: catalog.categories.map(({ id, name, color }) => ({ id, name, color })),
    catalog,
    products: catalog.skus.map((s) => adaptProduct(s, startStock)),
    profiles,
    profileMap,
    scenarios,
    scenarioMap,
  };
}
