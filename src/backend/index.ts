import type { CustomerTurn, Session, ShopkeeperTurn, SimBackend, Verdict } from '../types';
import { mockCustomerTurn, mockJudge } from './mockCustomer';
import { mockShopkeeperTurn } from './mockShopkeeper';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(350 + Math.random() * 650);

/** 纯前端 mock：规则驱动，用来跑通玩法和 UI */
export class MockBackend implements SimBackend {
  readonly name = 'Mock';
  async customerTurn(s: Session) { await think(); return mockCustomerTurn(s); }
  async shopkeeperTurn(s: Session) { await think(); return mockShopkeeperTurn(s); }
  async judge(s: Session) { await sleep(200); return mockJudge(s); }
}

/**
 * HTTP 后端：三个 POST 接口，请求体都是完整 Session 快照。
 * 详见 docs/API.md。
 */
export class HttpBackend implements SimBackend {
  readonly name: string;
  constructor(private base: string, private token?: string) {
    this.name = `HTTP ${new URL(base, location.href).host}`;
  }
  private async post<T>(path: string, s: Session): Promise<T> {
    const res = await fetch(this.base.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      body: JSON.stringify(s),
    });
    if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }
  customerTurn(s: Session) { return this.post<CustomerTurn>('/customer/turn', s); }
  shopkeeperTurn(s: Session) { return this.post<ShopkeeperTurn>('/shopkeeper/turn', s); }
  judge(s: Session) { return this.post<Verdict>('/judge', s); }
}

/**
 * 混合：任一侧可单独接真实后端，其余走 mock。
 * 例：只接老板 AI 做评测 —— ?shopkeeper=http://localhost:8000
 */
export class MixedBackend implements SimBackend {
  readonly name: string;
  constructor(private c: SimBackend, private k: SimBackend, private j: SimBackend) {
    this.name = [c, k, j].every((b) => b.name === c.name) ? c.name : `顾客:${c.name} / 老板:${k.name} / 裁判:${j.name}`;
  }
  customerTurn(s: Session) { return this.c.customerTurn(s); }
  shopkeeperTurn(s: Session) { return this.k.shopkeeperTurn(s); }
  judge(s: Session) { return this.j.judge(s); }
}

/** URL 参数：?api=<base> 三侧全接；或 ?customer= / ?shopkeeper= / ?judge= 分别接；&token= */
export function createBackend(): SimBackend {
  const q = new URLSearchParams(location.search);
  const token = q.get('token') ?? undefined;
  const mock = new MockBackend();
  const pickSide = (key: string) => {
    const url = q.get(key) ?? q.get('api');
    return url ? new HttpBackend(url, token) : mock;
  };
  return new MixedBackend(pickSide('customer'), pickSide('shopkeeper'), pickSide('judge'));
}
