// ===== 领域模型 =====

export type Category = string;

export interface Product {
  sku: string;
  name: string;
  /** 货架/小签用的短名；英文长名不能按空格截，所以由数据自带 */
  short?: string;
  category: Category;
  price: number; // 售价（元）
  cost: number; // 进价
  stock: number;
  tags: string[]; // 无香、低敏、大包装、儿童、环保……（跟随当前语言）
  emoji: string;
}

/** 固定的小镇居民 profile，AI 顾客扮演的人设 */
export interface CustomerProfile {
  id: string;
  name: string;
  age: number;
  job: string;
  persona: string; // 性格描述，直接喂给顾客 AI
  speech: string; // 说话风格
  budget: [number, number]; // 单次消费心理区间
  traits: string[]; // 过敏、节俭、挑剔、话痨……
  look: { skin: string; hair: string; shirt: string; pants: string; hat?: string; height?: number; bag?: string };
  scenarioIds: string[]; // 此人可能触发的场景
  /** 服务端档案里多出来的几项，页面只用来展示，不参与 AI 调用 */
  tone?: string;
  catchphrase?: string;
  patience?: number;
  pub?: { wants?: string[]; avers?: string[]; surface?: string; observable?: string };
  hidden?: {
    hidden_need?: string;
    reveals_when?: string;
    ideal_signal?: string;
    fail_signal?: string;
    emotion_on_hit?: string;
  };
}

// 服务端用中文场景类型（导购 / 比价 / 退货……），这里统一成 string，
// 像素界面的配色走 KIND_BY_TYPE 的映射。
export type ScenarioKind = string;

/** 场景脚本：顾客 AI 的隐藏动机 + 评判依据 */
export interface Scenario {
  id: string;
  kind: ScenarioKind;
  title: string;
  hiddenNeed: string; // 不直接说出口的真实需求
  opener: string; // mock 开场白模板，{name} 等占位
  wantTags?: string[]; // 满足需求的商品应带的标签
  avoidTags?: string[]; // 踩雷标签
  wantCategory?: Category;
  refundSku?: string;
  maxBudget?: number;
  qty?: number;
  /** 服务端场景原样带过来的几项：页面展示用 */
  typeLabel?: string;
  needSummary?: string;
  hiddenLine?: string;
  opening?: string[];
  ideal?: string[];
  mustNot?: string[];
  skus?: string[];
}

// ===== 对话 & 动作 =====

export type Speaker = 'customer' | 'shopkeeper' | 'system';

export interface ChatMessage {
  id: string;
  speaker: Speaker;
  text: string;
  ts: number; // 游戏内分钟
  mood?: Mood;
  actions?: ShopAction[]; // 老板这一轮执行的动作（原样记录）
  thought?: string;
  /** 店主调柜台工具的记录：label 是给人看的一句话，detail 折叠起来 */
  tool?: { name?: string; label: string; detail?: string };
}

export type Mood = 'happy' | 'neutral' | 'confused' | 'annoyed' | 'angry';

/** 老板 AI 可以对世界执行的动作，前端负责落账 */
export type ShopAction =
  | { type: 'sell'; sku: string; qty: number; unitPrice: number }
  | { type: 'refund'; sku: string; qty: number; amount: number }
  | { type: 'exchange'; fromSku: string; toSku: string; qty: number }
  | { type: 'discount'; percent: number; reason: string }
  | { type: 'coupon'; amount: number }
  | { type: 'preorder'; sku: string; qty: number; days: number }
  | { type: 'gift'; sku: string; qty: number };

export interface CustomerTurn {
  text: string;
  mood: Mood;
  /** true = 顾客准备离开，本次接待结束 */
  leave: boolean;
}

export interface ShopkeeperTurn {
  text: string;
  actions: ShopAction[];
  /** 可选：老板的内心独白，观察台展示用 */
  thought?: string;
}

export interface Verdict {
  satisfaction: number; // 0-100
  needMet: boolean;
  personalized: boolean; // 是否照顾到了个性化细节
  comment: string; // 顾客离店时的一句评价
  tags: string[]; // 「耐心」「推荐精准」「踩雷」……
}

// ===== 会话上下文：发给后端的完整快照 =====

export interface ShopSnapshot {
  day: number;
  clock: number; // 当天分钟数，480 = 08:00
  cash: number;
  reputation: number; // 0-100
  inventory: Product[];
}

export interface Session {
  id: string;
  profile: CustomerProfile;
  scenario: Scenario;
  messages: ChatMessage[];
  actions: ShopAction[];
  shop: ShopSnapshot;
  /** 顾客对这家店的历史记忆（老顾客回头时带上） */
  history: VisitRecord[];
}

export interface VisitRecord {
  sessionId: string;
  day: number;
  customerId: string;
  scenarioId: string;
  kind: ScenarioKind;
  verdict: Verdict;
  revenue: number;
  turns: number;
}

// ===== 后端契约：实现这个接口即可替换 mock =====

export interface SimBackend {
  readonly name: string;
  /** 顾客 AI 说话（开场或回应老板） */
  customerTurn(session: Session): Promise<CustomerTurn>;
  /** 老板 AI 回复并决定动作 */
  shopkeeperTurn(session: Session): Promise<ShopkeeperTurn>;
  /** 接待结束后裁判打分 */
  judge(session: Session): Promise<Verdict>;
}
