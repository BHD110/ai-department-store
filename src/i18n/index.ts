import { en } from './en';
import { zh, type Dict } from './zh';

export type Locale = 'zh' | 'en';
export type { Dict };

/** 字典里值为字符串的键（表格类是嵌套对象，不能走 t()）。 */
type StringKeys = { [K in keyof Dict]: Dict[K] extends string ? K : never }[keyof Dict];

const STORAGE_KEY = 'townshop.lang';

function detect(): Locale {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'zh') return q;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* 拿不到 localStorage（隐私模式等）就走浏览器语言 */ }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh';
}

let cur: Locale = detect();

/** 当前语言；双语数据文件用它就地挑字段。 */
export const getLocale = (): Locale => cur;
export const isEn = (): boolean => cur === 'en';

/** 启动时调用：同步 <html lang>、body 标记和页面标题。 */
export function initI18n(): void {
  document.documentElement.lang = cur === 'en' ? 'en' : 'zh-CN';
  document.body.dataset.lang = cur;
  document.title = t('app.pageTitle');
}

/**
 * 一键切换：写偏好、同步 URL 里的 lang 参数，然后整页刷新。
 * 文案全部在启动时重建，聊天记录等动态内容由服务端事件回放恢复。
 */
export function setLocale(next: Locale): void {
  if (next === cur) return;
  cur = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 存不了就算了，本次会话仍生效 */ }
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', next);
    history.replaceState(history.state, '', url);
  }
  location.reload();
}

/** 当前语言的整本字典；表格类文案（评分卡、角色名等）直接查表。 */
export const dict = (): Dict => (cur === 'en' ? en : zh);

/** 带参数的模板文案：'{name}' 之类的占位符逐个替换。 */
export function t(key: StringKeys, params?: Record<string, string | number>): string {
  let s = dict()[key] as string;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

/** 双语数据就地挑一边：pick('小镇百货', 'Town General Store')。 */
export function pick<T>(zhVal: T, enVal: T): T {
  return cur === 'en' ? enVal : zhVal;
}
