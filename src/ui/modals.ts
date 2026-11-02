import { KIND_LABEL } from '../data/scenarios';
import type { GameHost } from '../game/host';
import { stars } from './hud';

const modal = () => document.querySelector('#modal') as HTMLElement;

function open(html: string) {
  const m = modal();
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  return m;
}

export function showStart(d: GameHost): Promise<void> {
  const m = open(`
    <div class="title-art">🏪</div>
    <h1>${d.storeName ?? '小镇百货'}</h1>
    <p class="sub">一家开在小镇路口的日用品店。<br>今天会有 ${d.profileCount} 位老街坊中的几位推门进来——<br>有人要买东西，有人来退货，有人只想讲讲价。</p>
    <ul class="howto">
      <li><b>顾客 AI</b> 扮演固定的小镇居民，带着不说出口的隐藏需求</li>
      <li><b>老板 AI</b> 由 Hermes 看店，只能听见顾客说的话，靠柜台工具成交</li>
      <li>每位顾客离店时由评委打分，影响 <b>营收</b> 与 <b>口碑</b></li>
      <li>这一轮是真模型：一句话要等几秒到几十秒，页面只负责把发生的事演出来</li>
    </ul>
    <p class="hint">空格暂停 · N 来一位 · D 开门一天 · 悬停货架看库存 · 右侧可剧透隐藏需求</p>
    <div class="row">
      <button class="primary" id="m-go">${d.busy ? '接着看这一场' : '开门营业'}</button>
      ${!d.busy && d.openDay && d.stepOne ? '<button id="m-one">只接待一位</button>' : ''}
    </div>
    <small class="backend-note">当前接口：${d.backend.name}</small>`);
  return new Promise((res) => {
    (m.querySelector('#m-go') as HTMLButtonElement).onclick = () => {
      m.hidden = true;
      if (!d.busy) {
        if (d.openDay) void d.openDay();
        else void d.start();
      }
      res();
    };
    const one = m.querySelector('#m-one') as HTMLButtonElement | null;
    if (one) one.onclick = () => { m.hidden = true; void d.stepOne?.(); res(); };
  });
}

export function showDayReport(d: GameHost) {
  const s = d.store;
  const r = d.lastReport;
  const day = r?.day ?? s.day;
  const t = s.today;
  const visited = r?.served != null || r?.lost != null
    ? Number(r?.served ?? 0) + Number(r?.lost ?? 0)
    : t.visitors;
  const revenue = Number(r?.revenue ?? t.revenue);
  const profit = Number(r?.profit ?? t.profit);
  const repDelta = Number(r?.repDelta ?? 0);
  const quotes = [...t.quotes].sort((a, b) => b.sat - a.sat);
  const best = quotes[0];
  const worst = quotes.length > 1 ? quotes[quotes.length - 1] : undefined;
  const avg = t.visitors ? t.satSum / t.visitors : 0;
  const grade = avg >= 85 ? 'S' : avg >= 72 ? 'A' : avg >= 60 ? 'B' : avg >= 45 ? 'C' : 'D';
  const visits = s.visits.filter((v) => v.day === s.day);
  const byKind = new Map<string, { n: number; met: number }>();
  for (const v of visits) {
    const k = v.kind;
    const row = byKind.get(k) ?? { n: 0, met: 0 };
    row.n++; if (v.verdict.needMet) row.met++;
    byKind.set(k, row);
  }
  const audit: string[] = Array.isArray(r?.audit) ? (r?.audit as string[]) : [];
  const m = open(`
    <div class="report-head"><span class="grade g-${grade}">${grade}</span>
      <div><h2>第 ${day} 天 · 打烊日报</h2><small>口碑 ${stars(s.reputation)} ${s.reputation.toFixed(0)}${repDelta ? `（${repDelta > 0 ? '+' : ''}${repDelta}）` : ''}</small></div></div>
    <div class="report-grid">
      <div><label>接待</label><b>${visited}</b></div>
      <div><label>营业额</label><b>¥${revenue.toFixed(0)}</b></div>
      <div><label>毛利</label><b>¥${profit.toFixed(0)}</b></div>
      <div><label>平均满意度</label><b>${avg.toFixed(0)}</b></div>
      <div><label>需求满足</label><b>${t.needMet}/${t.visitors}</b></div>
      <div><label>个性化命中</label><b>${t.personalized}/${t.visitors}</b></div>
    </div>
    <div class="kinds">${[...byKind].map(([k, v]) => `<span>${KIND_LABEL[k] ?? k} <b>${v.met}/${v.n}</b></span>`).join('')}</div>
    ${audit.length ? `<p class="hint">${audit.map((x) => `⚠ ${x}`).join('<br>')}</p>` : ''}
    ${best ? `<blockquote class="good">${best.text}<cite>— 评委点评 · ${best.name}，${best.sat} 分</cite></blockquote>` : ''}
    ${worst ? `<blockquote class="bad">${worst.text}<cite>— 评委点评 · ${worst.name}，${worst.sat} 分</cite></blockquote>` : ''}
    <p class="hint">补货要自己点顶栏的「补货」；第二天开门后货架和账本都接着服务端。</p>
    <div class="row"><button id="m-export">⤓ 导出页面数据</button><button class="primary" id="m-next">开始第 ${day + 1} 天</button></div>`);
  (m.querySelector('#m-export') as HTMLButtonElement).onclick = () => (document.querySelector('#b-export') as HTMLButtonElement).click();
  (m.querySelector('#m-next') as HTMLButtonElement).onclick = () => { m.hidden = true; d.continueNextDay(); };
}
