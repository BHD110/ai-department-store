import type { Scenario } from '../types';

export const SCENARIOS: Scenario[] = [
  // ---- 个性化购买 ----
  { id: 'allergy-dish', kind: 'custom', title: '过敏手的洗洁精',
    hiddenNeed: '手一碰香精就起疹子，要无香低敏的洗洁精，不想被推荐香味款',
    opener: '老板，有没有洗碗用的……我手上一碰那种香香的东西就痒。',
    wantCategory: '清洁', wantTags: ['无香'], avoidTags: ['香味', '柠檬香'] },
  { id: 'baby-laundry', kind: 'custom', title: '新生儿衣物',
    hiddenNeed: '宝宝刚满月，皮肤嫩，要能洗婴儿衣服的，预算不紧',
    opener: '你好，家里刚添了小宝宝，衣服该用什么洗啊？',
    wantCategory: '清洁', wantTags: ['儿童'], avoidTags: ['香味'] },
  { id: 'gift-mom', kind: 'custom', title: '给妈妈的生日礼物',
    hiddenNeed: '预算 100 以内，妈妈对坚果过敏，想要体面的礼盒',
    opener: '下周我妈过生日，想在你这挑个礼物，有什么推荐吗？',
    wantTags: ['送礼'], avoidTags: ['含坚果'], maxBudget: 100 },
  { id: 'diabetic-snack', kind: 'custom', title: '控糖零食',
    hiddenNeed: '刚查出血糖高，嘴馋但不能吃糖',
    opener: '有啥能解馋的小零食？医生说我得注意点……',
    wantCategory: '零食', wantTags: ['无糖'], avoidTags: ['含糖'] },
  { id: 'student-tight', kind: 'custom', title: '月底没钱的学生',
    hiddenNeed: '只有 20 块，要买够下周考试用的笔和本子',
    opener: '老板……那个，考试要用的笔和本子，最便宜的是哪个？',
    wantCategory: '文具', wantTags: ['学生'], maxBudget: 20 },
  { id: 'eco-living', kind: 'custom', title: '不要一次性用品',
    hiddenNeed: '坚持环保，排斥一次性和塑料包装',
    opener: '我想换掉家里的一次性用品，你这有可以反复用的吗？',
    wantTags: ['环保'], avoidTags: ['一次性'] },
  { id: 'kid-draw', kind: 'custom', title: '孙子的画笔',
    hiddenNeed: '孙子 5 岁爱画画，要安全的，想顺便买点小零食哄他',
    opener: '小伙子，我孙子喜欢乱涂乱画，买点啥给他好？',
    wantTags: ['儿童'], wantCategory: '文具' },

  // ---- 普通购买 / 批量 ----
  { id: 'buy-bulb', kind: 'buy', title: '换灯泡',
    hiddenNeed: '厨房灯坏了，想要省电的',
    opener: '灯泡有吗？厨房那个灯闪了两天了。',
    wantCategory: '五金', wantTags: ['节能'] },
  { id: 'bulk-party', kind: 'bulk', title: '社区聚会采购',
    hiddenNeed: '周末社区聚会，要 300 只纸杯，希望有批量优惠',
    opener: '周六社区搞聚会，纸杯我要得多，三百个，能便宜点不？',
    wantCategory: '厨房', wantTags: ['一次性'], qty: 3 },
  { id: 'bulk-diaper', kind: 'outofstock', title: '囤纸尿裤',
    hiddenNeed: '要一次买 6 包，店里不够也愿意预订',
    opener: '纸尿裤 L 码，我想一口气囤六包，有这么多吗？',
    wantCategory: '母婴', qty: 6 },

  // ---- 售后 ----
  { id: 'refund-pan', kind: 'refund', title: '煎锅涂层掉了',
    hiddenNeed: '上周买的不粘锅用三次就掉涂层，要退款，有点火气',
    opener: '老板！你上周卖我的锅，才用了三次就掉皮了，你看看！',
    refundSku: 'K01' },
  { id: 'refund-shampoo', kind: 'refund', title: '洗发水不合适',
    hiddenNeed: '开封用了一次头皮痒，知道开封了不好退，换个也行',
    opener: '这个洗发水我用了一次头皮就痒……开过封了还能退吗？',
    refundSku: 'W01' },
  { id: 'exchange-size', kind: 'exchange', title: '纸尿裤买错码',
    hiddenNeed: '买成了 L 码，宝宝要 M 码，没拆封，只想换',
    opener: '昨天买的纸尿裤码数买错了，没拆的，能换吗？',
    refundSku: 'B01' },
  { id: 'complain-expired', kind: 'complaint', title: '饼干快过期',
    hiddenNeed: '买到离过期只剩 3 天的饼干，要一个说法，被重视比赔钱重要',
    opener: '你家饼干怎么回事，回家一看还有三天就过期了，也不说一声？',
    refundSku: 'F01' },
  { id: 'complain-attitude', kind: 'complaint', title: '昨天被怠慢',
    hiddenNeed: '昨天店员没理她，心里不舒服，来要个道歉',
    opener: '我昨天来问东西，半天没人理我，你们就这么做生意的？' },

  // ---- 砍价 / 咨询 ----
  { id: 'haggle-wok', kind: 'haggle', title: '铸铁锅砍价',
    hiddenNeed: '心理价位 130，砍不下来就走，但送点小东西也能接受',
    opener: '这铸铁锅一百五十九？隔壁镇才卖一百三，便宜点呗。',
    refundSku: 'K02', maxBudget: 135 },
  { id: 'haggle-toolbox', kind: 'haggle', title: '工具箱讲价',
    hiddenNeed: '老熟客，想要个熟人价，给面子就买',
    opener: '老板，这工具箱我看了好几回了，咱老熟人了，给个实在价？',
    refundSku: 'H02', maxBudget: 115 },
  { id: 'ask-oats', kind: 'inquiry', title: '减脂早餐',
    hiddenNeed: '在减肥，想问什么早餐既顶饱又低卡，可能会买',
    opener: '我在减肥，早上吃点啥比较好？你这有没有合适的。',
    wantCategory: '零食', wantTags: ['低卡'] },
  { id: 'ask-battery', kind: 'inquiry', title: '遥控器没电',
    hiddenNeed: '不确定遥控器用几号电池，希望老板帮忙判断',
    opener: '我家电视遥控器没反应了，是不是没电了？该买哪种电池？',
    wantCategory: '五金' },
];

export const SCENARIO_MAP = new Map(SCENARIOS.map((s) => [s.id, s]));

export const KIND_LABEL: Record<string, string> = {
  buy: '购买', custom: '个性化', refund: '退货', exchange: '换货', complaint: '投诉',
  haggle: '砍价', outofstock: '缺货', bulk: '批量', inquiry: '咨询',
  // 服务端场景类型直接拿来显示
  导购: '导购', 比价: '比价', 批量: '批量', 退货: '退货', 换货: '换货', 投诉: '投诉',
  售后: '售后', 紧急: '紧急', 特殊要求: '特殊要求', 伦理陷阱: '伦理陷阱',
};

/** 售后类出现概率降低，让营业更像一家正常的店 */
export const KIND_WEIGHT: Record<string, number> = { refund: 0.45, exchange: 0.5, complaint: 0.4 };
