# 外呼

RustPBX 提供三种外呼方式：RWI `call.originate`、预测式外呼 API（SSE）、路由出局（经中继）。

## RWI originate

最直接的方式——一条命令发起呼叫：

```json
{
  "action": "call.originate",
  "action_id": "1",
  "params": {
    "destination": "sip:+8613800138000@trunk",
    "caller_id": "010-88888888",
    "timeout_secs": 45,
    "extra_headers": { "X-Campaign": "spring" },
    "trunk": "wuhoo",
    "route_originated_calls": false,
    "record": true
  }
}
```

- **`trunk`**：显式指定中继（直接套用其 next-hop / 认证 / 改写 / PAI，不走路由表）；
- **`route_originated_calls: true`**：按路由表决策；
- **`record`**：自动开启录音（振铃片段可配置保留：`recording.record_ringing = true`）。

后续通过 `call.bridge` / `call.transfer` / `call.app_start` 等命令处理接通后的动作。

## 预测式外呼 API（SSE）

`POST /ami/v1/outbound/dial`（`[outbound].enabled` 门控）——请求即建立 SSE 事件流，实时收到呼叫进展：

```bash
curl -N -X POST http://pbx:8080/ami/v1/outbound/dial \
  -H 'Content-Type: application/json' \
  -d '{
    "destination": "+8613800138000",
    "caller_id": "010-88888888",
    "on_answer": { "type": "bridge", "target": "sip:agent1@internal" },
    "on_failure": { "type": "webhook", "url": "https://crm.example.com/failed" },
    "metadata": { "campaign": "spring" }
  }'
```

- SSE 流是**纯 RWI 事件透传**（`call_created` / `call_ringing` / `call_answered` / `call_hangup` …），无自定义事件类型；
- 并发满时立即返回 `429`（`[outbound] max_concurrent`）；
- 事件队列容量 128，接通后 1s 宽限期保证收齐后续事件。

### on_answer 动作

接通瞬间由 dispatcher 执行：

| 类型 | 说明 |
|---|---|
| `flow` | 执行拨号计划流程 |
| `bridge` | 桥接到目标（分机 / URI） |
| `enqueue` | 入队等待坐席 |
| `app` | 启动呼叫应用（如 `realtime`） |
| `webhook` | 调你的服务拿下一步指令（可递归，深度上限 3） |
| `hangup` | 直接挂断 |

### 同步 Webhook 指令

`on_answer: { "type": "webhook" }` 时，接通后 PBX POST 你的服务：

```json
{ "call_id": "...", "leg_id": "...", "caller": "1001", "callee": "+86138...",
  "answered_at": "2026-10-22T08:30:00Z", "metadata": { ... } }
```

返回下一步指令：

```json
{ "action": "bridge", "target": "sip:agent@internal" }
```

`action`：`bridge` / `enqueue` / `app` / `hangup`。失败时回调字段变为 `failure_reason`。

### 配置

```toml
[outbound]
enabled = true
max_concurrent = 100
default_ring_timeout = 30      # 秒
default_answer_timeout = 60
default_webhook_timeout = 5
```

## 路由出局（经中继）

分机直拨外线号码 → 路由匹配 → 选中中继 → PBX 自动应用中继配置（next-hop、Digest 凭据、P-Asserted-Identity、头改写、codec 白名单、限流、媒体策略）。详见 [路由与中继](/config/routing)。

## 出局的失败处理

- **失败通知**：`on_failure`（webhook / flow），带 `failure_reason`；
- **中继级重试**：候选序列一次性构建，按失败码 / 振铃时长推进到 `backup_dest` 或下一候选（不重走路由）；
- **健康检查**：中继探测失败自动切 `fallback_trunk`。

## 录音回铃片段

```toml
[recording]
record_ringing = true    # originate 呼叫自动录振铃片段（segment_type "ringing"），接通后保留
```

未开启时维持历史行为：仅在带 `record` 选项时捕获振铃，接通后删除。

## Python 示例

仓库 `examples/rwi_outbound_bridge.py`：originate → 接通 → 桥接到坐席的完整流程。
