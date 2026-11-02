import type { ServerEvent, StatePayload } from './types';

/** 页面只跟服务端说话：账本、模型、密钥全在 3040 那一侧。 */
export class ServerClient {
  readonly base: string;
  /** v2 编排层的接口前缀；不加 ?pipeline=v2 时还是旧的 /api。 */
  readonly prefix: string;

  constructor(base?: string) {
    const params = new URLSearchParams(location.search);
    const q = params.get('server');
    this.base = (base ?? q ?? '').replace(/\/$/, '');
    // 默认走新的 v2 编排层；要看旧路径加 ?pipeline=v1。
    this.prefix = params.get('pipeline') === 'v1' ? '/api' : '/api/v2';
    if (this.base) new URL(this.base, location.href);
  }

  url(path: string) {
    return this.base + path;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.url(path), init);
    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { detail?: string };
        detail = body.detail ?? '';
      } catch {
        detail = await res.text().catch(() => '');
      }
      throw new Error(`${path} ${res.status}${detail ? '：' + detail : ''}`);
    }
    return res.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  state() {
    return this.get<StatePayload>(`${this.prefix}/state`);
  }

  schema() {
    return this.get<Record<string, unknown>>(`${this.prefix}/schema`);
  }

  runDay(body: { days?: number; fresh_memory?: boolean } = {}) {
    return this.post<StatePayload>(`${this.prefix}/run/day`, { days: 1, ...body });
  }

  runOne(slot?: number) {
    return this.post<StatePayload>(`${this.prefix}/run/one`, slot === undefined ? {} : { slot });
  }

  pause() {
    return this.post<StatePayload>(`${this.prefix}/pause`);
  }

  resume() {
    return this.post<StatePayload>(`${this.prefix}/resume`);
  }

  restock() {
    return this.post<StatePayload>(`${this.prefix}/restock`);
  }

  nextDay() {
    return this.post<StatePayload>(`${this.prefix}/next-day`);
  }

  updateSettings(body: Record<string, unknown>) {
    return this.post<StatePayload>(`${this.prefix}/settings`, body);
  }

  /** 订阅事件流。EventSource 自己会重连，这里只负责分发。 */
  events(handlers: {
    onEvent: (ev: ServerEvent) => void;
    onOpen?: () => void;
    onError?: () => void;
  }): () => void {
    const es = new EventSource(this.url(`${this.prefix}/events`));
    es.onopen = () => handlers.onOpen?.();
    es.onerror = () => handlers.onError?.();
    es.onmessage = (msg) => {
      let ev: ServerEvent;
      try {
        ev = JSON.parse(msg.data) as ServerEvent;
      } catch {
        return;
      }
      if (ev && typeof ev.type === 'string') handlers.onEvent(ev);
    };
    return () => es.close();
  }
}
