# Webhook 事件推送

不想维持 WebSocket 连接？把 RWI 事件流订阅为 HTTP Webhook：PBX 主动 POST 事件到你的服务，自带**指数退避重试**与**幂等键**。

## 启用

```toml
[rwi_webhook]
url = "https://your-service.example.com/hook"
events = ["transcript_final"]        # 事件白名单；空 = 全部
headers = { "X-Key" = "secret" }
timeout_ms = 5000                    # 默认 5000
retries = 5                          # 最多重试次数
track_queue_latency = false          # 统计队列延迟
```

Webhook 投递跑在独立的 runtime（`proxy.rwi_webhook_worker_threads`），与 SIP 信令隔离，你的服务再慢也不会拖累通话。

## 信封格式

```json
{
  "rwi": "1.0",
  "event_id": "3f2b1c70-...",
  "timestamp": "2026-10-22T08:30:00Z",
  "call_id": "abc-123@10.0.0.1",
  "event_type": "call_hangup",
  "event": {
    "session_id": "01J...",
    "reason": "normal_clearing",
    "hangup_by": "caller",
    "sip_status": 200,
    "duration_secs": 65
  }
}
```

| 字段 | 说明 |
|---|---|
| `rwi` | 信封版本（`"1.0"`） |
| `event_id` | **幂等键**——接收端按它去重 |
| `event_type` | 事件名（同 [RWI 事件参考](/interfaces/rwi-events)） |
| `event` | 扁平事件载荷（已剔除重复的 `event_type` 键） |

## 重试与幂等

- **可重试条件**：传输错误 / 5xx / 429；其他 4xx 视为「你不接受」，立即放弃；
- **退避**：200ms 起指数翻倍，最多 `retries`（默认 5）次；
- **幂等**：每次重试携带相同的 `event_id`，接收端按 `event_id` 去重即可安全重放；
- **可观测**：成功 / 失败计数器导出为 Prometheus 指标，失败的完整 body 记入日志作为补偿记录。

## 常用订阅组合

```toml
# 每句定稿推一次（AI 转写场景）
[rwi_webhook]
url = "https://ai.example.com/asr"
events = ["transcript_final"]

# 计费：只关心挂机
# events = ["call_hangup"]

# 坐席监控：队列相关全要
# events = ["queue_joined", "queue_position_changed", "queue_agent_connected", "queue_left"]
```

::: tip 一句一 POST
订阅 `transcript_final` 即可获得「一句定稿一个 POST」的转写流——重试与幂等都由 Webhook 管道处理，你只管消费。
:::

## 出局外呼的同步 Webhook（另一套）

`POST /ami/v1/outbound/dial` 的外呼请求可以带一个**同步指令 Webhook**——接通瞬间 PBX 调用你的服务决定接下来做什么（与 RWI 事件信封不同）：

**PBX → 你**（接通时）：

```json
{
  "call_id": "...", "leg_id": "...",
  "caller": "1001", "callee": "+86138...",
  "answered_at": "2026-10-22T08:30:00Z",
  "metadata": { "campaign": "spring" }
}
```

失败时字段变为 `failure_reason`。

**你 → PBX**：

```json
{ "action": "bridge", "target": "sip:agent@internal" }
```

`action` 取值：`bridge` / `enqueue` / `app` / `hangup`。Webhook 可递归（深度上限 3）。详见 [外呼](/features/outbound)。

## 安全建议

- 在 `headers` 里带固定密钥或签名，接收端校验后再处理；
- 对 `event_id` 做幂等存储（如 Redis SETNX + TTL）；
- 快速返回 2xx，耗时处理丢给后台队列——避免触发不必要的重试。
