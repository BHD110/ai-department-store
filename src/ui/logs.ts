import type { LogRunDetail, LogRunSummary, LogTrace, ServerCard } from '../server/types';
import { ServerClient } from '../server/client';
import '../logs.css';

type View = 'traces' | 'score' | 'events';
type Entry = { id: string; name: string; card?: ServerCard; count: number };

const KIND_NAMES: Record<string, string> = {
  prompt: '提示词',
  'model.request': '模型请求',
  'model.response': '模型返回',
  reasoning: '模型思考',
  'tool.call': '工具调用',
  'tool.result': '工具结果',
  'actor.response': '角色回复',
  transaction: '交易',
  error: '错误',
  observation: '环境观察',
};

const ACTOR_NAMES: Record<string, string> = {
  owner: '店主', customer: '顾客', judge: '评委', environment: '环境', system: '系统',
};
const PAGE_SIZE = 100;

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] ?? char);

function pretty(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

function dateLabel(value: unknown): string {
  if (!value) return '时间未知';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}

function timeLabel(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString('zh-CN', { hour12: false });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function recordFromJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return asRecord(value);
  try { return asRecord(JSON.parse(value)); } catch { return null; }
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('');
  const item = asRecord(value);
  return item ? contentText(item.text ?? item.content ?? '') : '';
}

function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : '—';
}

function actorName(value: unknown): string {
  return ACTOR_NAMES[String(value ?? '')] ?? String(value ?? '未知角色');
}

function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class LogWorkspace {
  private root: HTMLElement;
  private runs: LogRunSummary[] = [];
  private detail: LogRunDetail | null = null;
  private runId = '';
  private encounterId = 'all';
  private view: View = 'traces';
  private query = '';
  private kind = 'all';
  private actor = 'all';
  private loadingRuns = false;
  private loadingDetail = false;
  private error = '';
  private requestId = 0;
  private active = false;
  private timer: number | undefined;
  private openItems = new Set<string>();
  private traceLimit = PAGE_SIZE;
  private eventLimit = PAGE_SIZE;
  private scoreLimit = PAGE_SIZE;
  private onClose: () => void;

  constructor(private client: ServerClient, onClose: () => void) {
    this.onClose = onClose;
    this.root = document.createElement('div');
    this.root.id = 'log-workspace';
    this.root.hidden = true;
    document.body.append(this.root);
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('input', (event) => this.onInput(event));
    this.root.addEventListener('change', (event) => this.onChange(event));
    this.root.addEventListener('toggle', (event) => {
      const item = event.target as HTMLDetailsElement;
      if (!item.matches('details[data-item]')) return;
      if (item.open) this.openItems.add(item.dataset.item ?? '');
      else this.openItems.delete(item.dataset.item ?? '');
    }, true);
    document.addEventListener('keydown', (event) => this.onKeydown(event));
  }

  show() {
    window.clearInterval(this.timer);
    const requestedRun = new URLSearchParams(location.search).get('run');
    if (requestedRun && requestedRun !== this.runId) {
      this.runId = requestedRun;
      this.detail = null;
      this.encounterId = 'all';
      this.openItems.clear();
      this.traceLimit = PAGE_SIZE;
      this.eventLimit = PAGE_SIZE;
      this.scoreLimit = PAGE_SIZE;
    }
    this.active = true;
    this.root.hidden = false;
    document.body.classList.add('logs-visible');
    this.render();
    this.closeMemory();
    void this.loadRuns();
    this.timer = window.setInterval(() => void this.refresh(), 5000);
  }

  hide() {
    this.active = false;
    this.root.hidden = true;
    this.closeMemory();
    document.body.classList.remove('logs-visible');
    window.clearInterval(this.timer);
    this.requestId++;
  }

  private async refresh() {
    if (!this.active || this.loadingRuns || this.loadingDetail) return;
    try {
      const response = await this.client.logRuns();
      if (!this.active) return;
      this.runs = response.runs ?? [];
      this.renderRuns();
      if (!this.runId && this.runs.length) {
        await this.selectRun(this.runs[0].run_id);
      } else if (this.runId === this.runs[0]?.run_id) {
        await this.loadDetail(true);
      }
    } catch (error) {
      if (this.active) this.showError(error);
    }
  }

  private async loadRuns() {
    this.loadingRuns = true;
    this.render();
    try {
      const response = await this.client.logRuns();
      if (!this.active) return;
      this.runs = response.runs ?? [];
      this.error = '';
      this.loadingRuns = false;
      this.renderRuns();
      if (this.runId && this.runs.some((run) => run.run_id === this.runId)) {
        await this.loadDetail();
      } else if (this.runs.length) {
        await this.selectRun(this.runs[0].run_id);
      } else {
        this.runId = '';
        this.detail = null;
        this.renderContent();
      }
    } catch (error) {
      if (!this.active) return;
      this.loadingRuns = false;
      this.showError(error);
      this.renderRuns();
      this.renderContent();
    }
  }

  private async selectRun(runId: string) {
    const url = new URL(location.href);
    url.searchParams.set('run', runId);
    history.replaceState(history.state, '', url);
    if (this.runId !== runId) {
      this.runId = runId;
      this.detail = null;
      this.encounterId = 'all';
      this.openItems.clear();
      this.traceLimit = PAGE_SIZE;
      this.eventLimit = PAGE_SIZE;
      this.scoreLimit = PAGE_SIZE;
      this.renderRuns();
    }
    await this.loadDetail();
  }

  private async loadDetail(silent = false) {
    if (!this.runId) return;
    const request = ++this.requestId;
    this.loadingDetail = true;
    if (!silent) this.renderContent();
    try {
      const detail = await this.client.logRun(this.runId);
      if (!this.active || request !== this.requestId) return;
      this.loadingDetail = false;
      this.error = '';
      if (JSON.stringify(detail) !== JSON.stringify(this.detail)) {
        this.detail = detail;
        this.renderContent(silent);
      } else if (!silent) {
        this.renderContent();
      }
      this.renderStatus();
    } catch (error) {
      if (!this.active || request !== this.requestId) return;
      this.loadingDetail = false;
      this.showError(error);
      this.renderContent();
    }
  }

  private showError(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.renderStatus();
  }

  private render() {
    this.root.innerHTML = `
      <a class="lw-skip" href="#lw-content">跳到日志内容</a>
      <header class="lw-header">
        <div class="lw-brand"><span class="lw-brand-mark" aria-hidden="true">▦</span><div><b>小镇百货</b><small>运行日志</small></div></div>
        <nav class="lw-nav" aria-label="页面"><button type="button" data-action="shop">商店</button><span class="lw-nav-active" aria-current="page">日志工作台</span><button type="button" data-action="memory">记忆</button></nav>
        <div id="lw-status" class="lw-status" aria-live="polite"></div>
      </header>
      <div class="lw-layout">
        <aside class="lw-sidebar" aria-label="运行轮次"><div class="lw-side-head"><div><span class="lw-eyebrow">运行档案</span><h2>全部轮次</h2></div><button type="button" class="lw-icon-btn" data-action="refresh" title="刷新日志" aria-label="刷新日志">↻</button></div><div id="lw-runs" class="lw-runs"></div></aside>
        <main id="lw-content" class="lw-main" tabindex="-1"></main>
      </div>
      <div id="lw-memory" class="lw-memory" hidden role="dialog" aria-modal="true" aria-labelledby="lw-memory-title">
        <section class="lw-memory-sheet">
          <header class="lw-memory-head">
            <div><span class="lw-memory-kicker">Memory</span><h2 id="lw-memory-title">陈一鸣</h2></div>
            <button type="button" class="lw-memory-close" data-action="close-memory" aria-label="关闭记忆">×</button>
          </header>
          <div class="lw-memory-list">
            <article class="lw-memory-note is-goal"><span class="lw-memory-type">目标</span><p>正在筹备周末的柠檬茶摊，采购预算约 200 元。</p></article>
            <article class="lw-memory-note is-access"><span class="lw-memory-type">出行与居住</span><p>住六楼，没有电梯，骑电动车出行，采购时应考虑便携性。</p></article>
            <article class="lw-memory-note is-preference"><span class="lw-memory-type">偏好</span><p>偏好可重复使用的摆摊工具，但这一偏好不适用于一次性饮料杯。</p></article>
            <article class="lw-memory-note is-schedule"><span class="lw-memory-type">日程</span><p>计划白天摆摊，时间为 10:00—16:00。</p></article>
          </div>
        </section>
      </div>`;
    this.renderRuns();
    this.renderContent();
    this.renderStatus();
  }

  private renderStatus() {
    const target = this.root.querySelector('#lw-status');
    if (!target) return;
    target.innerHTML = this.error
      ? `<span class="lw-status-error" title="${escapeHtml(this.error)}">连接失败</span><button type="button" data-action="refresh">重试</button>`
      : `<span class="lw-live-dot"></span>${this.loadingRuns || this.loadingDetail ? '读取中' : '每 5 秒检查新日志'}`;
  }

  private renderRuns() {
    const target = this.root.querySelector('#lw-runs');
    if (!target) return;
    if (this.loadingRuns && !this.runs.length) {
      target.innerHTML = '<div class="lw-skeleton"></div><div class="lw-skeleton"></div><div class="lw-skeleton"></div>';
      return;
    }
    if (!this.runs.length) {
      target.innerHTML = `<div class="lw-side-empty">${this.error ? '暂时无法读取轮次。' : '还没有运行记录。'}</div>`;
      return;
    }
    target.innerHTML = this.runs.map((run, index) => `
      <button type="button" class="lw-run ${run.run_id === this.runId ? 'is-active' : ''}" data-run="${escapeHtml(run.run_id)}" aria-current="${run.run_id === this.runId ? 'true' : 'false'}">
        <span class="lw-run-top"><strong title="${escapeHtml(run.run_id)}">${escapeHtml(run.run_id)}</strong><span>${index === 0 ? '最新' : ''}</span></span>
        <time>${escapeHtml(dateLabel(run.started))}</time><span class="lw-run-bottom">${run.encounters} 次接待 <span aria-hidden="true">↗</span></span>
        <span class="lw-run-state">${run.encounters === 0 && run.trace_count === 0 ? '待开始' : run.trace_count === 0 ? '无模型过程记录' : `${run.trace_count} 条过程记录`}</span>
      </button>`).join('');
  }

  private entries(): Entry[] {
    if (!this.detail) return [];
    const traces = this.detail.traces ?? [];
    const cards = this.detail.encounters ?? [];
    const entries: Entry[] = cards.map((card, index) => ({
      id: String(card.session_id ?? `encounter-${index + 1}`),
      name: String(card.profile_name ?? `第 ${index + 1} 位顾客`),
      card,
      count: 0,
    }));
    for (const trace of traces) {
      if (!trace.encounter_id) continue;
      let entry = entries.find((item) => item.id === trace.encounter_id);
      if (!entry) {
        entry = { id: trace.encounter_id, name: `接待 ${entries.length + 1}`, count: 0 };
        entries.push(entry);
      }
      entry.count++;
    }
    return entries;
  }

  private selectedTraces() {
    const traces = this.detail?.traces ?? [];
    return traces.filter((trace) => {
      if (this.encounterId !== 'all' && trace.encounter_id !== this.encounterId) return false;
      if (this.kind !== 'all' && trace.kind !== this.kind) return false;
      if (this.actor !== 'all' && trace.actor !== this.actor) return false;
      const haystack = `${trace.title ?? ''} ${trace.kind} ${trace.actor ?? ''} ${pretty(trace.data)}`.toLocaleLowerCase();
      return haystack.includes(this.query.toLocaleLowerCase());
    });
  }

  private renderContent(preserveScroll = false) {
    const target = this.root.querySelector<HTMLElement>('#lw-content');
    if (!target) return;
    const scroll = preserveScroll ? target.scrollTop : 0;
    const pageScroll = preserveScroll ? this.root.scrollTop : 0;
    const search = this.root.querySelector<HTMLInputElement>('#lw-search');
    const searchFocused = preserveScroll && document.activeElement === search;
    const caret = searchFocused ? search?.selectionStart : null;
    if (!this.detail) {
      target.innerHTML = this.loadingDetail || this.loadingRuns
        ? '<div class="lw-empty-state"><div class="lw-loading-bar"></div><h1>正在读取运行日志</h1><p>接待过程和模型记录读取完成后会显示在这里。</p></div>'
        : `<div class="lw-empty-state"><span class="lw-empty-mark">▤</span><h1>${this.error ? '日志暂时无法读取' : '暂无运行日志'}</h1><p>${this.error ? escapeHtml(this.error) : '从商店开始一次接待后，运行记录会出现在这里。'}</p><div class="lw-empty-actions">${this.error ? '<button type="button" data-action="refresh">重新读取</button>' : '<button type="button" data-action="shop">返回商店</button>'}<button type="button" class="lw-solid-btn" data-action="memory">查看记忆</button></div></div>`;
      return;
    }
    const entries = this.entries();
    if (this.encounterId !== 'all' && !entries.some((entry) => entry.id === this.encounterId)) this.encounterId = 'all';
    const run = this.runs.find((item) => item.run_id === this.runId);
    const selected = entries.find((entry) => entry.id === this.encounterId);
    const traces = this.selectedTraces();
    const kinds = [...new Set((this.detail.traces ?? []).map((trace) => trace.kind))].sort();
    const actors = [...new Set((this.detail.traces ?? []).map((trace) => trace.actor).filter(Boolean))].sort();
    const coverage = asRecord(this.detail.coverage);
    const coverageNote = coverage?.note;
    target.innerHTML = `
      ${this.error ? `<div class="lw-error-banner" role="alert"><span>日志更新失败：${escapeHtml(this.error)}</span><button type="button" data-action="refresh">重试</button></div>` : ''}
      <div class="lw-overview">
        <div><span class="lw-eyebrow">运行记录 / ${run?.encounters === 0 && run.trace_count === 0 ? '待开始' : '已保存数据'}</span><h1>${escapeHtml(run ? dateLabel(run.started) : this.runId)}</h1><p class="lw-run-id" title="${escapeHtml(this.runId)}">${escapeHtml(this.runId)}</p></div>
        <div class="lw-overview-actions"><button type="button" data-action="copy-run">复制轮次 ID</button><button type="button" class="lw-solid-btn" data-action="export-run">导出 JSON ↓</button></div>
      </div>
      <div class="lw-metrics" aria-label="本轮概况"><div><strong>${entries.length}</strong><span>次接待</span></div><div><strong>${this.detail.traces?.length ?? 0}</strong><span>条过程记录</span></div><div><strong>${this.detail.events?.length ?? 0}</strong><span>条服务事件</span></div><div class="lw-coverage"><span>记录范围</span><strong>${escapeHtml(coverageNote ?? '以实际保存的记录为准')}</strong></div></div>
      <section class="lw-browser" aria-label="按接待浏览"><div class="lw-section-head"><div><span class="lw-eyebrow">接待索引</span><h2>顾客与过程</h2></div><span>${entries.length} 次接待</span></div>
        <div class="lw-encounters" role="group" aria-label="选择接待"><button type="button" class="lw-encounter ${this.encounterId === 'all' ? 'is-active' : ''}" data-encounter="all"><b>全部过程</b><small>${this.detail.traces?.length ?? 0} 条</small></button>${entries.map((entry, index) => `<button type="button" class="lw-encounter ${this.encounterId === entry.id ? 'is-active' : ''}" data-encounter="${escapeHtml(entry.id)}"><span class="lw-encounter-index">${String(index + 1).padStart(2, '0')}</span><b>${escapeHtml(entry.name)}</b><small>${entry.count} 条</small></button>`).join('')}</div>
      </section>
      <div class="lw-content-head"><div><span class="lw-eyebrow">${selected ? escapeHtml(selected.name) : '整轮记录'}</span><h2>${this.view === 'traces' ? '过程时间线' : this.view === 'score' ? '接待档案' : '服务事件'}</h2></div><div class="lw-content-tools">${selected ? '<button type="button" data-action="export-encounter">导出本次接待 ↓</button>' : ''}<div class="lw-tabs" role="tablist" aria-label="日志内容"><button type="button" role="tab" aria-selected="${this.view === 'traces'}" data-view="traces">过程</button><button type="button" role="tab" aria-selected="${this.view === 'score'}" data-view="score">评分与对话</button><button type="button" role="tab" aria-selected="${this.view === 'events'}" data-view="events">原始事件</button></div></div></div>
      ${this.view === 'traces' ? `<div class="lw-filters"><label class="lw-search"><span aria-hidden="true">⌕</span><input id="lw-search" type="search" value="${escapeHtml(this.query)}" placeholder="搜索提示词、工具、回复…" aria-label="搜索过程记录"></label><label><span>类型</span><select id="lw-kind"><option value="all">全部类型</option>${kinds.map((kind) => `<option value="${escapeHtml(kind)}" ${this.kind === kind ? 'selected' : ''}>${escapeHtml(KIND_NAMES[kind] ?? kind)}</option>`).join('')}</select></label><label><span>角色</span><select id="lw-actor"><option value="all">全部角色</option>${actors.map((actor) => `<option value="${escapeHtml(actor)}" ${this.actor === actor ? 'selected' : ''}>${escapeHtml(actorName(actor))}</option>`).join('')}</select></label><span class="lw-result-count">${traces.length} 条结果</span></div>${this.renderTraces(traces)}` : this.view === 'score' ? this.renderScores(selected) : this.renderEvents(selected)}
      <details class="lw-coverage-details" data-item="coverage" ${this.openItems.has('coverage') ? 'open' : ''}><summary>记录范围与采集信息</summary><pre>${escapeHtml(pretty(this.detail.coverage ?? {}))}</pre></details>`;
    if (preserveScroll) {
      target.scrollTop = scroll;
      this.root.scrollTop = pageScroll;
      if (searchFocused) {
        const next = this.root.querySelector<HTMLInputElement>('#lw-search');
        next?.focus({ preventScroll: true });
        if (caret !== null && caret !== undefined) next?.setSelectionRange(caret, caret);
      }
    }
  }

  private renderTraces(traces: LogTrace[]): string {
    if (!traces.length && this.kind === 'reasoning') return `<div class="lw-list-empty"><h3>暂无模型思考记录</h3><p>${escapeHtml(this.detail?.coverage.reasoning_note ?? '当前记录没有模型实际返回的独立思考内容。')}</p></div>`;
    if (!traces.length) return `<div class="lw-list-empty"><span>∅</span><h3>${this.query || this.kind !== 'all' || this.actor !== 'all' ? '没有匹配的过程记录' : '这次接待没有过程记录'}</h3><p>${this.query || this.kind !== 'all' || this.actor !== 'all' ? '试试其他关键词或筛选条件。' : '历史轮次可能只有评分与对话，可在相邻标签查看。'}</p></div>`;
    return `<ol class="lw-timeline">${traces.slice(0, this.traceLimit).map((trace, index) => {
      const id = trace.id || `trace-${index}`;
      const title = trace.title || KIND_NAMES[trace.kind] || trace.kind;
      return `<li class="lw-trace lw-trace-${trace.kind === 'error' ? 'error' : trace.kind.startsWith('tool.') ? 'tool' : trace.kind.startsWith('model.') ? 'model' : 'default'}"><div class="lw-trace-marker" aria-hidden="true"></div><details data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary><span class="lw-trace-kind">${escapeHtml(KIND_NAMES[trace.kind] ?? trace.kind)}</span><span class="lw-trace-title">${escapeHtml(title)}</span><span class="lw-trace-meta">${trace.turn == null ? '' : `第 ${escapeHtml(trace.turn)} 轮 · `}${trace.actor || trace.phase ? escapeHtml(actorName(trace.actor ?? trace.phase)) : ''}${trace.ts ? ` · ${escapeHtml(timeLabel(trace.ts))}` : ''}</span><span class="lw-chevron" aria-hidden="true">⌄</span></summary><div class="lw-trace-body">${this.renderTraceData(trace)}<div class="lw-item-actions"><button type="button" data-copy-trace="${escapeHtml(id)}">复制这条记录</button></div></div></details></li>`;
    }).join('')}</ol>${traces.length > this.traceLimit ? `<div class="lw-more"><span>已显示 ${this.traceLimit} / ${traces.length} 条</span><button type="button" data-action="more-traces">再显示 ${Math.min(PAGE_SIZE, traces.length - this.traceLimit)} 条</button></div>` : ''}`;
  }

  private renderTraceData(trace: LogTrace): string {
    const data = asRecord(trace.data);
    if (trace.kind === 'prompt' && Array.isArray(data?.sections)) {
      return `<div class="lw-sections">${data.sections.map((section, index) => {
        const item = asRecord(section);
        const key = `${trace.id}-section-${index}`;
        return `<details data-item="${escapeHtml(key)}" ${this.openItems.has(key) ? 'open' : ''}><summary><span>${escapeHtml(item?.label ?? item?.kind ?? `片段 ${index + 1}`)}</span><small>${escapeHtml(item?.kind ?? '')}</small></summary><pre>${escapeHtml(pretty(item?.content ?? section))}</pre></details>`;
      }).join('')}</div>`;
    }
    if (trace.kind === 'model.request' && data) {
      const body = asRecord(data.body) ?? data;
      const { messages, tools, ...parameters } = body;
      const metadata = body === data ? null : Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'body'));
      const requestKey = `${trace.id}-body`;
      return `<div class="lw-sections">${metadata && Object.keys(metadata).length ? `<details data-item="${escapeHtml(trace.id)}-meta" ${this.openItems.has(`${trace.id}-meta`) ? 'open' : ''}><summary>调用信息</summary><pre>${escapeHtml(pretty(metadata))}</pre></details>` : ''}<details data-item="${escapeHtml(requestKey)}" ${this.openItems.has(requestKey) ? 'open' : ''}><summary>请求参数 <small>实际发送的 API body</small></summary><pre>${escapeHtml(pretty(parameters))}</pre></details>${Array.isArray(messages) ? messages.map((message, index) => {
        const role = asRecord(message)?.role;
        const key = `${trace.id}-message-${index}`;
        const label = role === 'system' ? '系统提示词' : role === 'user' ? '用户消息' : role === 'assistant' ? '模型消息' : `消息 ${index + 1}`;
        return `<details data-item="${escapeHtml(key)}" ${this.openItems.has(key) ? 'open' : ''}><summary>${label} ${index + 1}<small>${escapeHtml(role ?? '')}</small></summary><pre>${escapeHtml(pretty(asRecord(message)?.content ?? message))}</pre></details>`;
      }).join('') : ''}${Array.isArray(tools) ? tools.map((tool, index) => {
        const definition = asRecord(tool);
        const key = `${trace.id}-tool-${index}`;
        const name = asRecord(definition?.function)?.name ?? definition?.name ?? `工具 ${index + 1}`;
        return `<details data-item="${escapeHtml(key)}" ${this.openItems.has(key) ? 'open' : ''}><summary>工具定义：${escapeHtml(name)}<small>${index + 1} / ${tools.length}</small></summary><pre>${escapeHtml(pretty(tool))}</pre></details>`;
      }).join('') : tools !== undefined ? `<details data-item="${escapeHtml(trace.id)}-tools" ${this.openItems.has(`${trace.id}-tools`) ? 'open' : ''}><summary>工具定义</summary><pre>${escapeHtml(pretty(tools))}</pre></details>` : ''}</div>`;
    }
    if (trace.kind === 'model.response' && data) return this.renderModelResponse(trace, data);
    if (trace.kind === 'actor.response' && data) {
      const raw = asRecord(data.raw);
      const say = data.say ?? raw?.say ?? data.text ?? data.content;
      return `${say == null ? '<p class="lw-readable-empty">没有可直接展示的回复文字。</p>' : this.readableText('角色回复', say)}${this.rawTrace(trace)}`;
    }
    if (trace.kind === 'reasoning' && data) {
      const thought = data.text ?? data.content;
      return `${thought == null ? '<p class="lw-readable-empty">这条记录没有思考正文。</p>' : this.readableText('模型返回的思考', thought)}${this.rawTrace(trace)}`;
    }
    if ((trace.kind === 'tool.call' || trace.kind === 'tool.result') && data) {
      const isCall = trace.kind === 'tool.call';
      const body = isCall ? data.input ?? data.arguments ?? data.args ?? data.params : data.result ?? data.output ?? data.response;
      return `<div class="lw-readable"><span>${escapeHtml(data.title ?? trace.title ?? (isCall ? '工具调用' : '工具结果'))}</span>${body == null ? '<p>未记录结构化内容，可查看原始记录。</p>' : `<pre>${escapeHtml(pretty(body))}</pre>`}</div>${this.rawTrace(trace)}`;
    }
    return `<pre>${escapeHtml(pretty(trace.data))}</pre>`;
  }

  private renderModelResponse(trace: LogTrace, data: Record<string, unknown>): string {
    const body = recordFromJson(data.body) ?? data;
    const chunks = Array.isArray(body.chunks) ? body.chunks : [];
    const choices = chunks.length
      ? chunks.flatMap((chunk) => {
        const rows = asRecord(chunk)?.choices;
        return Array.isArray(rows) ? rows : [];
      })
      : Array.isArray(body.choices) ? body.choices : [];
    const text = choices.map((value) => {
      const choice = asRecord(value);
      return contentText(asRecord(choice?.delta)?.content ?? asRecord(choice?.message)?.content);
    }).join('') || contentText(body.content ?? body.text);
    const finish = choices.map((value) => asRecord(value)?.finish_reason).filter(Boolean).at(-1);
    const explicitCompleted = body.completed ?? data.completed;
    const explicitPartial = body.partial ?? data.partial;
    const state = explicitPartial === true || explicitCompleted === false || finish === 'length'
      ? '部分返回'
      : explicitCompleted === true || finish
        ? '已完成'
        : chunks.length ? '可能不完整：未见结束标记' : '完成状态未记录';
    const usage = asRecord(body.usage) ?? asRecord(data.usage)
      ?? chunks.map((chunk) => asRecord(asRecord(chunk)?.usage)).filter((value) => value !== null).at(-1);
    const usageText = usage ? [
      usage.prompt_tokens != null ? `输入 ${usage.prompt_tokens}` : '',
      usage.completion_tokens != null ? `输出 ${usage.completion_tokens}` : '',
      usage.total_tokens != null ? `合计 ${usage.total_tokens}` : '',
    ].filter(Boolean).join(' · ') : '';
    return `<div class="lw-response-summary"><div class="lw-response-facts"><span class="${state === '已完成' ? 'is-complete' : 'is-partial'}">${escapeHtml(state)}</span>${data.status != null ? `<span>HTTP ${escapeHtml(data.status)}</span>` : ''}${data.seconds != null ? `<span>${escapeHtml(data.seconds)} 秒</span>` : ''}${usageText ? `<span>用量：${escapeHtml(usageText)}</span>` : ''}${finish ? `<span>结束原因：${escapeHtml(finish)}</span>` : ''}</div>${text ? this.readableText('回复正文', text) : '<p class="lw-readable-empty">未从结构化响应中提取到正文，可展开原始记录查看。</p>'}</div>${this.rawTrace(trace, '原始 SSE 与完整响应')}`;
  }

  private readableText(label: string, value: unknown): string {
    const text = contentText(value) || pretty(value);
    return `<div class="lw-readable"><span>${escapeHtml(label)}</span><p>${escapeHtml(text)}</p></div>`;
  }

  private rawTrace(trace: LogTrace, label = '完整原始记录'): string {
    const id = `${trace.id}-raw`;
    return `<details class="lw-raw-trace" data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary>${label}</summary><pre>${escapeHtml(pretty(trace.data))}</pre></details>`;
  }

  private renderScores(selected?: Entry): string {
    const cards = selected ? selected.card ? [selected.card] : [] : this.detail?.encounters ?? [];
    if (!cards.length) return '<div class="lw-list-empty"><span>∅</span><h3>没有接待档案</h3><p>这条记录只有过程事件。</p></div>';
    return `<div class="lw-scores">${cards.slice(0, this.scoreLimit).map((card, index) => {
      const key = `score-${card.session_id ?? index}`;
      return `<article class="lw-score"><div class="lw-score-head"><div><span class="lw-eyebrow">接待 ${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(card.profile_name ?? card.session_id ?? '顾客')}</h3><p>${escapeHtml(card.scenario_title ?? card.scenario_type ?? '')}</p></div><div class="lw-score-value"><strong>${card.total == null ? '—' : escapeHtml(card.total)}</strong><span>${escapeHtml(card.verdict ?? '暂无评分')}</span></div></div>${card.rationale ? `<p class="lw-rationale">${escapeHtml(card.rationale)}</p>` : ''}${this.renderReceipts(card)}${this.renderTranscript(card)}${this.renderActions(card)}${this.renderCardPart(card, 'process', '处理过程', key)}<details data-item="${escapeHtml(key)}-raw" ${this.openItems.has(`${key}-raw`) ? 'open' : ''}><summary>完整评分卡</summary><pre>${escapeHtml(pretty(card))}</pre></details></article>`;
    }).join('')}</div>${cards.length > this.scoreLimit ? `<div class="lw-more"><span>已显示 ${this.scoreLimit} / ${cards.length} 份档案</span><button type="button" data-action="more-scores">再显示 ${Math.min(PAGE_SIZE, cards.length - this.scoreLimit)} 份</button></div>` : ''}`;
  }

  private renderTranscript(card: ServerCard): string {
    const transcript = card.transcript;
    if (!Array.isArray(transcript)) return this.renderCardPart(card, 'transcript', '完整对话', `score-${card.session_id ?? ''}`);
    if (!transcript.length) return '<div class="lw-transcript-empty">没有对话记录</div>';
    return `<section class="lw-transcript" aria-label="完整对话"><h4>完整对话 <span>${transcript.length} 条</span></h4><div class="lw-conversation">${transcript.map((row) => {
      const message = asRecord(row);
      const role = String(message?.from ?? message?.role ?? 'system');
      const text = message?.text ?? message?.content ?? row;
      if (role === 'system') return `<div class="lw-fact"><span>事实记录</span><p>${escapeHtml(pretty(text))}</p></div>`;
      return `<div class="lw-dialogue ${role === 'owner' ? 'is-owner' : 'is-customer'}"><div class="lw-speaker">${escapeHtml(actorName(role))}</div><p>${escapeHtml(pretty(text))}</p></div>`;
    }).join('')}</div></section>`;
  }

  private renderReceipts(card: ServerCard): string {
    const transactions = asRecord(card.transactions);
    if (!transactions) return '';
    const receipts = Array.isArray(transactions.receipts) ? transactions.receipts : [];
    return `<section class="lw-receipts" aria-label="交易回执"><h4>交易回执 <span>${receipts.length} 张</span></h4>${receipts.length ? receipts.map((value) => {
      const receipt = asRecord(value);
      if (!receipt) return `<pre>${escapeHtml(pretty(value))}</pre>`;
      const items = Array.isArray(receipt.items) ? receipt.items : [];
      const paid = receipt.status === 'paid';
      return `<div class="lw-receipt"><div class="lw-receipt-head"><strong>${paid ? '已付款' : escapeHtml(receipt.status ?? '状态未知')}</strong><small>${escapeHtml(receipt.receipt_id ?? '')}</small></div><div class="lw-receipt-items">${items.map((value) => {
        const item = asRecord(value);
        if (!item) return `<div>${escapeHtml(pretty(value))}</div>`;
        return `<div class="lw-receipt-item"><div><b>${escapeHtml(item.name ?? item.sku ?? '商品')}</b><small>${escapeHtml(item.sku ?? '')}${item.offer_id ? ` · ${escapeHtml(item.offer_id)}` : ''}</small></div><span>${escapeHtml(item.qty ?? 1)} × ${money(item.unit_price)}</span><strong>${money(item.total)}</strong></div>`;
      }).join('')}</div><div class="lw-receipt-total"><span>优惠 ${money(receipt.discount)}</span><strong>实付 ${money(receipt.paid)}</strong></div></div>`;
    }).join('') : '<p class="lw-no-receipt">没有已付款回执</p>'}</section>`;
  }

  private renderActions(card: ServerCard): string {
    const actions = Array.isArray(card.actions) ? card.actions : [];
    if (!actions.length) return this.renderCardPart(card, 'actions_taken', '执行动作', `score-${card.session_id ?? ''}`);
    return `<section class="lw-actions" aria-label="执行动作"><h4>执行动作 <span>${actions.length} 条</span></h4><ol>${actions.map((value, index) => {
      const entry = asRecord(value);
      const action = asRecord(entry?.action);
      const result = asRecord(entry?.result);
      const failed = result?.applied === false;
      const label = action?.type ?? action?.name ?? '动作';
      const id = `${card.session_id ?? ''}-action-${index}`;
      return `<li class="${failed ? 'is-failed' : ''}"><div><strong>${escapeHtml(label)}</strong><span>${action?.sku ? escapeHtml(action.sku) : ''}${action?.qty ? ` × ${escapeHtml(action.qty)}` : ''}</span></div><span class="lw-action-state">${failed ? '未执行' : result?.applied === true ? '已执行' : '结果未知'}</span>${failed && result?.reason ? `<p>原因：${escapeHtml(result.reason)}</p>` : ''}<details data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary>查看输入与结果</summary><pre>${escapeHtml(pretty(value))}</pre></details></li>`;
    }).join('')}</ol></section>`;
  }

  private renderCardPart(card: ServerCard, key: string, label: string, prefix: string): string {
    const value = card[key];
    const id = `${prefix}-${key}`;
    return value === undefined || value === null ? '' : `<details data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary>${label}</summary><pre>${escapeHtml(pretty(value))}</pre></details>`;
  }

  private renderEvents(selected?: Entry): string {
    const events = (this.detail?.events ?? []).map((event, index) => ({ event, index })).filter(({ event }) => !selected || event.session_id === selected.id || event.encounter_id === selected.id);
    if (!events.length) return '<div class="lw-list-empty"><span>∅</span><h3>没有匹配的服务事件</h3><p>可切换到全部过程查看整轮事件。</p></div>';
    return `<ol class="lw-events">${events.slice(0, this.eventLimit).map(({ event, index }) => {
      const id = `event-${index}`;
      return `<li><details data-item="${id}" ${this.openItems.has(id) ? 'open' : ''}><summary><span class="lw-event-index">${String(index + 1).padStart(3, '0')}</span><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(timeLabel(event.ts ?? event.timestamp))}</small></summary><pre>${escapeHtml(pretty(event))}</pre></details></li>`;
    }).join('')}</ol>${events.length > this.eventLimit ? `<div class="lw-more"><span>已显示 ${this.eventLimit} / ${events.length} 条</span><button type="button" data-action="more-events">再显示 ${Math.min(PAGE_SIZE, events.length - this.eventLimit)} 条</button></div>` : ''}`;
  }

  private onClick(event: MouseEvent) {
    if ((event.target as HTMLElement).id === 'lw-memory') { this.closeMemory(); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button)) return;
    if (button.dataset.run) { void this.selectRun(button.dataset.run); return; }
    if (button.dataset.encounter) { this.encounterId = button.dataset.encounter; this.traceLimit = PAGE_SIZE; this.eventLimit = PAGE_SIZE; this.renderContent(); return; }
    if (button.dataset.view) { this.view = button.dataset.view as View; this.renderContent(); return; }
    if (button.dataset.copyTrace) {
      const trace = this.detail?.traces.find((item) => item.id === button.dataset.copyTrace);
      if (trace) void this.copy(JSON.stringify(trace, null, 2), button);
      return;
    }
    switch (button.dataset.action) {
      case 'shop': this.onClose(); break;
      case 'memory': this.openMemory(); break;
      case 'close-memory': this.closeMemory(); break;
      case 'refresh': void this.loadRuns(); break;
      case 'more-traces': this.traceLimit += PAGE_SIZE; this.renderContent(true); break;
      case 'more-events': this.eventLimit += PAGE_SIZE; this.renderContent(true); break;
      case 'more-scores': this.scoreLimit += PAGE_SIZE; this.renderContent(true); break;
      case 'export-run': if (this.detail) download(`town-shop-${this.runId}.json`, this.detail); break;
      case 'export-encounter': {
        const entry = this.entries().find((item) => item.id === this.encounterId);
        if (entry && this.detail) download(`town-shop-${this.runId}-${entry.id}.json`, {
          run_id: this.runId,
          encounter: entry.card ?? null,
          traces: this.detail.traces.filter((trace) => trace.encounter_id === entry.id),
          events: this.detail.events.filter((item) => item.session_id === entry.id || item.encounter_id === entry.id),
          coverage: this.detail.coverage,
        });
        break;
      }
      case 'copy-run': void this.copy(this.runId, button); break;
    }
  }

  private onInput(event: Event) {
    if ((event.target as HTMLElement).id !== 'lw-search') return;
    const input = event.target as HTMLInputElement;
    const position = input.selectionStart;
    this.query = input.value;
    this.traceLimit = PAGE_SIZE;
    this.renderContent(true);
    const next = this.root.querySelector<HTMLInputElement>('#lw-search');
    next?.focus();
    next?.setSelectionRange(position, position);
  }

  private onChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (target.id === 'lw-kind') this.kind = target.value;
    else if (target.id === 'lw-actor') this.actor = target.value;
    else return;
    this.traceLimit = PAGE_SIZE;
    this.renderContent(true);
  }

  private openMemory() {
    const memory = this.root.querySelector<HTMLElement>('#lw-memory');
    if (!memory) return;
    memory.hidden = false;
    this.root.querySelector<HTMLButtonElement>('.lw-memory-close')?.focus();
  }

  private closeMemory() {
    const memory = this.root.querySelector<HTMLElement>('#lw-memory');
    if (memory) memory.hidden = true;
  }

  private onKeydown(event: KeyboardEvent) {
    if (!this.active) return;
    const memory = this.root.querySelector<HTMLElement>('#lw-memory');
    if (memory && !memory.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); this.closeMemory(); }
      return;
    }
    const target = event.target as HTMLElement;
    const typing = target.matches('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !typing) {
      event.preventDefault();
      this.root.querySelector<HTMLInputElement>('#lw-search')?.focus();
    } else if (event.key === 'Escape' && typing && target.id === 'lw-search') {
      this.query = '';
      this.renderContent(true);
      this.root.querySelector<HTMLInputElement>('#lw-search')?.blur();
    }
  }

  private async copy(value: string, button: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(value);
      const old = button.textContent;
      button.textContent = '已复制';
      setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1500);
    } catch {
      button.textContent = '复制失败';
    }
  }
}
