import type { CustomerTurn, Session, Verdict } from '../types';
import { assess, productOf } from './assess';

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// 口头禅，让同一场景不同人说出来味道不一样
const TICS: Record<string, string[]> = {
  'wang-nainai': ['小伙子，', '哎哟，', ''],
  'zhao-shifu': ['咱说实话，', '嗨，', ''],
  'xiao-lin': ['那个……', '嗯……', ''],
  'a-qiang': ['快点哈，', '', '赶时间，'],
  'su-jie': ['咱社区啊，', '', '老板，'],
  'liu-bo': ['我跟你讲，', '想当年，', ''],
  momo: ['嗯嗯，', '', ''],
  'huang-zong': ['直说吧，', '', ''],
  'tian-tian': ['哎呀，', '', '嘛，'],
  'zhou-ge': ['逻辑上讲，', '', '我查了下，'],
};

const tic = (s: Session) => pick(TICS[s.profile.id] ?? ['']);
const customerTurns = (s: Session) => s.messages.filter((m) => m.speaker === 'customer').length;

function clue(s: Session): string {
  const sc = s.scenario;
  const p = sc.refundSku ? productOf(s.shop.inventory, sc.refundSku) : undefined;
  switch (sc.kind) {
    case 'refund':
    case 'exchange':
      return `就是这个「${p?.name ?? '东西'}」，小票我还留着呢。${sc.kind === 'exchange' ? '我就想换一下。' : '你说咋办吧。'}`;
    case 'complaint':
      return pick(['我不是来讹钱的，就想听你们一句实话。', '你们总得给个说法吧？']);
    case 'haggle':
      return `${sc.maxBudget} 块，行我就拿走，不行我就去隔壁了啊。`;
    case 'outofstock':
      return '店里不够的话，能帮我订吗？我不急这两天。';
    case 'bulk':
      return '量大嘛，你给个批发价，以后社区活动都来你家。';
    default:
      return `其实是这样……${sc.hiddenNeed}。`;
  }
}

export function mockCustomerTurn(s: Session): CustomerTurn {
  const n = customerTurns(s);
  if (n === 0) return { text: tic(s) + s.scenario.opener, mood: 'neutral', leave: false };

  const a = assess(s);
  if (a.violations.length) {
    const msg = `不行不行，${a.violations[0]}我用不了。${s.scenario.hiddenNeed.split('，')[0]}啊。`;
    return n >= 3
      ? { text: msg + '算了，我还是去别家看看。', mood: 'angry', leave: true }
      : { text: msg, mood: 'annoyed', leave: false };
  }
  if (a.needMet) {
    const happy = a.personalized
      ? ['太好了，你真懂我！下次还来你家。', '哎呀想得真周到，就它了！', '老板靠谱，我跟邻居们也说说。']
      : ['行，就这样吧。', '好的，谢谢老板。', '嗯，凑合，先拿着。'];
    return { text: tic(s) + pick(happy), mood: a.personalized ? 'happy' : 'neutral', leave: true };
  }
  if (n >= 4) return { text: pick(['算了算了，我再转转。', '说了半天也没个准，下次吧。']), mood: 'annoyed', leave: true };
  return { text: tic(s) + clue(s), mood: n >= 2 ? 'annoyed' : 'confused', leave: false };
}

export function mockJudge(s: Session): Verdict {
  const a = assess(s);
  const turns = s.messages.filter((m) => m.speaker !== 'system').length;
  let score = 35;
  const tags: string[] = [];
  if (a.needMet) { score += 35; tags.push('需求满足'); }
  if (a.personalized) { score += 18; tags.push('照顾细节'); }
  if (a.violations.length) { score -= 30; tags.push('踩雷'); }
  if (a.apologized) tags.push('态度诚恳');
  if (turns <= 4 && a.needMet) { score += 6; tags.push('高效'); }
  if (turns > 8) { score -= (turns - 8) * 3; tags.push('拖沓'); }
  if (s.profile.traits.includes('挑剔')) score -= 8;
  score += Math.round((Math.random() - 0.5) * 8);
  score = Math.max(0, Math.min(100, score));

  const comment = score >= 80 ? pick(['这家店老板是真用心。', '下次还来！', '比镇上超市贴心多了。'])
    : score >= 55 ? pick(['还行吧。', '东西买到了，就是……一般。', '中规中矩。'])
      : pick(['再也不来了。', '服务有待提高。', '白跑一趟。']);
  return { satisfaction: score, needMet: a.needMet, personalized: a.personalized, comment, tags };
}
