import type { GameHost } from '../game/host';
import { dict, pick, t } from '../i18n';

/** 场景下方的来客条：每位顾客一个小牌子，颜色 = 满意度 */
export function mountVisitors(d: GameHost) {
  const row = document.querySelector('#v-row') as HTMLElement;
  const title = document.querySelector('#visitors .panel-title') as HTMLElement | null;
  if (title) title.innerHTML = `${t('visitors.title')} <small>${t('visitors.subtitle')}</small>`;
  // index.html 里的初始占位文案也要换成当前语言
  const empty = row.querySelector('.empty');
  if (empty) empty.textContent = t('visitors.empty');
  let day = d.store.day;
  d.on((e) => {
    if (e.t === 'tick' && d.store.day !== day) {
      day = d.store.day;
      row.innerHTML = `<span class="empty">${t('visitors.newDay')}</span>`;
    }
    if (e.t !== 'settled') return;
    row.querySelector('.empty')?.remove();
    const v = e.verdict;
    const tone = v.satisfaction >= 75 ? 'good' : v.satisfaction >= 50 ? 'mid' : 'bad';
    const el = document.createElement('div');
    el.className = `vtoken ${tone}`;
    const d0 = dict();
    const kind = e.session.scenario.typeLabel ? d0.SERVER_KIND[e.session.scenario.typeLabel] : undefined;
    el.title = `${e.session.scenario.title}\n${pick('「', '"')}${v.comment}${pick('」', '"')}\n${v.tags.join(' · ')}\n${t('visitors.revenueTip', { v: e.result.revenue.toFixed(1) })}`;
    el.innerHTML = `<b>${v.satisfaction}</b><span>${e.session.profile.name}</span><small>${kind ?? d0.KIND[e.session.scenario.kind] ?? e.session.scenario.kind}${v.needMet ? '' : ' ✘'}</small>`;
    row.appendChild(el);
    row.scrollLeft = row.scrollWidth;
  });
}
