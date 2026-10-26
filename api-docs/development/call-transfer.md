# 呼叫转移

呼叫转移分两大类：

| 类别 | 时机 | 包含 |
|---|---|---|
| **分机前转** | 呼叫**未接通**时，按号码预置规则改道 | [来电转移](#来电转移-无条件转移) / [遇忙转移](#遇忙转移) / [异常转移](#异常转移-无应答转移) |
| **通话转接** | 通话**进行中**转给第三方 | 盲转 / 咨询转 / 替换转，见 [通话中转接](#通话中转接-盲转、咨询转、替换转) |

分机前转的三种转移各有多种实现方式，下面按转移类型逐一列举。

## 来电转移（无条件转移）

**是什么**：给号码配置一个目标后，**任何来电都不振铃、直接转到该目标**。传统术语：无条件前转（CFU / Call Forwarding Unconditional）。典型场景：下班全部转手机、号码迁移期临时转新号、座席离席转组长。

### 实现方式一：分机前转配置（内建生效，推荐）

给分机设置前转字段，PBX 在路由阶段自动改道——**无需写代码**。

::: warning 单选限制
内建前转字段是**多选一**：`call_forwarding_mode` 为单值，一个分机同一时刻只能配一种模式、一个目标——配了来电转移就配不了遇忙 / 异常转移（反之亦然）。**三种转移要各自独立配置、同时生效**，请在自己的存储里按分机 × 模式各建一条记录，用各转移类型的 HTTP Router / RWI 实现方式（见下文各章节）分别驱动。
:::

| 字段 | 说明 |
|---|---|
| `call_forwarding_mode` | `always`（来电转移）/ `when_busy`（遇忙）/ `when_not_answered`（异常）/ `none`（关闭） |
| `call_forwarding_destination` | 转移目标（写法见下表） |
| `call_forwarding_timeout` | 振铃多久算无应答（秒，5–120 钳位，默认 30；来电转移不用等，此字段用不上） |

**配置入口**：控制台分机编辑页；或 REST `/api/extensions` 创建 / 更新分机时携带字段，见 [分机接口](/api/extensions)：

```json
{
  "extension": "1001",
  "call_forwarding_mode": "always",
  "call_forwarding_destination": "sip:+8613900000000@trunk"
}
```

**目标写法**（`call_forwarding_destination` 支持前缀语法，不止能转话机）：

| 写法 | 转到 |
|---|---|
| `1002` 或 `sip:1002@internal` | 另一分机 / 任意 SIP URI（外线号码亦可） |
| `queue:sales` | 呼叫队列（直接进排队） |
| `toivr:support-entry` | 路由点——按路由表重新决策 |
| `ivr:welcome` | 按 name 直接进入 IVR 项目（`config/ivr/<name>.toml`） |
| `voicemail:1001` | 语音信箱 |
| `conference:room-1023` | 会议房间 |
| `realtime:assistant` | AI 语音应用（`[[realtime]]` 预设） |

**执行机制**：来电到达时 PBX 解析被叫分机的前转配置，检测到 `always` 直接按目标重新路由（[call.rs](https://github.com/zhangfisher/rustpbx) 路由层实现），分机全程不振铃，上表目标类型全部支持。

### 实现方式二：HTTP Router 路由服务

如果你的部署启用了外部路由服务（`[proxy.http_router]`，所有呼叫先 POST 给你的服务），来电转移就是在响应里**直接转发到前转目标**：

```toml
[proxy.http_router]
url = "http://127.0.0.1:9090/route"   # 你的路由服务
timeout_ms = 3000                     # 超时（默认 5000）
fallback_to_static = true             # 服务超时/失败时回退静态路由
```

PBX 发来的请求里 `to` / `uri` / `from` 都是**字符串**（SIP 头原文），被叫分机要从字符串解析；你的服务查自己的前转配置库后返回决策：

```python
import re

def parse_user(s: str):
    """从 '"Name" <sip:user@host>;tag=…' / 'sip:user@host' / 'user@host' 提取 user"""
    m = re.search(r"<([^>]*)>", s or "")
    c = m.group(1) if m else (s or "")
    m = re.search(r"sip:([^@;]+)@", c)
    return m.group(1) if m else None

@app.post("/route")
async def route(req: Request):
    payload = await req.json()
    ext = parse_user(payload["uri"]) or parse_user(payload["to"])   # 被叫分机
    fwd = load_forwarding(ext)                                      # 你的前转配置库

    if fwd.mode == "always":                       # 来电转移：直接转
        return {"action": "forward", "targets": [fwd.destination]}

    return {"action": "forward", "targets": [f"sip:{ext}@internal"]}
```

::: warning targets 只接受 SIP URI
HTTP Router 的 `targets[].uri` 必须是**合法 SIP URI**——分机前转配置字段支持的 `queue:` / `toivr:` 等前缀语法不适用于此（解析失败的目标会被跳过）。要转队列 / IVR，写队列 / IVR 的路由 URI，或改用实现方式三的 `call.originate`。完整协议与可运行服务见 [HTTP Router 动态路由](/interfaces/http-router) 与仓库 `examples/http_router_service.py`。
:::

### 实现方式三：RWI 事件驱动

不启用 HTTP Router 时，可订阅 `call_created` 事件，在你的服务里查配置后「拒接原呼叫 + 呼转目标」：

```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.event_type !== "call_created") return;
  forwardingOf(msg.to).then((fwd) => {          // 你的配置库：模式 + 目标
    if (fwd.mode !== "always") return;
    ws.send(JSON.stringify({ action: "call.reject", action_id: "r1",
      params: { call_id: msg.call_id, reason: "redirected" } }));   // 拒接原呼叫
    ws.send(JSON.stringify({ action: "call.originate", action_id: "f1",
      params: { destination: fwd.destination, caller_id: msg.from,
                timeout_secs: 45 } }));                              // 呼转目标
  });
};
```

注意这是「拒接 + 重呼」语义：主叫会先听到一小段回铃再被接续，体验不如实现方式一/二（振铃前就改道）。事件订阅见 [开发前准备](/development/index#开发前准备)。

## 遇忙转移

**是什么**：分机**正在通话中**（回 486 / 600）时，来电自动转到预设目标。传统术语：遇忙前转（CFB / Call Forwarding Busy）。典型场景：坐席占线时转给同组同事、老板忙线转秘书。

::: warning 内建配置暂不触发
分机的 `call_forwarding_mode = "when_busy"` 字段**可以配置、保存**（控制台 / REST 均支持），但当前版本的呼叫流程尚未消费该模式——配置后不会自动转移。生效请用下面的实现方式二 / 三。
:::

### 实现方式一：分机前转配置（仅存储，当前版本不触发）

`call_forwarding_mode = "when_busy"`（别名 `busy`）+ `call_forwarding_destination`，配置方法与字段说明同 [来电转移的实现方式一](#实现方式一-分机前转配置-内建生效-推荐)——只是当前版本仅存储、不触发转移。且该字段是**多选一**：配了遇忙转移就不能同时配来电 / 异常转移，要并存请用本章的实现方式二 / 三。

### 实现方式二：HTTP Router 顺振法（推荐）

把「分机 + 前转目标」组装成顺振序列，`retry_policy` 里**只列忙线码**——分机回 486/600 时 PBX 自动挂起该腿、拨打前转目标（顺振语义，详见 [顺振](/development/sequential-ring)）：

```python
@app.post("/route")
async def route(req: Request):
    payload = await req.json()
    ext = parse_user(payload["uri"]) or parse_user(payload["to"])
    fwd = load_forwarding(ext)                     # 你的前转配置库

    return {"action": "forward", "strategy": "sequential",
            "targets": [
                { "uri": f"sip:{ext}@internal",
                  "retry_policy": { "status_codes": [486, 600] } },   # 忙才推进
                { "uri": fwd.destination }                            # 前转目标
            ]}
```

- 分机空闲 → 正常振铃接听，前转目标不会被拨打；
- 分机忙（486 / 600）→ 自动改呼前转目标；
- `parse_user` / 配置说明同 [来电转移的实现方式二](#实现方式二-http-router-路由服务)。

### 实现方式三：RWI 事件驱动

订阅 `call_busy` 事件，触发时用 `call.originate` 呼转目标——转移前可插业务逻辑（IM 通知坐席、写 CRM）：

```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.event_type === "call_busy") {
    forwardingOf(msg.session_id).then((fwd) => {      // 你的配置库
      if (fwd.mode === "when_busy") {
        ws.send(JSON.stringify({ action: "call.originate", action_id: `fb-${msg.session_id}`,
          params: { destination: fwd.destination, timeout_secs: 45 } }));
      }
    });
  }
};
```

与来电转移的实现方式三不同：这里原呼叫已经自己结束（忙线），**只需外呼目标**、无需拒接。代价是主叫要经历「振铃 → 忙 → 再振铃目标」的等待。

## 异常转移（无应答转移）

**是什么**：分机**振铃超时无人接**（408 / 480）时，来电自动转到预设目标。传统术语：无应答前转（CFNR / Call Forwarding No Reply）。典型场景：振铃 25 秒没人接转手机、离席转语音信箱、排队前先试本人再转兜底组。

::: warning 内建配置暂不触发
`call_forwarding_mode = "when_not_answered"` 同遇忙转移：字段可配置保存，当前版本呼叫流程尚未消费。生效请用实现方式二 / 三。
:::

### 实现方式一：分机前转配置（仅存储，当前版本不触发）

`call_forwarding_mode = "when_not_answered"`（别名 `no_answer`）+ `call_forwarding_destination`，配置方法同 [来电转移的实现方式一](#实现方式一-分机前转配置-内建生效-推荐)。这里的 `call_forwarding_timeout`（5–120 秒，默认 30）就是「振铃多久算无应答」的窗口。同样受**多选一**限制，要并存请用本章的实现方式二 / 三。

### 实现方式二：HTTP Router 顺振法（推荐）

与遇忙转移同一套路，差别只在推进条件：`retry_policy` 列**超时码**，`max_ring_time` 定义无应答窗口——振铃到点按 408 失败，自动改呼前转目标：

```python
@app.post("/route")
async def route(req: Request):
    payload = await req.json()
    ext = parse_user(payload["uri"]) or parse_user(payload["to"])
    fwd = load_forwarding(ext)

    return {"action": "forward", "strategy": "sequential",
            "targets": [
                { "uri": f"sip:{ext}@internal",
                  "retry_policy": { "status_codes": [408, 480] } },   # 超时才推进
                { "uri": fwd.destination }
            ],
            "max_ring_time": fwd.timeout}      # 无应答窗口（= 分机前转的 timeout 字段语义）
```

- 分机在窗口内接听 → 正常通话；
- 窗口到点无人接（408 / 480）→ 自动改呼前转目标；
- 也可以**一节序列同时覆盖遇忙与异常**：`retry_policy` 列 `[408, 480, 486, 600]`——忙或超时都转（部分话机「异常转移」就是这个复合语义）。

### 实现方式三：RWI 事件驱动

订阅 `call_no_answer` / `call_error` 事件后外呼前转目标，机制同 [遇忙转移的实现方式三](#实现方式三-rwi-事件驱动-1)：

```javascript
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.event_type === "call_no_answer") {
    forwardingOf(msg.session_id).then((fwd) => {
      if (fwd.mode === "when_not_answered") {
        ws.send(JSON.stringify({ action: "call.originate", action_id: `fn-${msg.session_id}`,
          params: { destination: fwd.destination, timeout_secs: 45 } }));
      }
    });
  }
};
```

## 通话中转接：盲转、咨询转、替换转

通话转接（Transfer）：**把一通进行中的通话转给第三方**，转接完成后原接线方退出。典型场景：客服转专家、前台转分机、坐席间工单移交、话务台席位替换。由 RWI 命令直接实现。

### 三种转接语义

| 语义 | 命令 | 流程 | 转完后 |
|---|---|---|---|
| 盲转 | `call.transfer` | 向主叫腿发 SIP REFER，主叫话机自行呼转目标 | 接线方立即退出，成败由目标决定 |
| 咨询转 | `call.transfer.attended` → `call.transfer.complete` / `call.transfer.cancel` | 先建咨询腿与目标私谈，确认后合并 | 接线方退出，A 与 B 接通 |
| 替换转 | `call.transfer.replace` | REFER + Replaces，用新呼叫顶替原对话一方 | 席位替换 / 出席转接语义 |

### 实现方式一：RWI（推荐，语义最全）

#### 盲转（call.transfer）

```json
{ "action": "call.transfer", "action_id": "t1",
  "params": { "call_id": "<Call-ID 或 session_id>", "target": "sip:2001@internal" } }
```

| 参数 | 必填 | 说明 |
|---|---|---|
| `call_id` | ✅ | 要转走的通话（Call-ID 或 `session_id` 均可） |
| `target` | ✅ | 目标 SIP URI（分机 / 队列 / 外线号码均可） |

工作机制：

1. PBX 对主叫腿发送 **SIP REFER**（带 Refer-To 目标），主叫话机收到后自己向目标发起新 INVITE；
2. 话机回 `202 Accepted` 后 PBX 挂断自己的腿，转接结果由后续 NOTIFY 确认；
3. 若 REFER 被拒绝（4xx）或超时，PBX **自动回退为 B2BUA 转接**（PBX 自己呼出目标腿再桥接），不依赖话机支持 REFER；
4. 命令响应立即返回 `command_completed`——**转接的真实成败通过事件异步上报**（见「事件与观测」）。

#### 咨询转（attended → complete / cancel）

坐席接到客户 A，想先问一下同事 B 再决定是否转：

**1. 发起咨询腿**

```json
{ "action": "call.transfer.attended", "action_id": "t2",
  "params": { "call_id": "<A 与坐席的通话>", "target": "sip:2002@internal" } }
```

命令响应 `data` 返回咨询腿标识：

```json
{ "original_call_id": "…", "consultation_call_id": "…" }
```

发起后客户 A 自动进入**保持**（播保持音），坐席与 B 私谈。

**2a. 确认转接**

```json
{ "action": "call.transfer.complete", "action_id": "t3",
  "params": { "call_id": "<original_call_id>",
              "consultation_call_id": "<consultation_call_id>" } }
```

PBX 把 A 与 B 桥接、退出自己，客户与 B 接通。

**2b. 取消咨询（回到客户）**

```json
{ "action": "call.transfer.cancel", "action_id": "t4",
  "params": { "consultation_call_id": "<consultation_call_id>" } }
```

咨询腿被拆除，客户恢复通话。

::: warning 参数名以本文为准
`call.transfer.complete` 的参数是 **`call_id` + `consultation_call_id`**；`call.transfer.cancel` 只需 **`consultation_call_id`**。`call.transfer.attended` 的 `timeout_secs` 参数当前实现会忽略（咨询腿存活期由你的业务用 `call.transfer.cancel` 控制）。
:::

#### 替换转（call.transfer.replace）

```json
{ "action": "call.transfer.replace", "action_id": "t5",
  "params": { "call_id": "<要被顶替的通话>", "target": "sip:3001@internal" } }
```

Replaces 语义：用新呼叫**顶替**原对话中的一方，适合话务台「替同事接管这通电话」、坐席席位迁移等场景。参数与盲转相同（`call_id` + `target`）。若要「把自己换进会议 / 通话」而不挂断任何一方，也可用 `conference.seat_replace`，见 [多方会议](/development/conference-room)。

### 实现方式二：REST（低频管理）

```http
POST {api_prefix}/calls/active/{session_id}/commands
```

```json
{ "action": "transfer", "target": "sip:2001@internal", "attended": false }
```

REST 只有统一的 `transfer` 动作（`attended: true` 即咨询转发起），没有 complete / cancel / replace 细分——完整流程请用 RWI。权限 `callcontrol:command`，集群部署下自动转发到 owner 节点，见 [通话控制](/api/call-control)。

### 实现方式三：DTMF 热键转接（按键输入转移号码）

**是什么**：通话中按预设前缀 + **任意转移号码** + `#`，由你的服务匹配按键序列后下发转接命令——转移号码动态输入、无需预设映射；不同前缀区分**盲转 / 咨询转**。例如：`*9` `2001` `#` 盲转 2001，`*8` `2002` `#` 发起对 2002 的咨询转。

按键事件的产生条件见 [DTMF 响应](/development/dtmf-response)：按键被**运行中的呼叫应用**消费时产生 `dtmf` 事件推给你的 RWI 连接。因此热键转接的通话要**带应用**——呼叫本来就在 IVR / 队列 / 步模式流程中，或用 `call.app_start` 启动一个应用；纯桥接通话不产生按键事件。另外只有 **caller 腿**的按键会作为业务输入（坐席侧按键仅透传给对端，见本节末尾「坐席想按热键怎么办」）。

实现（RWI 订阅 + 序列匹配 + 下发转接）：

```javascript
let buf = "", mode = null;          // mode: "blind"（*9） | "attended"（*8）

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.event_type !== "dtmf") return;
  const d = msg.digit;

  if (!mode) {                       // 先匹配前缀：*9 盲转 / *8 咨询转
    if (buf === "" && d === "*") buf = "*";
    else if (buf === "*" && (d === "8" || d === "9")) {
      mode = d === "8" ? "attended" : "blind"; buf = "";
    } else buf = "";
    return;
  }

  if (d === "#") {                   // 号码输入完毕，触发转接
    if (buf) ws.send(JSON.stringify({
      action: mode === "attended" ? "call.transfer.attended" : "call.transfer",
      action_id: `dt-${msg.call_id}`,
      params: { call_id: msg.call_id, target: `sip:${buf}@internal` }
    }));
    mode = null; buf = "";
    return;
  }
  if (/[0-9]/.test(d)) buf += d; else buf = "";
};
```

- 咨询转发起后原呼叫自动保持、与目标私谈；把 `call.transfer.attended` 响应返回的 `consultation_call_id` 记在业务侧，可将后续按键映射成 `call.transfer.complete` / `call.transfer.cancel`（如 `#` 确认、`*` 取消），全程按键化；
- 盲转无需确认，收到 `#` 即下发；
- 更细的按键收集（定长、位间超时、结束符）可用 `dtmf.collect` 命令代替手工缓冲，见 [DTMF 响应](/development/dtmf-response)。

::: tip 坐席想按热键怎么办
当前只有 caller 腿（客户侧）按键产生事件，坐席话机按键仅透传给对端。坐席侧触发的正道：话机自带转接键（发 SIP REFER，走 PBX 原生转接语义），或把你的坐席软电话 / 页面做成转接按钮，点击后由你的服务调 RWI / REST 命令——按钮也比背按键序列好用。
:::

### 事件与观测（通话转接）

| 事件 | 触发时机 | 主要载荷 |
|---|---|---|
| `call_transfer_accepted` | 转接被接受（REFER 202 / 发起成功） | `call_id`、`transfer_target`、`transfer_target_type` |
| `call_transferred` | 转接完成 | `call_id`、`transfer_target`、`transfer_target_type`（`queue` / `ivr` / `conference` / `sip` …） |
| `call_transfer_failed` | 转接失败 | `call_id`、`sip_status`、`reason`、`transfer_target` |
| `consult_switched` | 咨询期间在客户 / 咨询腿之间切换私谈 | `call_id`、`transfer_id`、`talking_to`（`customer` / `consult`） |

失败 `reason` 取值：`refer_rejected`（对端拒绝）、`timeout`、`cancelled`、`invalid_target`、`invalid_state`、`internal_error`。

### 注意事项（通话转接）

- **状态要求**：只有处于**通话中（Talking）**的呼叫能发起转接，振铃中 / 保持中的呼叫会返回 `InvalidState`；
- **`session_id` 串联**：咨询腿与原呼叫共享同一 `session_id`，用它把转接前后的 CDR 与事件串成一条链，见 [session_id 关联模型](/guide/session-id)；
- **并发上限**：单节点转接事务数有上限（`max_concurrent_transfers`，默认 1000），超限命令直接失败；
- **权限**：RWI token 的 `scopes` 需包含呼叫控制（`["*"]` 或 `call.control`），见 [RWI 实时接口](/interfaces/rwi#token-配置)；
- **媒体路径**：盲转由话机直呼目标时媒体不再经过 PBX；B2BUA 回退路径与咨询转的媒体保持锚定，录音不受影响。

## 常见问题

- **来电转移后 CDR 算谁的？** 呼叫按转移目标重新路由，CDR 记录实际接通的腿；用 `session_id` 可关联原始被叫与转移后目标，见 [session_id 关联模型](/guide/session-id)。
- **配置了遇忙转移 / 异常转移怎么没生效？** 当前版本呼叫流程尚未消费这两个模式（字段可保存）；生效请按对应章节的实现方式二 / 三自行实现。
- **命令成功了但没转走？** `command_completed` 只代表转接事务受理，真实结果看 `call_transferred` / `call_transfer_failed` 事件。
- **咨询转和三方通话怎么选？** `call.transfer.complete` 转完后接线方退出（两方）；`conference.merge` 转完后三方互通（三方），见 [多方会议](/development/conference-room)。
- **转给队列 / IVR 行吗？** 分机前转配置支持 `queue:` / `toivr:` 等前缀目标；RWI 转接的 `target` 指向队列 / IVR URI 即可，`call_transferred` 事件的 `transfer_target_type` 会标出目标类型。
