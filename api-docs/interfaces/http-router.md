# HTTP Router 动态路由

HTTP Router 把**每个入局 INVITE** 的关键信息 POST 给你的外部 HTTP 服务，由你的服务实时返回呼叫去向——路由逻辑完全归你的应用所有，用任何语言实现，无需改 PBX、无需重编译。

## 启用

```toml
[proxy.http_router]
url = "https://your-service.example.com/route"
headers = { "X-Key" = "secret" }   # 附带的自定义请求头
timeout_ms = 5000                  # 默认 5000
fallback_to_static = true          # 回落静态路由表（见下方说明）
```

::: warning 全局替换语义
启用后**所有**入局 INVITE 都会先经过你的服务（除非明确回落）。这是 `[proxy]` 级别的全局行为，不是按路由逐条生效。
:::

## PBX → 你的服务（请求体）

`POST` JSON：

```json
{
  "call_id": "abc-123@10.0.0.1",
  "session_id": "01JABC...",
  "from": "sip:+861390000@trunk.example.com",
  "to": "sip:400800@example.com",
  "source_addr": "203.0.113.50:5060",
  "direction": "inbound",
  "method": "INVITE",
  "uri": "sip:400800@example.com",
  "headers": { "Call-ID": "...", "From": "...", "X-Custom": "..." },
  "body": "v=0\r\no=- ... (SDP 原文)"
}
```

| 字段 | 说明 |
|---|---|
| `call_id` | SIP `Call-ID` 头 |
| `session_id` | 全局会话 ID（与 RWI 事件、CDR 中一致，便于关联） |
| `from` / `to` | `From` / `To` 头原文 |
| `source_addr` | 从 `Via` 头解析出的源地址 |
| `direction` | `inbound`（带 Trunk 上下文的外线接入）/ `internal`（内部分机互拨） |
| `headers` | 全部 SIP 头（name → value） |
| `body` | SDP 原文 |

## 你的服务 → PBX（响应体）

```json
{
  "action": "forward",
  "targets": ["sip:1001@internal", "sip:1002@internal"],
  "strategy": "parallel",
  "record": true,
  "max_ring_time": 30
}
```

### action 取值

| action | 行为 |
|---|---|
| `forward` | 按 `targets` 发起呼叫 |
| `reject` | 拒绝（可用 `status` / `reason` 指定 SIP 响应码） |
| `abort` | 中止呼叫 |
| `spam` | 标记为垃圾呼叫并处理 |
| `not_handled` | 不处理——若开了 `fallback_to_static` 则回落静态路由，否则**最终回 500** |

### 可选字段

| 字段 | 说明 |
|---|---|
| `targets` | 目标列表：每个可以是 SIP URI 字符串，或 `{ "uri": ..., "retry_policy": ... }` 对象 |
| `strategy` | `sequential`（顺序，先接者赢）/ `parallel`（并行振铃） |
| `record` / `record_start_at` | 是否录音 / 起录时机 |
| `timeout` | 最大通话时长（秒） |
| `max_ring_time` | 本次呼叫最大振铃时长 |
| `rtp_timeout` | RTP 静默超时 |
| `media_proxy` | 本次呼叫的媒体代理模式 |
| `caller` | 改写被叫腿的 From（主叫显示） |
| `rtp_config` | `{ "bind_ip": ..., "external_ip": ... }` 覆盖 |
| `headers` / `with_original_headers` | 附加 SIP 头 / 是否保留原头 |
| `extensions` | 附加的内部扩展数据 |

返回 `forward` 后，目标 AoR 还会经位置服务解析真实 contact，再经拨号计划检查器栈，然后才建立会话。

## 完整闭环示例

```python
# examples/http_router_service.py 的简化版
from fastapi import FastAPI, Request
app = FastAPI()

@app.post("/route")
async def route(req: Request):
    payload = await req.json()
    to_user = payload["to"].split(":")[1].split("@")[0]

    if to_user.startswith("400"):          # 号码前缀路由到分机
        return {"action": "forward",
                "targets": [f"sip:{to_user}@internal"]}
    if to_user == "queue":                 # 进入队列
        return {"action": "forward",
                "targets": ["sip:sales-queue@queue"]}
    return {"action": "reject", "status": 603, "reason": "Rejected"}
```

仓库还提供 `examples/http_router_service.py`（含 `/route`、`/auth`、`/rwi` 三个端点的完整参考实现）与 `examples/jsonrpc_router.py`。

## 与静态路由共存

- `fallback_to_static = true`：你的服务超时 / 5xx / 返回 `not_handled` 时，回落 `[[proxy.routes]]` 静态路由表；
- `fallback_to_static = false`（默认）：`not_handled` 与错误都会让呼叫失败（默认 500 Server Internal Error）。

静态路由作为「兜底保险丝」建议始终开启，除非你明确要让路由服务成为单点。

## 关联与调试

- 请求里的 `session_id` 与 RWI 事件、CDR 中的 `session_id` 一致，可全链路关联；
- 路由决策失败会记录 trace 并产生早期失败 CDR 快照；
- 控制台「诊断」页可评估路由规则；HTTP Router 的错误目录见 `src/proxy/routing/http_error_catalog.rs`。
