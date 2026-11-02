import './style.css';
import { createBackend } from './backend';
import { Director } from './game/director';
import type { GameHost } from './game/host';
import { LiveDirector } from './game/live';
import { Store } from './game/state';
import { Scene } from './render/scene';
import { ServerClient } from './server/client';
import { loadServerData } from './server/data';
import type { DataBundle } from './server/data';
import { mountHud } from './ui/hud';
import { showDayReport, showStart } from './ui/modals';
import { mountSide } from './ui/side';
import { mountVisitors } from './ui/visitors';

const canvas = () => document.querySelector('#scene') as HTMLCanvasElement;
const layer = () => document.querySelector('#toast-layer') as HTMLElement;

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
  void showStart(director);
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
    '小镇百货',
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
    <h1>没连上服务端</h1>
    <p class="sub">${String(err)}</p>
    <ul class="howto">
      <li>先在 <code>daily-store-sim/server</code> 里启动：<br><code>python -m uvicorn store.app:app --port 3040</code></li>
      <li>再刷新这一页；Vite 会把 <code>/api</code> 和 <code>/data</code> 转给 3040</li>
      <li>只想看像素演出、不调模型：地址后面加 <code>?mock=1</code></li>
    </ul>
    <button class="primary" onclick="location.reload()">重试</button>
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

void boot();
