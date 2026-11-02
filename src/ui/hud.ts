import type { GameHost } from '../game/host';
import { CLOSE, OPEN } from '../game/state';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmtClock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function stars(rep: number) {
  const full = Math.round(rep / 20);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function mountHud(d: GameHost) {
  const hud = $('#hud');
  hud.innerHTML = `
    <div class="brand"><span class="logo">🏪</span><div><b>${d.storeName ?? '槐树街日用百货'}</b><small>AI 小店实验</small></div></div>
    <div class="stat"><label>第</label><b id="h-day">1</b><label>天</label></div>
    <div class="stat clock"><b id="h-clock">08:00</b><div class="daybar"><i id="h-daybar"></i></div></div>
    <div class="stat"><label>💰</label><b id="h-cash">0</b></div>
    <div class="stat rep"><label>口碑</label><b id="h-stars"></b><small id="h-rep"></small></div>
    <div class="spacer"></div>
    <div class="conn"><i id="h-conn"></i><span id="h-note">连接中…</span></div>
    <div class="backend" title="当前接口来源"><i></i><span id="h-backend"></span></div>
    <div class="controls">
      <button id="b-one" title="只接待下一位 (N)">来一位</button>
      <button id="b-day" title="跑完一整天 (D)">开门一天</button>
      <button id="b-pause" title="暂停 (空格)">⏸</button>
      <button data-speed="1" class="on">1×</button>
      <button data-speed="2">2×</button>
      <button data-speed="4">4×</button>
      <button id="b-restock" title="补满货架">补货</button>
      <button id="b-next" title="开新的一天">下一天</button>
      <button id="b-export" title="导出页面上的对话与评分 JSON">⤓ 导出</button>
    </div>`;

  $('#h-backend').textContent = d.backend.name;
  const pauseBtn = $<HTMLButtonElement>('#b-pause');
  const oneBtn = $<HTMLButtonElement>('#b-one');
  const dayBtn = $<HTMLButtonElement>('#b-day');
  const restockBtn = $<HTMLButtonElement>('#b-restock');
  const nextBtn = $<HTMLButtonElement>('#b-next');

  const togglePause = () => {
    if (d.togglePause) { void d.togglePause(); return; }
    d.paused = !d.paused;
    document.body.classList.toggle('paused', d.paused);
    pauseBtn.textContent = d.paused ? '▶' : '⏸';
  };

  pauseBtn.onclick = togglePause;
  oneBtn.onclick = () => { if (d.stepOne && !d.busy) void d.stepOne(); };
  dayBtn.onclick = () => { if (d.openDay && !d.busy) void d.openDay(); };
  restockBtn.onclick = () => { if (d.restock && !d.busy) void d.restock(); };
  nextBtn.onclick = () => { if (d.nextDay && !d.busy) void d.nextDay(); };

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); oneBtn.click(); }
    else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); dayBtn.click(); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); restockBtn.click(); }
    else if (e.key === '1' || e.key === '2' || e.key === '4') {
      const b = hud.querySelector<HTMLButtonElement>(`[data-speed="${e.key}"]`);
      b?.click();
    }
  });

  hud.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
    b.onclick = () => {
      d.speed = Number(b.dataset.speed);
      hud.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  $('#b-export').onclick = () => {
    const blob = new Blob([d.exportJSON()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: `town-shop-day${d.store.day}-${Date.now()}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const setButtons = () => {
    const busy = !!d.busy;
    oneBtn.disabled = busy || !d.stepOne;
    dayBtn.disabled = busy || !d.openDay;
    restockBtn.disabled = busy || !d.restock;
    nextBtn.disabled = busy || !d.nextDay;
    pauseBtn.textContent = d.paused ? '▶' : '⏸';
    pauseBtn.classList.toggle('on', !!d.paused);
    document.body.classList.toggle('paused', !!d.paused);
    const note = $('#h-note');
    if (note) note.textContent = d.note || (d.connected === false ? '正在重连…' : '待开门');
    const dot = $('#h-conn');
    if (dot) dot.classList.toggle('off', d.connected === false);
  };

  const refresh = () => {
    const s = d.store;
    $('#h-day').textContent = String(s.day);
    $('#h-clock').textContent = fmtClock(s.clock);
    $('#h-daybar').style.width = `${Math.max(0, Math.min(100, ((s.clock - OPEN) / (CLOSE - OPEN)) * 100))}%`;
    $('#h-cash').textContent = s.cash.toFixed(0);
    $('#h-stars').textContent = stars(s.reputation);
    $('#h-rep').textContent = s.reputation.toFixed(0);
    const t = s.today;
    const n = t.visitors || 1;
    $('#dock').innerHTML = `
      <div class="kpi"><label>今日接待</label><b>${t.visitors}</b></div>
      <div class="kpi"><label>营业额</label><b>¥${t.revenue.toFixed(0)}</b></div>
      <div class="kpi"><label>毛利</label><b>¥${t.profit.toFixed(0)}</b></div>
      <div class="kpi"><label>平均满意度</label><b>${t.visitors ? (t.satSum / n).toFixed(0) : '—'}</b></div>
      <div class="kpi"><label>需求满足率</label><b>${t.visitors ? Math.round((t.needMet / n) * 100) + '%' : '—'}</b></div>
      <div class="kpi"><label>个性化命中</label><b>${t.visitors ? Math.round((t.personalized / n) * 100) + '%' : '—'}</b></div>
      <div class="lowstock">${lowStock(d)}</div>`;
    setButtons();
  };

  d.on((e) => {
    if (e.t === 'tick' || e.t === 'settled' || e.t === 'status') refresh();
  });
  refresh();
}

function lowStock(d: GameHost) {
  const low = d.store.inventory.filter((p) => p.stock <= 2);
  if (!low.length) return '<span class="ok">货架充足</span>';
  return '<span class="warn">缺货预警</span>' + low.slice(0, 8).map((p) => `<span class="chip ${p.stock ? '' : 'out'}">${p.emoji}${p.name.split(' ')[0]} ${p.stock}</span>`).join('') + (low.length > 8 ? `<span class="chip">…另 ${low.length - 8} 种</span>` : '');
}
