# 呼叫模型与路由

本页解释 **一通呼叫在 RustPBX 里是什么、怎么被路由、怎么被控制**。这是开发呼叫应用、对接 CRM / 计费前必读的一页。

## 两级 ID：call_id 与 session_id

RustPBX 用两级 ID 关联一通逻辑呼叫的所有通话腿（legs）：

| ID | 定义 | 生命周期 |
|---|---|---|
| `call_id` | 每个 SIP 通话（leg / session）的唯一标识 | 每次新 INVITE（含转接产生）各不相同 |
| `session_id` | 整通逻辑呼叫的根会话 ID | 首 INVITE 的 Call-ID，跨所有子通话腿不变 |

子通话腿包括：IVR / 队列派发的坐席腿、盲转 / 预忙转接产生的新通话、咨询腿等。`session_id == call_id` 表示该通话是根。这与 FreeSWITCH 的 `call_uuid`、Asterisk 的 `linkedid` 是同一模型。完整规则（含 User-to-User 头跨网传递）见 [session_id 关联模型](/guide/session-id)。

## 呼叫的领域对象

| 对象 | 位置 | 说明 |
|---|---|---|
| `Leg` | `src/call/domain/leg.rs` | 一条通话腿：id、状态、端点、坐席 ID、来源腿 |
| `SessionState` | `src/call/domain/state.rs` | 会话状态机：Initializing → Ringing → Active → Ending → Ended |
| `MediaPathMode` | 同上 | 媒体路径：Anchored（锚定）/ Bypass（旁路）/ Adaptive（自适应） |
| `CallCommand` | `src/call/domain/command.rs` | 会话命令枚举（约 40 种） |
| `SipSession` | `src/proxy/proxy_call/sip_session/session.rs` | B2BUA 会话执行体，由 `CallSessionBuilder` 构建 |

会话是**命令驱动**的 —— 一切操作（应答、挂断、桥接、转接、放音、录音、监听、入会议）都表达为一条 `CallCommand`，由 `SipSession` 状态机消费。媒体桥接使用 `rustpbx-media` 的 `MediaBridge`。

## 入局呼叫的路由决策

```mermaid
graph LR
    A[INVITE 到达] --> B{配置了 http_router?}
    B -->|是| C[POST 到你的 Webhook]
    C --> D{返回的 action}
    D -->|forward| E[按 targets 发起呼叫腿]
    D -->|reject/abort| F[按 status 拒绝]
    D -->|spam| G[标记垃圾呼叫 + 403]
    D -->|not_handled / 上游失败| H[回落静态拨号计划]
    B -->|否| H[静态拨号计划 [routes]]
```

### HTTP Router 契约

配置 `[proxy].http_router`（`url`、`headers`、`timeout_ms`、`fallback_to_static`）后，每个 INVITE 会 POST 到你的服务。

**请求体**（INVITE 原样快照）：

```json
{
  "call_id": "abc-123",
  "session_id": "abc-123",
  "from": "sip:+861390000@trunk",
  "to": "sip:400800",
  "direction": "Inbound",
  "method": "INVITE",
  "uri": "sip:400800@pbx",
  "headers": { "...": "..." },
  "source_addr": "203.0.113.5:5060"
}
```

**响应体**（`action` 必填，其余按需）：

```json
{
  "action": "forward",
  "targets": ["sip:1001@internal"],
  "strategy": "sequential",
  "record": true,
  "timeout": 30,
  "max_ring_time": 60,
  "caller": "400800",
  "headers": { "X-Tenant": "acme" }
}
```

| 字段 | 说明 |
|---|---|
| `action` | `forward` / `reject` / `abort` / `spam` / `not_handled` |
| `targets` | 转发目标，字符串或 `{uri, retry_policy}` 数组 |
| `strategy` | `sequential`（顺序）/ `parallel`（并行）振铃 |
| `status` / `reason` | 拒绝时的 SIP 响应码与原因 |
| `record` / `record_start_at` | 是否录音 / 从第几秒开始 |
| `timeout` / `max_ring_time` / `rtp_timeout` | 各类超时（秒） |
| `media_proxy` / `rtp_config` / `allow_codecs` | 媒体行为覆盖 |
| `with_original_headers` | 是否把原 INVITE 头带给下游 |

**失败语义**：Webhook 上游错误 / 超时 / 解析失败时，若 `fallback_to_static = true` 则回落到 `[routes]` 静态拨号计划，否则按错误目录返回失败。可以在控制台用 `POST /api/settings/config/proxy/http-router/test` 先测试再启用。

### 静态路由（拨号计划）

`[routes]` 配置（或控制台"路由"页）按优先级匹配，动作类型是 `Forward` / `Reject` / `Busy` / `Queue` / `Application` —— 注意这与 HTTP Router 的 `action` 枚举**不是同一套**。多来源（静态路由 / 中继 / HTTP 栈）的优先级组合见 [路由接口](/api/routing)。

## 通话中控制：三种入口

| 入口 | 适合场景 | 详见 |
|---|---|---|
| **REST API** `POST /api/calls/active/{session_id}/commands` | 低频管理操作：挂断、转接、静音、放音、收 DTMF、录音、转写 | [通话控制](/api/call-control) |
| **RWI WebSocket** | 高频实时控制：originate、bridge、监听、会议、事件订阅 | [RWI 协议](/guide/rwi) |
| **AMI** `/ami/v1/*` | 运维：健康检查、对话转储、热重载、外呼 SSE | [AMI 总览](/api/ami) |

REST 支持的命令（tag = action 的枚举）：`hangup` / `accept` / `transfer` / `hold` / `unhold` / `send_dtmf` / `mute` / `unmute` / `play` / `stop_playback` / `start_recording` / `stop_recording` / `pause_recording` / `resume_recording` / `start_transcription` / `stop_transcription` 等。

## 出站 Webhook：把事件推出去

通话过程中 RustPBX 也会主动调用你的服务，六类出站 Webhook：

| Webhook | 触发 | 载荷要点 |
|---|---|---|
| HTTP Router | 每个入局 INVITE | 路由决策（见上） |
| User Backend | 注册 / 鉴权 | 用户凭证校验 |
| Locator Webhook | REGISTER 注册 / 注销 / 离线 | 含 `timestamp` UNIX 秒 |
| CDR Push | 通话结束 | `multipart/form-data`，`calllog.json` 字段为完整 CDR |
| Recording Upload | 录音文件就绪 | `multipart/form-data`，`recording` 字段（WAV）+ `call_id`、`track_id` |
| RWI Webhook | 通话实时事件 | RWI 事件流，可按事件名过滤（如只订阅 `transcript_final`） |

详见 [API 集成指南](/guide/api-integration) 与 [出站 Webhook 概览](/apiguide/webhooks)。

## 队列与会议

- **队列**：核心内置执行引擎（`src/call/app/queue.rs`），状态机 `Init → Answering → DialingAgents → Connected → Done`（含等待坐席 / 保持音乐分支），支持升级策略（`EscalationPlan`）。ACD 决策（坐席选择、策略、SLA、集群调度）属联络中心版。队列可放配置文件（`[proxy].queues` / `queues_files`）或用控制台 / REST 管理（[队列接口](/api/queues)）。
- **会议**：`src/call/runtime/conference_manager.rs` 管理房间生命周期（主持人角色、静音、空房超时销毁），`conference_server.rs` 是独立 MCU 服务。通过 RWI 的 `conference.*` 命令操作；需配置 `[proxy].conference_factory_uri` 启用。

## IVR

IVR 支持两种形态：

1. **内置 IVR**：配置驱动的菜单 / 放音 / 收号。
2. **外部 Provider（Step Mode）**：每一步都 HTTP 调用你的服务，由你返回下一步动作（放音、收 DTMF、录音、转队列、转语音信箱、桥接外部 WebSocket 等）。事件类型包括 `session_start` / `dtmf` / `audio_complete` / `resume` 等。

完整协议（`ActionNode` 结构、终结 / 非终结动作、`voip_bridge` 挂起语义）见 [IVR Step 协议](/guide/ivr)。
