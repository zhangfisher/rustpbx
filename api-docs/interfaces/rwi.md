# RWI 实时接口

RWI（**R**eal-time **W**ebSocket **I**nterface）是 RustPBX 的实时控制面：JSON over WebSocket，一条连接同时承载**命令下行**与**事件上行**——呼叫控制、队列调度、监听强插、会议管理、转写流，全部实时。

## 端点与握手

| 项 | 值 |
|---|---|
| 默认路径 | `/rwi/v1`（可由 `[proxy] rwi_path` 覆盖） |
| 子协议 | **必须**为 `rwi-v1` |
| 鉴权 | `Authorization: Bearer <token>` 或 query `?token=<token>` |
| 失败响应 | `401` + `WWW-Authenticate: Bearer realm="rwi", error="invalid_token"` |

```javascript
const ws = new WebSocket("ws://pbx.example.com/rwi/v1?token=MY_TOKEN", ["rwi-v1"]);
```

## Token 配置

```toml
[rwi]
max_connections = 2000            # 全局连接上限
max_calls_per_connection = 200    # 单连接可操作的呼叫数上限
orphan_hold_secs = 30             # 连接断开后孤儿呼叫的保持时长
originate_rate_limit = 10         # 单连接 originate 速率（次/秒）

[[rwi.tokens]]
token = "my-control-service-token"
name = "crm"
scopes = ["*"]                    # 权限范围
```

Token 支持配置热更新（保存即生效，无需重启）。

## 消息格式

**命令**（客户端 → PBX）：

```json
{
  "action": "call.originate",
  "action_id": "req-001",
  "params": { "destination": "sip:1001@internal", "timeout_secs": 30 }
}
```

**响应**（PBX → 客户端）：`command_completed` 或 `command_failed`，携带对应 `action_id`。

**事件**（PBX → 客户端）：与响应走同一条下行通道，先 `session.subscribe` 订阅上下文后推送。

```json
{
  "action": "call_answered",
  "action_id": "evt-...",
  "params": { "session_id": "01J...", "call_id": "...", "direction": "inbound" }
}
```

## 一分钟上手

```javascript
const ws = new WebSocket("ws://pbx:8080/rwi/v1?token=TOKEN", ["rwi-v1"]);

// 1. 订阅事件上下文
ws.onopen = () => ws.send(JSON.stringify({
  action: "session.subscribe", params: { context: "global" }
}));

// 2. 接听事件
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.action === "call_hangup") console.log("通话结束", msg.params);
};

// 3. 主动外呼
ws.send(JSON.stringify({
  action: "call.originate", action_id: "1",
  params: { destination: "sip:1001@internal", timeout_secs: 30 }
}));

// 4. 转接
ws.send(JSON.stringify({
  action: "call.transfer", action_id: "2",
  params: { session_id: "01J...", target: "sip:1002@internal" }
}));
```

## 能力总览

| 分组 | 命令 |
|---|---|
| 会话 | `session.subscribe` / `unsubscribe` / `attach_call` / `list_calls` / `detach_call` / `resume` |
| 呼叫控制 | `call.originate` / `answer` / `reject` / `ring` / `hangup` / `bridge` / `unbridge` |
| 转接 | `call.transfer` / `.replace` / `.attended` / `.complete` / `.cancel` |
| 保持 | `call.hold` / `call.unhold` / `call.set_ringback_source` |
| 媒体 | `media.play` / `media.stop`、`call.send_dtmf`、`dtmf.collect` |
| 录音 | `record.start` / `pause` / `resume` / `stop` |
| 队列 | `queue.enqueue` / `dequeue` / `hold` / `unhold` / `set_priority` / `assign_agent` / `requeue` |
| 监听 | `supervisor.listen` / `whisper` / `barge` / `takeover` / `stop` |
| 会议 | `conference.create` / `add` / `remove` / `mute` / `unmute` / `destroy` / `merge` / `seat_replace` |
| 应用 | `call.app_start` / `app_stop` / `app.chain` |
| 变量 | `call.set_var` / `get_var` / `set_userdata` / `get_userdata` |
| SIP 直通 | `sip.message` / `sip.notify` / `sip.options_ping` |

完整参数说明见 [RWI 命令参考](/interfaces/rwi-commands)。

## 事件

订阅后可收到 60+ 种事件，覆盖呼叫生命周期（`call_created` → `call_ringing` → `call_answered` → `call_hangup`）、转接、录音、转写、DTMF、队列、会议、IVR 等。完整列表见 [RWI 事件参考](/interfaces/rwi-events)。

## 集群转发

集群部署中，命令若命中**非本机**的会话，本机 RWI 网关自动转发到 owner 节点并把结果/事件回流给你——客户端无感，一个端点控制整个集群。

## 事件转 Webhook

不想维持 WebSocket 连接？把 RWI 事件流订阅为 HTTP Webhook 即可（带重试与幂等键）。详见 [Webhook 事件推送](/interfaces/webhooks)。

## 示例

仓库 `examples/` 提供：

- `rwi_event_webhook.py` —— RWI 事件 Webhook 消费；
- `rwi_outbound_bridge.py` —— originate + 桥接的 Python 示例；
- `unified_ivr_provider.py` —— 统一 IVR provider。
