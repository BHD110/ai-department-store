import type { GameHost } from '../game/host';
import { dict, t } from '../i18n';
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
    <h1>${d.storeName ?? t('app.mockStoreName')}</h1>
    <p class="sub">${t('start.sub', { n: d.profileCount })}</p>
    <ul class="howto">
      <li>${t('start.rule1')}</li>
      <li>${t('start.rule2')}</li>
      <li>${t('start.rule3')}</li>
      <li>${t('start.rule4')}</li>
    </ul>
    <p class="hint">${t('start.hint')}</p>
    <div class="row">
      <button class="primary" id="m-go">${d.busy ? t('start.resume') : t('start.go')}</button>
      ${!d.busy && d.openDay && d.stepOne ? `<button id="m-one">${t('start.one')}</button>` : ''}
    </div>
    <small class="backend-note">${t('start.backendNote', { name: d.backend.name })}</small>`);
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
  const t0 = s.today;
  const visited = r?.served != null || r?.lost != null
    ? Number(r?.served ?? 0) + Number(r?.lost ?? 0)
    : t0.visitors;
  const revenue = Number(r?.revenue ?? t0.revenue);
  const profit = Number(r?.profit ?? t0.profit);
  const repDelta = Number(r?.repDelta ?? 0);
  const quotes = [...t0.quotes].sort((a, b) => b.sat - a.sat);
  const best = quotes[0];
  const worst = quotes.length > 1 ? quotes[quotes.length - 1] : undefined;
  const avg = t0.visitors ? t0.satSum / t0.visitors : 0;
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
  const kd = dict();
  const kindName = (k: string) => kd.KIND[k] ?? kd.SERVER_KIND[k] ?? k;
  const m = open(`
    <div class="report-head"><span class="grade g-${grade}">${grade}</span>
      <div><h2>${t('report.title', { n: day })}</h2><small>${t('report.rep')} ${stars(s.reputation)} ${s.reputation.toFixed(0)}${repDelta ? `（${repDelta > 0 ? '+' : ''}${repDelta}）` : ''}</small></div></div>
    <div class="report-grid">
      <div><label>${t('report.visitors')}</label><b>${visited}</b></div>
      <div><label>${t('report.revenue')}</label><b>¥${revenue.toFixed(0)}</b></div>
      <div><label>${t('report.profit')}</label><b>¥${profit.toFixed(0)}</b></div>
      <div><label>${t('report.avgSat')}</label><b>${avg.toFixed(0)}</b></div>
      <div><label>${t('report.needMet')}</label><b>${t0.needMet}/${t0.visitors}</b></div>
      <div><label>${t('report.personalized')}</label><b>${t0.personalized}/${t0.visitors}</b></div>
    </div>
    <div class="kinds">${[...byKind].map(([k, v]) => `<span>${kindName(k)} <b>${v.met}/${v.n}</b></span>`).join('')}</div>
    ${audit.length ? `<p class="hint">${audit.map((x) => `⚠ ${x}`).join('<br>')}</p>` : ''}
    ${best ? `<blockquote class="good">${best.text}<cite>${t('report.cite', { name: best.name, sat: best.sat })}</cite></blockquote>` : ''}
    ${worst ? `<blockquote class="bad">${worst.text}<cite>${t('report.cite', { name: worst.name, sat: worst.sat })}</cite></blockquote>` : ''}
    <p class="hint">${t('report.hint')}</p>
    <div class="row"><button id="m-export">${t('report.export')}</button><button class="primary" id="m-next">${t('report.next', { n: day + 1 })}</button></div>`);
  (m.querySelector('#m-export') as HTMLButtonElement).onclick = () => (document.querySelector('#b-export') as HTMLButtonElement).click();
  (m.querySelector('#m-next') as HTMLButtonElement).onclick = () => { m.hidden = true; d.continueNextDay(); };
}
