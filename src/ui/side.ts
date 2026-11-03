import { shortName } from '../data/catalog';
import type { GameHost } from '../game/host';
import type { Store } from '../game/state';
import { dict, isEn, t } from '../i18n';
import { drawPerson } from '../render/sprites';
import type { ChatMessage, CustomerProfile, Session, ShopAction, Verdict } from '../types';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 服务端给的细分类型优先，翻译不出再退回内部大类。 */
function kindLabel(typeLabel: string | undefined, kind: string | undefined): string {
  const d = dict();
  return (typeLabel ? d.SERVER_KIND[typeLabel] : undefined) ?? (kind ? d.KIND[kind] ?? kind : '');
}

function portrait(p: CustomerProfile) {
  const cv = document.createElement('canvas');
  cv.width = 24; cv.height = 22;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fbe9c9'; c.fillRect(0, 0, 24, 22);
  drawPerson(c, 12, 33, p.look, 'neutral', 0);
  cv.className = 'portrait';
  return cv;
}

function actionChip(a: ShopAction, store: Store) {
  const name = (sku: string) => {
    const p = store.product(sku);
    return p ? shortName(p) : sku;
  };
  switch (a.type) {
    case 'sell': return `<span class="act sell">🛒 ${name(a.sku)} ×${a.qty}</span>`;
    case 'refund': return `<span class="act refund">${t('act.refund', { v: a.amount })}</span>`;
    case 'exchange': return `<span class="act">${t('act.exchange', { name: name(a.fromSku) })}</span>`;
    case 'discount': {
      const label = isEn() ? `${a.percent}% off` : `${((100 - a.percent) / 10).toFixed(1).replace('.0', '')} 折`;
      return `<span class="act disc">🏷 ${label}</span>`;
    }
    case 'coupon': return `<span class="act disc">${t('act.coupon', { v: a.amount })}</span>`;
    case 'preorder': return `<span class="act">${t('act.preorder', { name: name(a.sku), qty: a.qty })}</span>`;
    case 'gift': return `<span class="act gift">${t('act.gift', { name: name(a.sku) })}</span>`;
  }
}

export function mountSide(d: GameHost) {
  const card = $('#profile-card');
  const chat = $('#chat');
  chat.innerHTML = `<div class="panel-title">${t('side.chatTitle')} <small>${t('side.chatSubtitle')}</small></div><div class="log" id="log"></div>`;
  const log = $('#log');
  card.innerHTML = `<div class="empty">${t('side.waiting')}<br><small>${t('side.waitingHint')}</small></div>`;

  const showProfile = (s: Session) => {
    const p = s.profile;
    const visits = s.history.length;
    const budget = p.budget[0] > 0 ? `¥${p.budget[0]}–${p.budget[1]}` : `¥${p.budget[1]}`;
    const kind = kindLabel(s.scenario.typeLabel, s.scenario.kind);
    card.innerHTML = `
      <div class="pc-head">
        <div class="pc-ava"></div>
        <div class="pc-name"><b>${p.name}</b><small>${t('side.yearsJob', { age: p.age, job: p.job })}</small>
          <div class="pc-tags">${p.traits.map((tr) => `<span>${tr}</span>`).join('')}${visits ? `<span class="regular">${t('side.regular', { n: visits })}</span>` : ''}${p.patience != null ? `<span>${t('side.patience', { n: p.patience })}</span>` : ''}</div>
        </div>
        <span class="kind k-${s.scenario.kind}">${kind}</span>
      </div>
      <p class="pc-persona">${esc(p.persona)}<br><small>${t('side.speechBudget', { speech: esc(p.speech), budget })}</small></p>
      <details class="spoiler"><summary>${t('side.spoiler')}</summary>
        <p><b>${esc(s.scenario.title)}</b> — ${esc(s.scenario.hiddenNeed || t('side.noHidden'))}</p>
      </details>
      <div class="verdict" id="verdict"></div>`;
    card.querySelector('.pc-ava')!.appendChild(portrait(p));
  };

  const addMsg = (m: ChatMessage, s: Session) => {
    const el = document.createElement('div');
    el.className = `msg ${m.speaker}`;
    if (m.tool) {
      // 折叠起来：默认只给一句人话，想细看再展开
      el.innerHTML = `<details class="tool"><summary>🛠 ${esc(m.tool.label)}</summary>${
        m.tool.detail ? `<div class="tool-detail">${esc(m.tool.detail)}</div>` : ''
      }</details>`;
    } else if (m.speaker === 'system') {
      el.textContent = m.text;
    } else {
      const who = m.speaker === 'customer' ? s.profile.name : t('side.boss');
      const acts = (m.actions ?? []).map((a) => actionChip(a, d.store)).join('');
      el.innerHTML = `<div class="who">${who}<time>${String(Math.floor(m.ts / 60)).padStart(2, '0')}:${String(m.ts % 60).padStart(2, '0')}</time></div>
        <div class="text">${esc(m.text)}</div>
        ${acts ? `<div class="acts">${acts}</div>` : ''}
        ${m.thought ? `<div class="thought">💭 ${esc(m.thought)}</div>` : ''}`;
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  };

  const addSystem = (text: string) => {
    const el = document.createElement('div');
    el.className = 'sep';
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  };

  const showVerdict = (v: Verdict, revenue: number) => {
    const el = $('#verdict');
    if (!el) return;
    const tone = v.satisfaction >= 75 ? 'good' : v.satisfaction >= 50 ? 'mid' : 'bad';
    el.innerHTML = `
      <div class="v-score ${tone}"><b>${v.satisfaction}</b><small>${t('side.totalScore')}</small></div>
      <div class="v-body">
        <div class="v-flags"><span class="${v.needMet ? 'y' : 'n'}">${v.needMet ? '✔' : '✘'} ${t('side.needMet')}</span>
          <span class="${v.personalized ? 'y' : 'n'}">${v.personalized ? '✔' : '✘'} ${t('side.personalized')}</span>
          <span>${revenue >= 0 ? '+' : ''}¥${revenue.toFixed(1)}</span></div>
        <div class="v-tags">${v.tags.map((tr) => `<i>${esc(tr)}</i>`).join('')}</div>
        <q>${esc(v.comment)}</q>
      </div>`;
    el.classList.add('show');
  };

  d.on((e) => {
    if (e.t === 'session') {
      showProfile(e.session);
      addSystem(t('side.entered', { name: e.session.profile.name }));
    } else if (e.t === 'message') addMsg(e.msg, e.session);
    else if (e.t === 'system') addSystem(e.text);
    else if (e.t === 'settled') showVerdict(e.verdict, e.result.revenue);
    else if (e.t === 'error') {
      const el = document.createElement('div');
      el.className = 'msg error';
      el.textContent = t('side.error', { msg: e.message });
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    }
  });
}
