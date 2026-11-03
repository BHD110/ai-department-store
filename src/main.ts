import './style.css';
import { createBackend } from './backend';
import { Director } from './game/director';
import type { GameHost } from './game/host';
import { LiveDirector } from './game/live';
import { Store } from './game/state';
import { initI18n, t } from './i18n';
import { Scene } from './render/scene';
import { ServerClient } from './server/client';
import { loadServerData } from './server/data';
import type { DataBundle } from './server/data';
import { mountHud } from './ui/hud';
import { LogWorkspace } from './ui/logs';
import { showDayReport, showStart } from './ui/modals';
import { mountSide } from './ui/side';
import { mountVisitors } from './ui/visitors';

initI18n();

const canvas = () => document.querySelector('#scene') as HTMLCanvasElement;
const layer = () => document.querySelector('#toast-layer') as HTMLElement;
const params = new URLSearchParams(location.search);
const logs = new LogWorkspace(new ServerClient(), () => setView('shop'));
let shopStarted = false;

function setView(view: 'shop' | 'logs', updateUrl = true) {
  if (updateUrl) {
    const url = new URL(location.href);
    if (view === 'logs') url.searchParams.set('view', 'logs');
    else url.searchParams.delete('view');
    history.pushState({ view }, '', url);
  }
  if (view === 'logs') {
    logs.show();
  } else {
    logs.hide();
    if (!shopStarted) {
      shopStarted = true;
      void boot();
    }
  }
}

function mountUi(host: GameHost) {
  mountHud(host);
  mountSide(host);
  mountVisitors(host);
  host.on((e) => { if (e.t === 'dayEnd') showDayReport(host); });
}

/** 真模式：顾客/店主/评委都在服务端，页面只订阅事件并演出。 */
async function bootLive() {
  const client = new ServerClient();
  const data: DataBundle = await loadServerData(client);
  const store = new Store(data.products);

  let director: LiveDirector;
  const scene = new Scene(
    canvas(), layer(), store,
    () => director.speed,
    () => director.paused,
    data.storeName,
  );
  director = new LiveDirector(store, data, client, scene);
  mountUi(director);

  // 方便在控制台调试：window.shop.director / store / data
  Object.assign(window, { shop: { director, store, data, client } });

  await director.connect();
  if (!director.sessions.length && !director.busy) void showStart(director);
}

/** 离线开发：原来的规则 mock，?mock=1 才用。 */
function bootMock() {
  const store = new Store();
  const backend = createBackend();

  let director: Director;
  const scene = new Scene(
    canvas(), layer(), store,
    () => director.speed,
    () => director.paused,
    t('app.mockStoreName'),
  );
  director = new Director(store, backend, scene);
  mountUi(director);

  Object.assign(window, { shop: { director, store, backend } });
  void showStart(director);
}

function fatal(err: unknown) {
  const m = document.querySelector('#modal') as HTMLElement;
  m.innerHTML = `<div class="sheet">
    <div class="title-art">🔌</div>
    <h1>${t('fatal.title')}</h1>
    <p class="sub">${String(err)}</p>
    <ul class="howto">
      <li>${t('fatal.step1')}</li>
      <li>${t('fatal.step2')}</li>
      <li>${t('fatal.step3')}</li>
    </ul>
    <button class="primary" onclick="location.reload()">${t('fatal.retry')}</button>
  </div>`;
  m.hidden = false;
}

async function boot() {
  if (new URLSearchParams(location.search).get('mock') === '1') {
    bootMock();
    return;
  }
  try {
    await bootLive();
  } catch (err) {
    fatal(err);
  }
}

window.addEventListener('shop:open-logs', () => setView('logs'));
window.addEventListener('popstate', () => setView(new URLSearchParams(location.search).get('view') === 'logs' ? 'logs' : 'shop', false));
setView(params.get('view') === 'logs' ? 'logs' : 'shop', false);
