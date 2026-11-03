import type { LogRunDetail, LogRunSummary, LogTrace, ServerCard } from '../server/types';
import { ServerClient } from '../server/client';
import { dict, getLocale, isEn, setLocale, t } from '../i18n';
import '../logs.css';

type View = 'traces' | 'score' | 'events';
type Entry = { id: string; name: string; card?: ServerCard; count: number };

const PAGE_SIZE = 100;

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] ?? char);

function pretty(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

const localeTag = () => (isEn() ? 'en-US' : 'zh-CN');

function dateLabel(value: unknown): string {
  if (!value) return t('lw.dateUnknown');
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(localeTag(), { hour12: false });
}

function timeLabel(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString(localeTag(), { hour12: false });
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
  return dict().ACTOR[String(value ?? '')] ?? String(value ?? '');
}

function kindName(value: string): string {
  return dict().LOG_KIND[value] ?? value;
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
    const langLabel = getLocale() === 'en' ? '中文' : 'EN';
    this.root.innerHTML = `
      <a class="lw-skip" href="#lw-content">${t('lw.skip')}</a>
      <header class="lw-header">
        <div class="lw-brand"><span class="lw-brand-mark" aria-hidden="true">▦</span><div><b>${t('lw.brand')}</b><small>${t('lw.brandSub')}</small></div></div>
        <nav class="lw-nav" aria-label="${t('lw.navAria')}"><button type="button" data-action="shop">${t('lw.navShop')}</button><span class="lw-nav-active" aria-current="page">${t('lw.navActive')}</span><button type="button" data-action="memory">${t('lw.navMemory')}</button><button type="button" data-action="lang" class="lw-lang" title="${t('lw.langTitle')}">${langLabel}</button></nav>
        <div id="lw-status" class="lw-status" aria-live="polite"></div>
      </header>
      <div class="lw-layout">
        <aside class="lw-sidebar" aria-label="${t('lw.sideAria')}"><div class="lw-side-head"><div><span class="lw-eyebrow">${t('lw.eyebrowRuns')}</span><h2>${t('lw.allRuns')}</h2></div><button type="button" class="lw-icon-btn" data-action="refresh" title="${t('lw.refreshTitle')}" aria-label="${t('lw.refreshTitle')}">↻</button></div><div id="lw-runs" class="lw-runs"></div></aside>
        <main id="lw-content" class="lw-main" tabindex="-1"></main>
      </div>
      <div id="lw-memory" class="lw-memory" hidden role="dialog" aria-modal="true" aria-labelledby="lw-memory-title">
        <section class="lw-memory-sheet">
          <header class="lw-memory-head">
            <div><span class="lw-memory-kicker">Memory</span><h2 id="lw-memory-title">${t('mem.name')}</h2></div>
            <button type="button" class="lw-memory-close" data-action="close-memory" aria-label="${t('mem.close')}">×</button>
          </header>
          <div class="lw-memory-list">
            <article class="lw-memory-note is-goal"><span class="lw-memory-type">${t('mem.typeGoal')}</span><p>${t('mem.goalNote')}</p></article>
            <article class="lw-memory-note is-access"><span class="lw-memory-type">${t('mem.typeAccess')}</span><p>${t('mem.accessNote')}</p></article>
            <article class="lw-memory-note is-preference"><span class="lw-memory-type">${t('mem.typePreference')}</span><p>${t('mem.prefNote')}</p></article>
            <article class="lw-memory-note is-schedule"><span class="lw-memory-type">${t('mem.typeSchedule')}</span><p>${t('mem.scheduleNote')}</p></article>
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
      ? `<span class="lw-status-error" title="${escapeHtml(this.error)}">${t('lw.connFailed')}</span><button type="button" data-action="refresh">${t('lw.retry')}</button>`
      : `<span class="lw-live-dot"></span>${this.loadingRuns || this.loadingDetail ? t('lw.loading') : t('lw.polling')}`;
  }

  private renderRuns() {
    const target = this.root.querySelector('#lw-runs');
    if (!target) return;
    if (this.loadingRuns && !this.runs.length) {
      target.innerHTML = '<div class="lw-skeleton"></div><div class="lw-skeleton"></div><div class="lw-skeleton"></div>';
      return;
    }
    if (!this.runs.length) {
      target.innerHTML = `<div class="lw-side-empty">${this.error ? t('lw.runsUnavailable') : t('lw.noRuns')}</div>`;
      return;
    }
    target.innerHTML = this.runs.map((run, index) => `
      <button type="button" class="lw-run ${run.run_id === this.runId ? 'is-active' : ''}" data-run="${escapeHtml(run.run_id)}" aria-current="${run.run_id === this.runId ? 'true' : 'false'}">
        <span class="lw-run-top"><strong title="${escapeHtml(run.run_id)}">${escapeHtml(run.run_id)}</strong><span>${index === 0 ? t('lw.latest') : ''}</span></span>
        <time>${escapeHtml(dateLabel(run.started))}</time><span class="lw-run-bottom">${t('lw.encounters', { n: run.encounters })} <span aria-hidden="true">↗</span></span>
        <span class="lw-run-state">${run.encounters === 0 && run.trace_count === 0 ? t('lw.pending') : run.trace_count === 0 ? t('lw.noTraces') : t('lw.traceCount', { n: run.trace_count })}</span>
      </button>`).join('');
  }

  private entries(): Entry[] {
    if (!this.detail) return [];
    const traces = this.detail.traces ?? [];
    const cards = this.detail.encounters ?? [];
    const entries: Entry[] = cards.map((card, index) => ({
      id: String(card.session_id ?? `encounter-${index + 1}`),
      name: String(card.profile_name ?? t('lw.customerN', { n: index + 1 })),
      card,
      count: 0,
    }));
    for (const trace of traces) {
      if (!trace.encounter_id) continue;
      let entry = entries.find((item) => item.id === trace.encounter_id);
      if (!entry) {
        entry = { id: trace.encounter_id, name: t('lw.encounterN', { n: entries.length + 1 }), count: 0 };
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
        ? `<div class="lw-empty-state"><div class="lw-loading-bar"></div><h1>${t('lw.loadingTitle')}</h1><p>${t('lw.loadingSub')}</p></div>`
        : `<div class="lw-empty-state"><span class="lw-empty-mark">▤</span><h1>${this.error ? t('lw.errTitle') : t('lw.emptyTitle')}</h1><p>${this.error ? escapeHtml(this.error) : t('lw.emptySub')}</p><div class="lw-empty-actions">${this.error ? `<button type="button" data-action="refresh">${t('lw.reread')}</button>` : `<button type="button" data-action="shop">${t('lw.backShop')}</button>`}<button type="button" class="lw-solid-btn" data-action="memory">${t('lw.viewMemory')}</button></div></div>`;
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
      ${this.error ? `<div class="lw-error-banner" role="alert"><span>${t('lw.updateFailed')}：${escapeHtml(this.error)}</span><button type="button" data-action="refresh">${t('lw.retry')}</button></div>` : ''}
      <div class="lw-overview">
        <div><span class="lw-eyebrow">${t('lw.runRecord')} / ${run?.encounters === 0 && run.trace_count === 0 ? t('lw.pending') : t('lw.overviewSaved')}</span><h1>${escapeHtml(run ? dateLabel(run.started) : this.runId)}</h1><p class="lw-run-id" title="${escapeHtml(this.runId)}">${escapeHtml(this.runId)}</p></div>
        <div class="lw-overview-actions"><button type="button" data-action="copy-run">${t('lw.copyRun')}</button><button type="button" class="lw-solid-btn" data-action="export-run">${t('lw.exportRun')}</button></div>
      </div>
      <div class="lw-metrics" aria-label="${t('lw.runOverview')}"><div><strong>${entries.length}</strong><span>${t('lw.metricVisits')}</span></div><div><strong>${this.detail.traces?.length ?? 0}</strong><span>${t('lw.metricTraces')}</span></div><div><strong>${this.detail.events?.length ?? 0}</strong><span>${t('lw.metricEvents')}</span></div><div class="lw-coverage"><span>${t('lw.coverage')}</span><strong>${escapeHtml(coverageNote ?? t('lw.coverageDefault'))}</strong></div></div>
      <section class="lw-browser" aria-label="${t('lw.browserAria')}"><div class="lw-section-head"><div><span class="lw-eyebrow">${t('lw.eyebrowIndex')}</span><h2>${t('lw.browserTitle')}</h2></div><span>${t('lw.encounters', { n: entries.length })}</span></div>
        <div class="lw-encounters" role="group" aria-label="${t('lw.selectAria')}"><button type="button" class="lw-encounter ${this.encounterId === 'all' ? 'is-active' : ''}" data-encounter="all"><b>${t('lw.groupAll')}</b><small>${t('lw.traceN', { n: this.detail.traces?.length ?? 0 })}</small></button>${entries.map((entry, index) => `<button type="button" class="lw-encounter ${this.encounterId === entry.id ? 'is-active' : ''}" data-encounter="${escapeHtml(entry.id)}"><span class="lw-encounter-index">${String(index + 1).padStart(2, '0')}</span><b>${escapeHtml(entry.name)}</b><small>${t('lw.traceN', { n: entry.count })}</small></button>`).join('')}</div>
      </section>
      <div class="lw-content-head"><div><span class="lw-eyebrow">${selected ? escapeHtml(selected.name) : t('lw.wholeRun')}</span><h2>${this.view === 'traces' ? t('lw.tabTracesTitle') : this.view === 'score' ? t('lw.tabScoreTitle') : t('lw.tabEventsTitle')}</h2></div><div class="lw-content-tools">${selected ? `<button type="button" data-action="export-encounter">${t('lw.exportEncounter')}</button>` : ''}<div class="lw-tabs" role="tablist" aria-label="${t('lw.navActive')}"><button type="button" role="tab" aria-selected="${this.view === 'traces'}" data-view="traces">${t('lw.tabTraces')}</button><button type="button" role="tab" aria-selected="${this.view === 'score'}" data-view="score">${t('lw.tabScore')}</button><button type="button" role="tab" aria-selected="${this.view === 'events'}" data-view="events">${t('lw.tabEvents')}</button></div></div></div>
      ${this.view === 'traces' ? `<div class="lw-filters"><label class="lw-search"><span aria-hidden="true">⌕</span><input id="lw-search" type="search" value="${escapeHtml(this.query)}" placeholder="${t('lw.searchPlaceholder')}" aria-label="${t('lw.searchAria')}"></label><label><span>${t('lw.filterKind')}</span><select id="lw-kind"><option value="all">${t('lw.allKinds')}</option>${kinds.map((kind) => `<option value="${escapeHtml(kind)}" ${this.kind === kind ? 'selected' : ''}>${escapeHtml(kindName(kind))}</option>`).join('')}</select></label><label><span>${t('lw.filterActor')}</span><select id="lw-actor"><option value="all">${t('lw.allActors')}</option>${actors.map((actor) => `<option value="${escapeHtml(actor)}" ${this.actor === actor ? 'selected' : ''}>${escapeHtml(actorName(actor))}</option>`).join('')}</select></label><span class="lw-result-count">${t('lw.resultCount', { n: traces.length })}</span></div>${this.renderTraces(traces)}` : this.view === 'score' ? this.renderScores(selected) : this.renderEvents(selected)}
      <details class="lw-coverage-details" data-item="coverage" ${this.openItems.has('coverage') ? 'open' : ''}><summary>${t('lw.coverageDetails')}</summary><pre>${escapeHtml(pretty(this.detail.coverage ?? {}))}</pre></details>`;
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
    if (!traces.length && this.kind === 'reasoning') return `<div class="lw-list-empty"><h3>${t('lw.noReasoningTitle')}</h3><p>${escapeHtml(this.detail?.coverage.reasoning_note ?? t('lw.noReasoningDefault'))}</p></div>`;
    if (!traces.length) return `<div class="lw-list-empty"><span>∅</span><h3>${this.query || this.kind !== 'all' || this.actor !== 'all' ? t('lw.noMatchTitle') : t('lw.noTracesTitle')}</h3><p>${this.query || this.kind !== 'all' || this.actor !== 'all' ? t('lw.noMatchHint') : t('lw.noTracesHint')}</p></div>`;
    return `<ol class="lw-timeline">${traces.slice(0, this.traceLimit).map((trace, index) => {
      const id = trace.id || `trace-${index}`;
      const title = trace.title || kindName(trace.kind);
      const turnLabel = trace.turn == null ? '' : `${t('lw.turnN', { n: trace.turn })} · `;
      return `<li class="lw-trace lw-trace-${trace.kind === 'error' ? 'error' : trace.kind.startsWith('tool.') ? 'tool' : trace.kind.startsWith('model.') ? 'model' : 'default'}"><div class="lw-trace-marker" aria-hidden="true"></div><details data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary><span class="lw-trace-kind">${escapeHtml(kindName(trace.kind))}</span><span class="lw-trace-title">${escapeHtml(title)}</span><span class="lw-trace-meta">${turnLabel}${trace.actor || trace.phase ? escapeHtml(actorName(trace.actor ?? trace.phase)) : ''}${trace.ts ? ` · ${escapeHtml(timeLabel(trace.ts))}` : ''}</span><span class="lw-chevron" aria-hidden="true">⌄</span></summary><div class="lw-trace-body">${this.renderTraceData(trace)}<div class="lw-item-actions"><button type="button" data-copy-trace="${escapeHtml(id)}">${t('lw.copyTrace')}</button></div></div></details></li>`;
    }).join('')}</ol>${traces.length > this.traceLimit ? `<div class="lw-more"><span>${t('lw.showing', { a: this.traceLimit, b: traces.length })}</span><button type="button" data-action="more-traces">${t('lw.moreTraces', { n: Math.min(PAGE_SIZE, traces.length - this.traceLimit) })}</button></div>` : ''}`;
  }

  private renderTraceData(trace: LogTrace): string {
    const data = asRecord(trace.data);
    if (trace.kind === 'prompt' && Array.isArray(data?.sections)) {
      return `<div class="lw-sections">${data.sections.map((section, index) => {
        const item = asRecord(section);
        const key = `${trace.id}-section-${index}`;
        return `<details data-item="${escapeHtml(key)}" ${this.openItems.has(key) ? 'open' : ''}><summary><span>${escapeHtml(item?.label ?? item?.kind ?? t('lw.sectionN', { n: index + 1 }))}</span><small>${escapeHtml(item?.kind ?? '')}</small></summary><pre>${escapeHtml(pretty(item?.content ?? section))}</pre></details>`;
      }).join('')}</div>`;
    }
    if (trace.kind === 'model.request' && data) {
      const body = asRecord(data.body) ?? data;
      const { messages, tools, ...parameters } = body;
      const metadata = body === data ? null : Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'body'));
      const requestKey = `${trace.id}-body`;
      return `<div class="lw-sections">${metadata && Object.keys(metadata).length ? `<details data-item="${escapeHtml(trace.id)}-meta" ${this.openItems.has(`${trace.id}-meta`) ? 'open' : ''}><summary>${t('lw.callInfo')}</summary><pre>${escapeHtml(pretty(metadata))}</pre></details>` : ''}<details data-item="${escapeHtml(requestKey)}" ${this.openItems.has(requestKey) ? 'open' : ''}><summary>${t('lw.reqParams')} <small>${t('lw.reqParamsSub')}</small></summary><pre>${escapeHtml(pretty(parameters))}</pre></details>${Array.isArray(messages) ? messages.map((message, index) => {
        const role = asRecord(message)?.role;
        const key = `${trace.id}-message-${index}`;
        const label = role === 'system' ? t('lw.msgSystem') : role === 'user' ? t('lw.msgUser') : role === 'assistant' ? t('lw.msgAssistant') : t('lw.msgN', { n: index + 1 });
        return `<details data-item="${escapeHtml(key)}" ${this.openItems.has(key) ? 'open' : ''}><summary>${label} ${index + 1}<small>${escapeHtml(role ?? '')}</small></summary><pre>${escapeHtml(pretty(asRecord(message)?.content ?? message))}</pre></details>`;
      }).join('') : ''}${Array.isArray(tools) ? tools.map((tool, index) => {
        const definition = asRecord(tool);
        const key = `${trace.id}-tool-${index}`;
        const rawName = asRecord(definition?.function)?.name ?? definition?.name;
        const name = rawName != null ? String(rawName) : t('lw.toolDefN', { n: index + 1 });
        return `<details data-item="${escapeHtml(key)}" ${this.openItems.has(key) ? 'open' : ''}><summary>${t('lw.toolDef', { name })}<small>${index + 1} / ${tools.length}</small></summary><pre>${escapeHtml(pretty(tool))}</pre></details>`;
      }).join('') : tools !== undefined ? `<details data-item="${escapeHtml(trace.id)}-tools" ${this.openItems.has(`${trace.id}-tools`) ? 'open' : ''}><summary>${t('lw.toolDefs')}</summary><pre>${escapeHtml(pretty(tools))}</pre></details>` : ''}</div>`;
    }
    if (trace.kind === 'model.response' && data) return this.renderModelResponse(trace, data);
    if (trace.kind === 'actor.response' && data) {
      const raw = asRecord(data.raw);
      const say = data.say ?? raw?.say ?? data.text ?? data.content;
      return `${say == null ? `<p class="lw-readable-empty">${t('lw.noReplyText')}</p>` : this.readableText(t('lw.actorReply'), say)}${this.rawTrace(trace)}`;
    }
    if (trace.kind === 'reasoning' && data) {
      const thought = data.text ?? data.content;
      return `${thought == null ? `<p class="lw-readable-empty">${t('lw.noThought')}</p>` : this.readableText(t('lw.modelThought'), thought)}${this.rawTrace(trace)}`;
    }
    if ((trace.kind === 'tool.call' || trace.kind === 'tool.result') && data) {
      const isCall = trace.kind === 'tool.call';
      const body = isCall ? data.input ?? data.arguments ?? data.args ?? data.params : data.result ?? data.output ?? data.response;
      return `<div class="lw-readable"><span>${escapeHtml(data.title ?? trace.title ?? kindName(isCall ? 'tool.call' : 'tool.result'))}</span>${body == null ? `<p>${t('lw.noStructured')}</p>` : `<pre>${escapeHtml(pretty(body))}</pre>`}</div>${this.rawTrace(trace)}`;
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
      ? t('lw.partial')
      : explicitCompleted === true || finish
        ? t('lw.completed')
        : chunks.length ? t('lw.maybeIncomplete') : t('lw.unknownState');
    const usage = asRecord(body.usage) ?? asRecord(data.usage)
      ?? chunks.map((chunk) => asRecord(asRecord(chunk)?.usage)).filter((value) => value !== null).at(-1);
    const usageText = usage ? [
      usage.prompt_tokens != null ? t('lw.tokensIn', { n: String(usage.prompt_tokens) }) : '',
      usage.completion_tokens != null ? t('lw.tokensOut', { n: String(usage.completion_tokens) }) : '',
      usage.total_tokens != null ? t('lw.tokensTotal', { n: String(usage.total_tokens) }) : '',
    ].filter(Boolean).join(' · ') : '';
    return `<div class="lw-response-summary"><div class="lw-response-facts"><span class="${state === t('lw.completed') ? 'is-complete' : 'is-partial'}">${escapeHtml(state)}</span>${data.status != null ? `<span>HTTP ${escapeHtml(data.status)}</span>` : ''}${data.seconds != null ? `<span>${t('lw.seconds', { v: String(data.seconds) })}</span>` : ''}${usageText ? `<span>${t('lw.usage', { v: usageText })}</span>` : ''}${finish ? `<span>${t('lw.finishReason', { v: String(finish) })}</span>` : ''}</div>${text ? this.readableText(t('lw.replyBody'), text) : `<p class="lw-readable-empty">${t('lw.noBody')}</p>`}</div>${this.rawTrace(trace, t('lw.rawSse'))}`;
  }

  private readableText(label: string, value: unknown): string {
    const text = contentText(value) || pretty(value);
    return `<div class="lw-readable"><span>${escapeHtml(label)}</span><p>${escapeHtml(text)}</p></div>`;
  }

  private rawTrace(trace: LogTrace, label = t('lw.rawFull')): string {
    const id = `${trace.id}-raw`;
    return `<details class="lw-raw-trace" data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary>${label}</summary><pre>${escapeHtml(pretty(trace.data))}</pre></details>`;
  }

  private renderScores(selected?: Entry): string {
    const cards = selected ? selected.card ? [selected.card] : [] : this.detail?.encounters ?? [];
    if (!cards.length) return `<div class="lw-list-empty"><span>∅</span><h3>${t('lw.noScoreFiles')}</h3><p>${t('lw.noScoreFilesSub')}</p></div>`;
    return `<div class="lw-scores">${cards.slice(0, this.scoreLimit).map((card, index) => {
      const key = `score-${card.session_id ?? index}`;
      return `<article class="lw-score"><div class="lw-score-head"><div><span class="lw-eyebrow">${t('lw.encounterN', { n: String(index + 1).padStart(2, '0') })}</span><h3>${escapeHtml(card.profile_name ?? card.session_id ?? t('state.customer'))}</h3><p>${escapeHtml(card.scenario_title ?? card.scenario_type ?? '')}</p></div><div class="lw-score-value"><strong>${card.total == null ? '—' : escapeHtml(card.total)}</strong><span>${escapeHtml(card.verdict ?? t('lw.noVerdict'))}</span></div></div>${card.rationale ? `<p class="lw-rationale">${escapeHtml(card.rationale)}</p>` : ''}${this.renderReceipts(card)}${this.renderTranscript(card)}${this.renderActions(card)}${this.renderCardPart(card, 'process', t('lw.cardProcess'), key)}<details data-item="${escapeHtml(key)}-raw" ${this.openItems.has(`${key}-raw`) ? 'open' : ''}><summary>${t('lw.fullCard')}</summary><pre>${escapeHtml(pretty(card))}</pre></details></article>`;
    }).join('')}</div>${cards.length > this.scoreLimit ? `<div class="lw-more"><span>${t('lw.showingFiles', { a: this.scoreLimit, b: cards.length })}</span><button type="button" data-action="more-scores">${t('lw.moreFiles', { n: Math.min(PAGE_SIZE, cards.length - this.scoreLimit) })}</button></div>` : ''}`;
  }

  private renderTranscript(card: ServerCard): string {
    const transcript = card.transcript;
    if (!Array.isArray(transcript)) return this.renderCardPart(card, 'transcript', t('lw.fullDialogue'), `score-${card.session_id ?? ''}`);
    if (!transcript.length) return `<div class="lw-transcript-empty">${t('lw.noDialogue')}</div>`;
    return `<section class="lw-transcript" aria-label="${t('lw.fullDialogue')}"><h4>${t('lw.fullDialogue')} <span>${t('lw.traceN', { n: transcript.length })}</span></h4><div class="lw-conversation">${transcript.map((row) => {
      const message = asRecord(row);
      const role = String(message?.from ?? message?.role ?? 'system');
      const text = message?.text ?? message?.content ?? row;
      if (role === 'system') return `<div class="lw-fact"><span>${t('lw.factRecord')}</span><p>${escapeHtml(pretty(text))}</p></div>`;
      return `<div class="lw-dialogue ${role === 'owner' ? 'is-owner' : 'is-customer'}"><div class="lw-speaker">${escapeHtml(actorName(role))}</div><p>${escapeHtml(pretty(text))}</p></div>`;
    }).join('')}</div></section>`;
  }

  private renderReceipts(card: ServerCard): string {
    const transactions = asRecord(card.transactions);
    if (!transactions) return '';
    const receipts = Array.isArray(transactions.receipts) ? transactions.receipts : [];
    return `<section class="lw-receipts" aria-label="${t('lw.receipts')}"><h4>${t('lw.receipts')} <span>${t('lw.receiptsN', { n: receipts.length })}</span></h4>${receipts.length ? receipts.map((value) => {
      const receipt = asRecord(value);
      if (!receipt) return `<pre>${escapeHtml(pretty(value))}</pre>`;
      const items = Array.isArray(receipt.items) ? receipt.items : [];
      const paid = receipt.status === 'paid';
      return `<div class="lw-receipt"><div class="lw-receipt-head"><strong>${paid ? t('lw.paid') : escapeHtml(receipt.status ?? t('lw.statusUnknown'))}</strong><small>${escapeHtml(receipt.receipt_id ?? '')}</small></div><div class="lw-receipt-items">${items.map((value) => {
        const item = asRecord(value);
        if (!item) return `<div>${escapeHtml(pretty(value))}</div>`;
        return `<div class="lw-receipt-item"><div><b>${escapeHtml(item.name ?? item.sku ?? t('lw.product'))}</b><small>${escapeHtml(item.sku ?? '')}${item.offer_id ? ` · ${escapeHtml(item.offer_id)}` : ''}</small></div><span>${escapeHtml(item.qty ?? 1)} × ${money(item.unit_price)}</span><strong>${money(item.total)}</strong></div>`;
      }).join('')}</div><div class="lw-receipt-total"><span>${t('lw.discountLine', { v: money(receipt.discount) })}</span><strong>${t('lw.paidLine', { v: money(receipt.paid) })}</strong></div></div>`;
    }).join('') : `<p class="lw-no-receipt">${t('lw.noPaidReceipt')}</p>`}</section>`;
  }

  private renderActions(card: ServerCard): string {
    const actions = Array.isArray(card.actions) ? card.actions : [];
    if (!actions.length) return this.renderCardPart(card, 'actions_taken', t('lw.actions'), `score-${card.session_id ?? ''}`);
    return `<section class="lw-actions" aria-label="${t('lw.actions')}"><h4>${t('lw.actions')} <span>${t('lw.traceN', { n: actions.length })}</span></h4><ol>${actions.map((value, index) => {
      const entry = asRecord(value);
      const action = asRecord(entry?.action);
      const result = asRecord(entry?.result);
      const failed = result?.applied === false;
      const label = action?.type ?? action?.name ?? t('lw.action');
      const id = `${card.session_id ?? ''}-action-${index}`;
      return `<li class="${failed ? 'is-failed' : ''}"><div><strong>${escapeHtml(label)}</strong><span>${action?.sku ? escapeHtml(action.sku) : ''}${action?.qty ? ` × ${escapeHtml(action.qty)}` : ''}</span></div><span class="lw-action-state">${failed ? t('lw.notApplied') : result?.applied === true ? t('lw.applied') : t('lw.resultUnknown')}</span>${failed && result?.reason ? `<p>${t('lw.reason', { v: escapeHtml(result.reason) })}</p>` : ''}<details data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary>${t('lw.viewInOut')}</summary><pre>${escapeHtml(pretty(value))}</pre></details></li>`;
    }).join('')}</ol></section>`;
  }

  private renderCardPart(card: ServerCard, key: string, label: string, prefix: string): string {
    const value = card[key];
    const id = `${prefix}-${key}`;
    return value === undefined || value === null ? '' : `<details data-item="${escapeHtml(id)}" ${this.openItems.has(id) ? 'open' : ''}><summary>${label}</summary><pre>${escapeHtml(pretty(value))}</pre></details>`;
  }

  private renderEvents(selected?: Entry): string {
    const events = (this.detail?.events ?? []).map((event, index) => ({ event, index })).filter(({ event }) => !selected || event.session_id === selected.id || event.encounter_id === selected.id);
    if (!events.length) return `<div class="lw-list-empty"><span>∅</span><h3>${t('lw.noEvents')}</h3><p>${t('lw.noEventsSub')}</p></div>`;
    return `<ol class="lw-events">${events.slice(0, this.eventLimit).map(({ event, index }) => {
      const id = `event-${index}`;
      return `<li><details data-item="${id}" ${this.openItems.has(id) ? 'open' : ''}><summary><span class="lw-event-index">${String(index + 1).padStart(3, '0')}</span><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(timeLabel(event.ts ?? event.timestamp))}</small></summary><pre>${escapeHtml(pretty(event))}</pre></details></li>`;
    }).join('')}</ol>${events.length > this.eventLimit ? `<div class="lw-more"><span>${t('lw.showing', { a: this.eventLimit, b: events.length })}</span><button type="button" data-action="more-events">${t('lw.moreTraces', { n: Math.min(PAGE_SIZE, events.length - this.eventLimit) })}</button></div>` : ''}`;
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
      case 'lang': setLocale(getLocale() === 'en' ? 'zh' : 'en'); break;
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
      button.textContent = t('lw.copied');
      setTimeout(() => { if (button.isConnected) button.textContent = old; }, 1500);
    } catch {
      button.textContent = t('lw.copyFailed');
    }
  }
}
