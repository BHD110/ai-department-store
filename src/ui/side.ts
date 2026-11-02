import { KIND_LABEL } from '../data/scenarios';
import type { GameHost } from '../game/host';
import type { Store } from '../game/state';
import { drawPerson } from '../render/sprites';
import type { ChatMessage, CustomerProfile, Session, ShopAction, Verdict } from '../types';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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
  const name = (sku: string) => store.product(sku)?.name.split(' ')[0] ?? sku;
  switch (a.type) {
    case 'sell': return `<span class="act sell">🛒 ${name(a.sku)} ×${a.qty}</span>`;
    case 'refund': return `<span class="act refund">💸 退 ¥${a.amount}</span>`;
    case 'exchange': return `<span class="act">🔁 换 ${name(a.fromSku)}</span>`;
    case 'discount': return `<span class="act disc">🏷 ${((100 - a.percent) / 10).toFixed(1).replace('.0', '')} 折</span>`;
    case 'coupon': return `<span class="act disc">🎟 ¥${a.amount} 券</span>`;
    case 'preorder': return `<span class="act">📦 预订 ${name(a.sku)} ×${a.qty}</span>`;
    case 'gift': return `<span class="act gift">🎁 送 ${name(a.sku)}</span>`;
  }
}

export function mountSide(d: GameHost) {
  const card = $('#profile-card');
  const chat = $('#chat');
  chat.innerHTML = `<div class="panel-title">对话记录 <small>老板 AI ↔ 顾客 AI</small></div><div class="log" id="log"></div>`;
  const log = $('#log');
  card.innerHTML = `<div class="empty">等待顾客上门……<br><small>悬停货架可查看商品与库存</small></div>`;

  const showProfile = (s: Session) => {
    const p = s.profile;
    const visits = s.history.length;
    const budget = p.budget[0] > 0 ? `¥${p.budget[0]}–${p.budget[1]}` : `¥${p.budget[1]}`;
    const kind = s.scenario.typeLabel ?? KIND_LABEL[s.scenario.kind] ?? s.scenario.kind;
    card.innerHTML = `
      <div class="pc-head">
        <div class="pc-ava"></div>
        <div class="pc-name"><b>${p.name}</b><small>${p.age} 岁 · ${p.job}</small>
          <div class="pc-tags">${p.traits.map((t) => `<span>${t}</span>`).join('')}${visits ? `<span class="regular">回头客 ×${visits}</span>` : ''}${p.patience != null ? `<span>耐心 ${p.patience}</span>` : ''}</div>
        </div>
        <span class="kind k-${s.scenario.kind}">${kind}</span>
      </div>
      <p class="pc-persona">${esc(p.persona)}<br><small>说话：${esc(p.speech)} · 预算 ${budget}</small></p>
      <details class="spoiler"><summary>🔍 剧透：隐藏需求（顾客 AI 才知道）</summary>
        <p><b>${esc(s.scenario.title)}</b> — ${esc(s.scenario.hiddenNeed || '档案里没写')}</p>
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
      const who = m.speaker === 'customer' ? s.profile.name : '老板';
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
      <div class="v-score ${tone}"><b>${v.satisfaction}</b><small>总分</small></div>
      <div class="v-body">
        <div class="v-flags"><span class="${v.needMet ? 'y' : 'n'}">${v.needMet ? '✔' : '✘'} 需求满足</span>
          <span class="${v.personalized ? 'y' : 'n'}">${v.personalized ? '✔' : '✘'} 个性化</span>
          <span>${revenue >= 0 ? '+' : ''}¥${revenue.toFixed(1)}</span></div>
        <div class="v-tags">${v.tags.map((t) => `<i>${esc(t)}</i>`).join('')}</div>
        <q>${esc(v.comment)}</q>
      </div>`;
    el.classList.add('show');
  };

  d.on((e) => {
    if (e.t === 'session') {
      showProfile(e.session);
      addSystem(`— ${e.session.profile.name} 推门进来 —`);
    } else if (e.t === 'message') addMsg(e.msg, e.session);
    else if (e.t === 'system') addSystem(e.text);
    else if (e.t === 'settled') showVerdict(e.verdict, e.result.revenue);
    else if (e.t === 'error') {
      const el = document.createElement('div');
      el.className = 'msg error';
      el.textContent = `⚠ 接口出错：${e.message}`;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    }
  });
}
