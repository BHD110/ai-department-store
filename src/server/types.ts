/** 服务端资料与事件的形状（server/data/*.json、/api/state、/api/events）。 */

export interface ServerSku {
  id: string;
  name: string;
  cat: string;
  price: number;
  cost: number;
  fit?: string[];
  ret?: string;
  age_gate?: boolean;
}

export interface ServerCategory {
  id: string;
  name: string;
  color: string;
  row?: number;
}

export interface ServerCatalog {
  store_name: string;
  categories: ServerCategory[];
  skus: ServerSku[];
  policy?: Record<string, unknown>;
  consts?: Record<string, number>;
}

export interface ServerProfile {
  id: string;
  name: string;
  age?: number;
  job?: string;
  look?: { shirt?: string; pants?: string; skin?: string; hair?: string; height?: number; bag?: string };
  traits?: string[];
  tone?: string;
  catchphrase?: string;
  budget?: number;
  patience?: number;
  pub?: { wants?: string[]; avers?: string[]; surface?: string; observable?: string };
  hidden?: {
    hidden_need?: string;
    reveals_when?: string;
    ideal_signal?: string;
    fail_signal?: string;
    emotion_on_hit?: string;
  };
}

export interface ServerScenario {
  id: string;
  type?: string;
  title?: string;
  profiles?: string[];
  skus?: string[];
  opening?: string[];
  hidden_line?: string;
  need_summary?: string;
  ideal?: string[];
  must_not?: string[];
  probe_keywords?: string[];
  [key: string]: unknown;
}

export interface ServerCard {
  kind?: string;
  source?: string;
  day?: number;
  slot?: number;
  session_id?: string;
  profile_id?: string;
  profile_name?: string;
  scenario_id?: string;
  scenario_title?: string;
  scenario_type?: string;
  total?: number | null;
  verdict?: string | null;
  reputation_delta?: number | null;
  cash_delta?: number | null;
  hidden_need_hit?: boolean;
  lost_sale?: boolean;
  walked_out?: boolean;
  forced_leave?: boolean;
  flags?: string[];
  rationale?: string;
  best_line?: string;
  missed_line?: string;
  exit?: string | null;
  exit_reason?: string | null;
  turns?: number;
  stock_changes?: unknown;
  owner_error?: string;
  judge_error?: string;
  [key: string]: unknown;
}

export interface ServerQueueItem {
  profileId: string;
  scenarioId: string;
  sessionId: string;
  arrivedAt: number;
  index?: number;
}

export interface ServerToday {
  revenue?: number;
  cogs?: number;
  refunds?: number;
  fixedCost?: number;
  restock?: number;
  profit?: number;
  served?: number;
  lost?: number;
  hiddenHits?: number;
  turns?: number;
  scores?: ServerCard[];
  [key: string]: unknown;
}

export interface ServerState {
  day: number;
  cash: number;
  reputation: number;
  energy?: number;
  status?: string;
  stock: Record<string, number>;
  stock_units?: number;
  empty_skus?: number;
  inventory_value?: number;
  today: ServerToday;
  lifetime?: Record<string, number>;
  queue: ServerQueueItem[];
  qidx: number;
  seed?: number;
  reserved?: unknown[];
}

export interface ServerDayReport {
  kind?: string;
  day?: number;
  revenue?: number;
  cogs?: number;
  refunds?: number;
  fixed?: number;
  restock?: number;
  profit?: number;
  served?: number;
  lost?: number;
  repStart?: number;
  repEnd?: number;
  repDelta?: number;
  hiddenHits?: number;
  turns?: number;
  cashAfter?: number;
  audit?: string[];
  [key: string]: unknown;
}

export interface StatePayload {
  ok?: boolean;
  state?: ServerState;
  settings?: Record<string, unknown>;
  running?: boolean;
  busy?: boolean;
  paused?: boolean;
  note?: string;
  progress?: { done: number; total: number };
  run_id?: string;
  settings_error?: string;
  last_error?: string;
}

export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}
