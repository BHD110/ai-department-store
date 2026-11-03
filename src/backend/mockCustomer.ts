import { pick } from '../i18n';
import type { CustomerTurn, Session, Verdict } from '../types';
import { assess, productOf } from './assess';

const pickOne = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// 口头禅，让同一场景不同人说出来味道不一样（中英各一套）
const TICS: Record<string, [string[], string[]]> = {
  'wang-nainai': [['小伙子，', '哎哟，', ''], ['Young man, ', 'Oh dear, ', '']],
  'zhao-shifu': [['咱说实话，', '嗨，', ''], ['Honestly, ', 'Pfft, ', '']],
  'xiao-lin': [['那个……', '嗯……', ''], ['Um… ', 'Mm… ', '']],
  'a-qiang': [['快点哈，', '', '赶时间，'], ['Quick one, ', '', 'In a hurry, ']],
  'su-jie': [['咱社区啊，', '', '老板，'], ['For our community, ', '', 'Boss, ']],
  'liu-bo': [['我跟你讲，', '想当年，', ''], ['Let me tell you, ', 'Back in my day, ', '']],
  momo: [['嗯嗯，', '', ''], ['Mm-hm, ', '', '']],
  'huang-zong': [['直说吧，', '', ''], ['Straight talk, ', '', '']],
  'tian-tian': [['哎呀，', '', '嘛，'], ['Oh my, ', '', 'Well, ']],
  'zhou-ge': [['逻辑上讲，', '', '我查了下，'], ['Logically, ', '', 'I looked it up, ']],
};

const tic = (s: Session) => {
  const pair = TICS[s.profile.id] ?? [[''], ['']];
  return pickOne(pick(pair[0], pair[1]));
};
const customerTurns = (s: Session) => s.messages.filter((m) => m.speaker === 'customer').length;

function clue(s: Session): string {
  const sc = s.scenario;
  const p = sc.refundSku ? productOf(s.shop.inventory, sc.refundSku) : undefined;
  switch (sc.kind) {
    case 'refund':
    case 'exchange':
      return pick(
        `就是这个「${p?.name ?? '东西'}」，小票我还留着呢。${sc.kind === 'exchange' ? '我就想换一下。' : '你说咋办吧。'}`,
        `It's this "${p?.name ?? 'item'}" — I still have the receipt. ${sc.kind === 'exchange' ? "I'd just like to swap it." : 'What are you going to do about it?'}`,
      );
    case 'complaint':
      return pickOne(pick(
        ['我不是来讹钱的，就想听你们一句实话。', '你们总得给个说法吧？'],
        ["I'm not here to shake you down — I just want the truth.", 'You have to give me some kind of answer.'],
      ));
    case 'haggle':
      return pick(
        `${sc.maxBudget} 块，行我就拿走，不行我就去隔壁了啊。`,
        `${sc.maxBudget} yuan — deal and I take it, otherwise I'm off next door.`,
      );
    case 'outofstock':
      return pick('店里不够的话，能帮我订吗？我不急这两天。', "If you're short, can you order it for me? I'm not in a rush these few days.");
    case 'bulk':
      return pick('量大嘛，你给个批发价，以后社区活动都来你家。', 'Big quantity — give me a wholesale price, and the community will keep coming to you.');
    default:
      return pick(`其实是这样……${sc.hiddenNeed}。`, `Well, the thing is… ${sc.hiddenNeed}.`);
  }
}

export function mockCustomerTurn(s: Session): CustomerTurn {
  const n = customerTurns(s);
  if (n === 0) return { text: tic(s) + s.scenario.opener, mood: 'neutral', leave: false };

  const a = assess(s);
  if (a.violations.length) {
    const firstNeed = s.scenario.hiddenNeed.split(pick('，', ','))[0];
    const msg = pick(
      `不行不行，${a.violations[0]}我用不了。${firstNeed}啊。`,
      `No no — ${a.violations[0]} is no good for me. ${firstNeed}, remember?`,
    );
    return n >= 3
      ? { text: msg + pick('算了，我还是去别家看看。', " Forget it, I'll try somewhere else."), mood: 'angry', leave: true }
      : { text: msg, mood: 'annoyed', leave: false };
  }
  if (a.needMet) {
    const happy = a.personalized
      ? pick(
        ['太好了，你真懂我！下次还来你家。', '哎呀想得真周到，就它了！', '老板靠谱，我跟邻居们也说说。'],
        ["So good — you really get me! I'll be back.", 'How thoughtful, this is the one!', "Great shop — I'll tell the neighbors."],
      )
      : pick(
        ['行，就这样吧。', '好的，谢谢老板。', '嗯，凑合，先拿着。'],
        ['Fine, this will do.', 'OK, thanks!', "Mm, passable — I'll take it."],
      );
    return { text: tic(s) + pickOne(happy), mood: a.personalized ? 'happy' : 'neutral', leave: true };
  }
  if (n >= 4) return {
    text: pickOne(pick(
      ['算了算了，我再转转。', '说了半天也没个准，下次吧。'],
      ["Forget it, I'll look around more.", 'Still no straight answer — next time.'],
    )),
    mood: 'annoyed', leave: true,
  };
  return { text: tic(s) + clue(s), mood: n >= 2 ? 'annoyed' : 'confused', leave: false };
}

export function mockJudge(s: Session): Verdict {
  const a = assess(s);
  const turns = s.messages.filter((m) => m.speaker !== 'system').length;
  let score = 35;
  const tags: string[] = [];
  if (a.needMet) { score += 35; tags.push(pick('需求满足', 'needs met')); }
  if (a.personalized) { score += 18; tags.push(pick('照顾细节', 'personal touch')); }
  if (a.violations.length) { score -= 30; tags.push(pick('踩雷', 'red flag')); }
  if (a.apologized) tags.push(pick('态度诚恳', 'sincere'));
  if (turns <= 4 && a.needMet) { score += 6; tags.push(pick('高效', 'efficient')); }
  if (turns > 8) { score -= (turns - 8) * 3; tags.push(pick('拖沓', 'dragged out')); }
  if (s.profile.id === 'liu-bo') score -= 8; // 挑剔的人设，不算语言相关的 trait
  score += Math.round((Math.random() - 0.5) * 8);
  score = Math.max(0, Math.min(100, score));

  const comment = score >= 80 ? pickOne(pick(
    ['这家店老板是真用心。', '下次还来！', '比镇上超市贴心多了。'],
    ['The owner truly cares.', "I'll be back!", 'Far more attentive than the town supermarket.'],
  ))
    : score >= 55 ? pickOne(pick(
      ['还行吧。', '东西买到了，就是……一般。', '中规中矩。'],
      ["It's OK.", 'Got what I came for, but… meh.', 'Perfectly average.'],
    ))
      : pickOne(pick(
        ['再也不来了。', '服务有待提高。', '白跑一趟。'],
        ['Never coming back.', 'Service needs work.', 'A wasted trip.'],
      ));
  return { satisfaction: score, needMet: a.needMet, personalized: a.personalized, comment, tags };
}
