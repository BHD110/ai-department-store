# 后端接口约定

## 2026-11-03：当前 v2 交易与日志接口

当前页面默认使用 `/api/v2`。本节是新增契约；下面原有内容仍包含旧版本接口。

- `GET /api/v2/logs/runs`：`{ runs: [{ run_id, started, encounters, trace_count, legacy }] }`。
- `GET /api/v2/logs/{run_id}`：`{ run_id, encounters, traces, events, coverage }`，支持历史记录与正在接待的记录。旧记录的缺失内容不会补造。
- `GET /api/v2/event-history`：`{ run_id, events, last_seq }`。首次加载静默恢复；随后连接事件流补齐间隙。
- `GET /api/v2/events?last=<seq>&run_id=<run_id>`：SSE 重连也接受 `Last-Event-ID`。`stream:ready.last_seq` 是回放水位，不可直接当作已经处理的序号；`subscriber:drop` 后会关闭连接，重新连接补发。
- `transaction:update`：包含本场 `transaction` 快照（`revision/pending/receipts/paid_total/net_paid_total/adjustments/actions/last_outcomes`）。只有 `receipts[].status=paid` 表示已付款。

每条轨迹包含 `id/ts/run_id/encounter_id/turn/phase/actor/kind/title/data`。`kind` 包括 `prompt/model.request/model.response/reasoning/tool.call/tool.result/actor.response/observation/transaction/error`。模型请求可能位于 `data.body`，直接调用模型时也可能位于 `data`；完整原文均保留，凭据脱敏。

`coverage` 给出实际请求、回复、未完成请求和思考条数。没有思考记录并不等于没有思考；只能说明本次接口未返回或旧采集未保存。

交易及验证说明见 [架构改造记录](ARCHITECTURE-20261103.md)。

---

## v1：旧版 daily-store-sim 事件接口

页面默认不自己驱动对话。账本、顾客、Hermes 店主、评委都在 `daily-store-sim` 服务端跑，页面只订阅事件：

| 接口 | 作用 |
|---|---|
| `GET /api/state` | 开局现状：第几天、现金、口碑、库存、队列、今日统计 |
| `GET /api/events` | SSE：`state / day:start / customer:arrive / owner:say / customer:say / action / customer:leave / card / encounter:end / day:end / run:status` |
| `GET /data/catalog.json` | 52 个 SKU（含分类、售价、进价、适用标签） |
| `GET /data/profiles.json` | 14 位顾客档案 |
| `GET /data/scenarios.json` | 25 个场景（含隐藏需求、开场白、评分线索） |
| `POST /api/run/day` | 开门跑完一天 |
| `POST /api/run/one` | 只接待下一位（可带 `slot`） |
| `POST /api/pause` / `POST /api/resume` | 两位顾客之间收摊 / 继续 |
| `POST /api/restock` | 补满货架 |
| `POST /api/next-day` | 开新的一天（今天还没接待过人时是空操作） |

页面的 `ServerClient`（`src/server/client.ts`）和 `LiveDirector`（`src/game/live.ts`）就是这套协议的实现。地址默认同源；也可以在 URL 上加 `?server=http://host:3040` 直连。

服务端没有把密钥下发到页面；`/api/state` 里的设置已经脱敏。

---

## 旧契约：三个无状态 POST（mock / 独立评测用）

下面这段是页面原来的 `SimBackend` 三接口，只在 `?mock=1` 或显式 `?customer= / ?shopkeeper= / ?judge=` 时使用，**不是**当前真模式的路径。

前端只依赖 `SimBackend` 接口（`src/types.ts`），一共三个方法。默认用 `MockBackend`（规则驱动）；接独立评测服务时实现下面三个 HTTP 接口即可。

## 接入方式（URL 参数）

| 参数 | 作用 |
|---|---|
| `?api=http://host:8000` | 顾客、老板、裁判三侧全部走 HTTP |
| `?shopkeeper=http://host:8000` | 只把老板 AI 换成真实后端（**评测老板模型时最常用**），其余仍用 mock |
| `?customer=...` / `?judge=...` | 单独替换顾客 AI / 裁判 |
| `&token=xxx` | 附加 `Authorization: Bearer xxx` |

各侧可以指向不同服务。HUD 右上角会显示当前每一侧的来源。

## 三个接口

三个接口都是 `POST`，请求体都是**完整的 `Session` 快照**（JSON），后端不需要保存状态。

### `POST /customer/turn` → `CustomerTurn`

顾客 AI 说一句话。`session.messages` 为空时是开场白。

```json
{ "text": "老板，有没有洗碗用的……", "mood": "neutral", "leave": false }
```

- `mood`: `happy | neutral | confused | annoyed | angry`，驱动小人表情和头顶图标
- `leave: true` 表示顾客要走了，本次接待结束（最多 6 轮，超过会强制结束）

提示词建议：`session.profile`（人设、说话风格、预算、特质）+ `session.scenario.hiddenNeed`（只有顾客知道的真实需求）+ `session.history`（以前来过这家店的经历）。

### `POST /shopkeeper/turn` → `ShopkeeperTurn`

老板 AI 回复，并可以对世界执行动作。**老板侧不应读取 `session.scenario`**（那是隐藏需求），只用 `messages`、`shop.inventory`、`history`、`profile` 中的公开信息（名字、年龄、职业）。

```json
{
  "text": "推荐这款无香洗洁精，低敏配方，15.9 元。",
  "actions": [{ "type": "sell", "sku": "C02", "qty": 1, "unitPrice": 15.9 }],
  "thought": "顾客手敏感，避开香味款"
}
```

可用动作：

| type | 字段 | 语义 |
|---|---|---|
| `sell` | sku, qty, unitPrice | 放进结账单。**新一轮出现 sell 会整体替换上一轮的结账单** |
| `discount` | percent, reason | 结账单打折（10 = 九折），同样是替换语义 |
| `refund` | sku, qty, amount | 退款，立即出账 |
| `exchange` | fromSku, toSku, qty | 换货，扣 toSku 库存 |
| `coupon` | amount | 送优惠券，按支出计 |
| `gift` | sku, qty | 赠品，扣库存，按成本计 |
| `preorder` | sku, qty, days | 预订，到货当天按售价入账 |

结账规则：顾客离店时如果需求被满足，或最后情绪是 happy / neutral，结账单就成交；否则视为「把东西放回货架」，结账单作废。退款、券、赠品不受影响。

### `POST /judge` → `Verdict`

接待结束后打分。

```json
{
  "satisfaction": 86,
  "needMet": true,
  "personalized": true,
  "comment": "老板真懂我。",
  "tags": ["需求满足", "照顾细节"]
}
```

- 满意度决定口碑变化：`Δ口碑 = (satisfaction − 60) / 8`
- 口碑越高，下一位顾客来得越快
- mock 裁判的客观判定逻辑在 `src/backend/assess.ts`，只看动作不看嘴上说了什么，真实裁判可以参考

## 数据导出

HUD 的「导出」按钮会下载 JSON：每天的统计、每次来访的评分、所有会话的完整对话和动作，可以直接用于离线评测。
