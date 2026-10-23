# DTMF 响应

用户按键（DTMF）是最朴素的业务入口：查余额按 1、转人工按 0、报工号按 #。本篇讲**按键从哪来、默认怎么处理、你怎么接住它并执行自己的逻辑**。

## 按键从哪来

| 来源 | 层面 | 说明 |
|---|---|---|
| RTP telephone-event（RFC 4733，含 48 kHz） | 媒体面 | 需媒体**锚定**（经 PBX）。PBX 按 4 字节事件帧解析成数字，不会把按键误当音频解码 |
| SIP INFO `application/dtmf-relay` | 信令面 | 与媒体路径无关，解析 `Signal=` 行；**同时转发给对端 dialog**（双向） |
| PBX 注入 | — | 你的程序用 `call.send_dtmf` / REST `send_dtmf` 主动发出 |

## 默认行为：透传给对端

不做任何开发时，按键按默认策略**中继到对端**：媒体桥把 telephone-event RTP 按两侧 PT 映射转发，SIP INFO 直接转发到对端 dialog。因此「分机按键 → 上游网关 / IVR」这类透传需求开箱即得。

## 三种响应方式

### 方式一：IVR（推荐，功能最完整）

**内置 IVR（配置驱动）**：`dtmf_menu` 播放欢迎语并等待按键，`entries` 非空时**本地解析**（不回调外部服务）；`collect_dtmf` 收固定位数，结果写进会话变量 `dtmf_input`。见 [IVR 语音流程](/features/ivr)。

**步模式 / 自定义 Provider（逻辑全在你的代码）**：每个按键以 HTTP POST 发给你的服务：

```json
{ "session_id": "01JABC…", "event": { "type": "dtmf", "digit": "2", "leg_id": "caller" } }
```

你返回下一步的 `ActionNode`（用 `next` 串联），流程逻辑完全在你的代码里：

```json
{
  "type": "prompt",
  "file": "sounds/ivr/confirm.wav",
  "interruptible": true,
  "next": {
    "type": "dtmf_menu",
    "greeting": "sounds/ivr/menu.wav",
    "timeout_ms": 5000,
    "max_retries": 3,
    "entries": {
      "1": { "type": "transfer", "target": "2001" },
      "0": { "type": "transfer", "target": "operator" },
      "9": { "type": "hangup" }
    }
  }
}
```

协议（含事件类型、`dtmf_menu_invalid` / `dtmf_timeout`、缓冲按键回带）见 [IVR Step 协议](/guide/ivr)；可运行实现见仓库 `examples/unified_ivr_provider.py`。

::: tip 按键事件的过滤规则
RustPBX 会过滤 IVR **未等待输入**时到达的按键，防止播放期间的误触打乱流程。如果你的 Provider 要收到每个按键，前一个动作要是 `dtmf_menu` 或 `collect_dtmf`（推荐用 `next` 把 `prompt` 与 `collect_dtmf` 串联），而不是普通 `prompt`。
:::

### 方式二：RWI 事件与收集器（实时控制面）

**逐键事件**——按键被消费时产生 `dtmf` 事件（扁平结构，`event_type` 标识类型）：

```json
{ "event_type": "dtmf", "call_id": "…", "digit": "5", "leg_id": "caller" }
```

**主动收集**——一次收完整串：

```json
{ "action": "dtmf.collect", "action_id": "d1",
  "params": { "call_id": "<Call-ID 或 session_id>",
              "min_digits": 4, "max_digits": 4,
              "timeout_ms": 8000, "terminator": "#" } }
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `leg_id` | `caller` | 采集哪条腿 |
| `min_digits` | 1 | 少于该位数时超时视为**失败** |
| `max_digits` | 16 | 收满即结束 |
| `timeout_ms` | 10000 | 位间 / 总超时 |
| `terminator` | 无 | 结束符，**不计入**结果 |

结果事件（同样为扁平结构）：

```json
{ "event_type": "dtmf_collected",         "call_id": "…", "leg_id": "caller", "digits": "1234" }
{ "event_type": "dtmf_collection_timeout", "call_id": "…", "leg_id": "caller" }
```

::: warning 事件与收集的产生条件
- **`dtmf` 事件在按键被运行中的呼叫应用（IVR / 队列 / 步模式 Provider）消费时**推送给该通话的 owner 连接（`originate` / `attach_call` 的那条连接）；
- PBX **注入**的按键（`call.send_dtmf`）总会喂给活动的 `dtmf.collect` 收集器；
- 纯通话（没有应用在跑）时，按键只在信令 / 媒体层**透传给对端**，不产生业务事件——要自己接按键，请用方式一（内置 IVR 菜单或步模式 Provider），或用 `call.app_start` 启动一个应用。
:::

### 方式三：短代码匹配（自己做热键）

订阅事件后在你的服务里匹配按键序列（`*9`、`#`、连续多位），再用 RWI 下发动作——保持呼叫、转接、外呼、写 CRM 都行：

```javascript
if (pending + msg.digit === "*9") {
  ws.send(JSON.stringify({ action: "call.transfer", action_id: "x",
    params: { call_id: msg.call_id, target: "sip:supervisor@internal" } }));
  pending = "";
}
```

::: info 不要依赖 TOML 热键配置
`[rwi.smart_routing]` / `[rwi.local_rules]` 下的 DTMF 热键配置是**设计提案**，当前代码不解析也不执行（见 [RWI 协议](/guide/rwi) 第 12 章状态说明）。热键逻辑请放在你的应用里实现。
:::

## 主动发送按键

**RWI**

```json
{ "action": "call.send_dtmf", "action_id": "s1",
  "params": { "call_id": "…", "leg_id": "callee", "digits": "123#" } }
```

**REST**

```json
{ "action": "send_dtmf", "digits": "123#", "leg_id": "leg-a" }
```

行为细节：

- 只接受 `0-9`、`*`、`#`、`A-D`，其余字符被过滤；无有效字符则命令失败；
- 优先走**媒体面 RFC 2833 telephone-event**（在该腿自己的出口发送，SRTP 保护），失败时回退 **SIP INFO**（`Signal=x` + `Duration=160`）；
- 注入的按键对运行中的呼叫应用**与入局按键完全一致**，同时喂给活动的 `dtmf.collect`；
- 典型用途：帮用户二次拨号、通知上游网关 / 语音信箱、模拟话机按键做自动化测试。

## 放音被按键打断

```json
{ "action": "media.play",
  "params": { "call_id": "…", "source": { "source_type": "file", "uri": "menu.wav" },
              "interrupt_on_dtmf": true, "leg_id": "caller" } }
```

`interrupt_on_dtmf: true` 时按键会立即中止播放，随后产生：

```json
{ "event_type": "media_play_finished", "call_id": "…", "track_id": "…", "interrupted": true }
```

REST `play` 同样支持 `interrupt_on_dtmf`，见 [通话控制](/api/call-control)。

## 常见问题

| 现象 | 原因与解法 |
|---|---|
| 收不到 RTP 按键 | 媒体处于**旁路（bypass）**，PBX 不经手 RTP。改 `media_proxy = "auto"` / 让呼叫进入会锚定的流程（IVR、队列、录音），SIP INFO 按键不受影响 |
| 只有主叫按键有反应 | **只有 caller 腿的按键会被当作应用输入**（坐席侧按键仍转发给对端，但不驱动 IVR）——这是刻意设计 |
| 按键在应用启动瞬间丢失 | 应用（Application / Queue 流）启动窗口内按键会被缓冲（最多 16 位、TTL 5 秒）后按序重放；普通通话不缓冲 |
| 位数收不满 | 检查 `min_digits` / `timeout_ms` / `terminator`；超时且位数不足会产生 `dtmf_collection_timeout` |
| 对端听不到按键 | 确认 `call.send_dtmf` 指定的 `leg_id` 是要发往对端的那条腿 |
