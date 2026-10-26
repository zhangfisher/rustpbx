# 呼叫中心

呼叫中心（Call Center）：**来电排队 → 坐席分配 → 通话 → 事后报表**的完整链路。RustPBX 分两层提供：

| 层 | 能力 | 获取方式 |
|---|---|---|
| **队列引擎（社区版）** | 呼叫排队、坐席振铃（顺序 / 并行）、等待音乐、排队位次播报、溢出与超时回退、队列 REST / 控制台 | 开箱即用（插件 `queue` 始终编译） |
| **呼叫中心版（CC）** | 在队列引擎之上增加：坐席注册与管理、技能组（ACD）匹配、坐席状态机（空闲 / 示忙 / 话后处理）、升级策略（SLA / escalation）、坐席大屏 | 商业版 |

社区版解决「来电有人接」；CC 版解决「**对的人**来接」。复杂调度（如「有某技能的坐席优先接对应需求来电」）需要技能组 ACD——CC 版内建，社区版下由**你的程序**自主实现（本文给出路径）。

## 进入队列的三种方式

1. **HTTP Router**（推荐）：路由服务返回 `forward` 指向队列 URI，入队时机与队列选择归你的业务；
2. **静态路由 / Dialplan**：路由目标直接设为队列；
3. **RWI 命令**：`queue.enqueue` 把任意进行中 / 振铃中的呼叫放入队列（如 IVR 按键 0 转人工后入队）。

## 社区版：静态坐席队列

队列用 TOML 配置（`config/queue/*.toml`，支持热重载），坐席即普通 SIP 分机：

```toml
name = "support"
description = "售后队列"

[queue.hold]                       # 每队列独立等待音乐
audio_file = "sounds/phone-calling.wav"
loop_playback = true

[queue.strategy]
mode = "sequential"                # sequential 逐个拨 | parallel 全部同响（先接者赢）
wait_timeout_secs = 30             # 每个坐席振铃多久算未接

[[queue.strategy.targets]]         # 静态坐席列表
uri = "sip:1001@localhost"
label = "张三"

[[queue.strategy.targets]]
uri = "sip:1002@localhost"
label = "李四"

[queue.fallback]                   # 溢出 / 无人接时的兜底
redirect = "sip:vm@internal"       # 转语音信箱；也可用 failure_code/failure_reason 直接拒接
```

管理入口：控制台 `/queues` 页面、REST `/api/queues`（创建 / 编辑 / 导入导出 / 热重载）。完整的等待体验（位次播报、舒适提示音、服务提示音）与溢出策略见 [呼叫队列](/features/queue) 与 [队列接口](/api/queues)。

## RWI 队列命令

| 命令 | params | 说明 |
|---|---|---|
| `queue.enqueue` | `call_id`、`queue_id`、`priority`、`skill_groups` | 入队；`priority` 数值大的优先分配 |
| `queue.dequeue` | `call_id` | 出队（用户不想等了） |
| `queue.hold` / `queue.unhold` | `call_id` | 队内保持（如坐席转接间隙） |
| `queue.set_priority` | `call_id`、`priority` | 动态调整排队优先级（VIP 插队） |
| `queue.assign_agent` | `call_id`、`agent_id` | **指定坐席**——自主实现调度逻辑的落点 |
| `queue.requeue` | `call_id`、`queue_id`、`priority`、`skill_groups` | 坐席未接后重新入队（可换队列、改技能组） |

```json
{ "action": "queue.enqueue", "action_id": "q1",
  "params": { "call_id": "<Call-ID 或 session_id>", "queue_id": "support",
              "priority": 10, "skill_groups": ["vip", "tech"] } }
```

## 队列事件

| 事件 | 说明 | 主要载荷 |
|---|---|---|
| `queue_joined` / `queue_left` | 入队 / 离队 | `call_id`、`queue_id`、`skill_groups`；`queue_left` 带 `reason`（`connected` / `abandoned` / `timeout` / `fallback`…） |
| `queue_position_changed` | 排队位次变化（驱动「前面还有 N 位」播报） | `position` |
| `queue_candidates_found` | 匹配到候选坐席 | `candidates` |
| `queue_agent_offered` | 向坐席振铃 | `agent_id` |
| `queue_agent_connected` | 坐席接起 | `agent_id` |
| `queue_agent_no_answer` / `queue_agent_rejected` | 坐席未接 / 拒接（带尝试次数 `attempt`） | `agent_id` |
| `queue_wait_timeout` | 等待超时 | — |
| `queue_overflow_joined` | 溢出策略入队 | `skill_group` |
| `queue_fallback_executed` | 兜底动作执行 | `action`、`reason` |

坐席侧典型事件序列：

```
queue_joined → queue_position_changed × N
  → queue_candidates_found → queue_agent_offered（坐席振铃）
  → queue_agent_connected（接通）或 queue_agent_no_answer → queue.requeue
  → call_hangup
```

## 技能组与 ACD

**入队时携带技能需求**：`queue.enqueue` 的 `skill_groups`（如 `["vip", "tech"]`）声明这通电话需要什么技能的坐席。

**CC 版（内建 ACD）**：坐席在坐席注册表（AgentRegistry）中登记技能与并发上限，分配时按

- **技能匹配**：需求技能**全部包含**于坐席技能（AND 语义）才算候选；
- **容量检查**：坐席当前通话数 < 并发上限、且状态可接听（空闲 / 话后处理结束）；
- **选择策略**：`routing_strategy` 支持最长空闲（LongestIdle）、轮询（RoundRobin）、技能优先（SkillBased）、最少通话（LeastCalls）；
- **坐席状态机**：离线 / 离开 / 空闲 / 振铃 / 忙 / **话后处理**（Wrapup，未接自动进入）/ 示勿扰，配合签入签出与坐席大屏。

**社区版（自主实现）**：没有坐席注册表，`skill_groups` 不会自动匹配——技能调度逻辑归你的程序，PBX 提供的抓手是**事件 + `queue.assign_agent`**：

```javascript
// 你的技能调度器：订阅事件，自行决定谁接
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.event_type === "call_created" && isCustomerCall(msg)) {
    myRegistry.enqueue({ callId: msg.call_id, skills: inferSkills(msg) }); // 你的坐席/技能库
  }
  if (msg.event_type === "call_hangup" && isAgentCall(msg)) {
    myRegistry.setFree(msg.agent_id);          // 维护坐席忙闲
  }
};

function dispatch() {
  const job = myRegistry.pickWaiting();        // 你的匹配策略：技能 AND、优先级、最长空闲…
  if (job) ws.send(JSON.stringify({ action: "queue.assign_agent", action_id: `a-${job.callId}`,
    params: { call_id: job.callId, agent_id: job.agentId } }));
}
```

也就是说：**队列的排队、振铃、保持、兜底交给 PBX**，「哪个坐席来接」由你的调度器决定后用 `queue.assign_agent` 指派。坐席忙闲可以订阅 `call_answered` / `call_hangup` 自行维护，或直接查询你自己的业务库。这个模式同样适合做回归回访、指定客服接续（老客户找上次的服务商）等 CC 版之外的定制调度。

## 与报表的联动

队列数据进入控制台报表：队列标签、排队时长分布、接通率；CDR 记录呼叫的队列停留时间与最终分配结果。CC 版另有坐席面板与 SLA 报表。自建调度器时，你的分配决策可通过 `call.set_userdata` 写入呼叫，随 CDR 一并落库，见 [通话控制](/api/call-control)。

## 常见问题

- **`queue.enqueue` 了但没人响？** 检查队列的 `strategy.targets` 是否有空闲坐席、`wait_timeout_secs` 是否过短；看 `queue_candidates_found` 是否产生——没有候选说明坐席全忙或列表为空。
- **坐席没接会不会丢？** 不会：未接产生 `queue_agent_no_answer` 后按队列重试策略（`retry_interval_secs` / `max_retries`）继续分配，或触发 `queue.fallback` 兜底。
- **技能组到底 community 版有没有？** 事件与命令（`skill_groups` 字段）社区版都有，但**匹配引擎在 CC 版**；社区版按上文「自主实现」模式，用 `queue.assign_agent` 落地你的匹配逻辑。
- **排队人数太多想劝退？** 订阅 `queue_position_changed`，位次超过阈值时 `media.play` 播报并给出 `queue.dequeue` 或转留言的选择——等待体验策略归你的代码。
- **同振还是顺振？** `strategy.mode = "parallel"` 班组全响（先接者赢），`"sequential"` 逐个兜底；两种模式的语义细节见 [同振](/development/simultaneous-ring) / [顺振](/development/sequential-ring)。
