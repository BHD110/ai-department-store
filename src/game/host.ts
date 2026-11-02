import type { Session } from '../types';
import type { ServerDayReport } from '../server/types';
import type { GameEvent } from './director';
import type { Store } from './state';

/**
 * 页面层只认这个接口：mock 与真服务端都一样。
 * 真模式下没有「本地起一位顾客」，所以动作入口全是可选的。
 */
export interface GameHost {
  store: Store;
  speed: number;
  paused: boolean;
  running: boolean;
  busy?: boolean;
  note?: string;
  connected?: boolean;
  profileCount: number;
  storeName?: string;
  sessions: Session[];
  current: Session | null;
  backend: { name: string };
  lastReport?: ServerDayReport | null;
  on(fn: (e: GameEvent) => void): void;
  wait(ms: number): Promise<void>;
  start(): void | Promise<void>;
  openDay?(): Promise<void>;
  stepOne?(): Promise<void>;
  nextDay?(): Promise<void>;
  restock?(): Promise<void>;
  togglePause?(): Promise<void>;
  continueNextDay(): void;
  exportJSON(): string;
}
