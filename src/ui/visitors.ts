import type { GameHost } from '../game/host';
import { KIND_LABEL } from '../data/scenarios';

/** 场景下方的来客条：每位顾客一个小牌子，颜色 = 满意度 */
export function mountVisitors(d: GameHost) {
  const row = document.querySelector('#v-row') as HTMLElement;
  let day = d.store.day;
  d.on((e) => {
    if (e.t === 'tick' && d.store.day !== day) {
      day = d.store.day;
      row.innerHTML = '<span class="empty">新的一天，等待开张</span>';
    }
    if (e.t !== 'settled') return;
    row.querySelector('.empty')?.remove();
    const v = e.verdict;
    const tone = v.satisfaction >= 75 ? 'good' : v.satisfaction >= 50 ? 'mid' : 'bad';
    const el = document.createElement('div');
    el.className = `vtoken ${tone}`;
    el.title = `${e.session.scenario.title}\n「${v.comment}」\n${v.tags.join(' · ')}\n营收 ¥${e.result.revenue.toFixed(1)}`;
    el.innerHTML = `<b>${v.satisfaction}</b><span>${e.session.profile.name}</span><small>${e.session.scenario.typeLabel ?? KIND_LABEL[e.session.scenario.kind] ?? e.session.scenario.kind}${v.needMet ? '' : ' ✘'}</small>`;
    row.appendChild(el);
    row.scrollLeft = row.scrollWidth;
  });
}
