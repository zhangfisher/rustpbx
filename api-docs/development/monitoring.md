# 监听与督导

监听与督导（Supervisor）：**主管对一通坐席通话的四种介入方式**——静默监听、耳语指导、强插发言、接管顶替，外加随时退出。典型场景：呼叫中心质检、新人陪练、投诉升级接管。

全部由 RWI 命令实现，媒体面用一个内部多方会议（MCU）按模式控制「谁能听到谁」。

## 五个动作

| 命令 | 模式 | 语义 | 主叫听到主管？ | 坐席听到主管？ |
|---|---|---|---|---|
| `supervisor.listen` | 监听 | 主管只听，双方**完全无感知** | ❌ | ❌ |
| `supervisor.whisper` | 耳语 | 只有**坐席**能听到主管（指导话术） | ❌ | ✅ |
| `supervisor.barge` | 强插 | 三方混音，等同临时三方通话 | ✅ | ✅ |
| `supervisor.takeover` | 接管 | 主管**顶替坐席**，坐席腿被挂断，客户无感继续与主管通话 | ✅ | （已退出） |
| `supervisor.stop` | 退出 | 结束督导，恢复原通话状态 | — | — |

::: tip 强插 vs 三方通话
`supervisor.barge` 与 `conference.merge` 都能三方互通，但强插挂断的是**督导关系**（`supervisor.stop` 即恢复原状），语义属质检场景；标准三方（三路平等）用 `conference.merge`，见 [多方会议](/development/conference-room)。
:::

## 前置条件：主管必须先有一通真实呼叫

`supervisor_call_id` **不是随便填的标签**——它必须是一个**已经存在的活动呼叫**：

1. 主管先用话机 / 软电话呼叫 PBX（或被呼叫）建立一条普通通话腿；
2. 你的程序通过 `session.subscribe` / `session.attach_call` 拿到这通「主管腿」的 `call_id`；
3. 之后才能对该 `call_id` 下发督导命令。

PBX **不会替你外呼一条主管腿**，`supervisor_call_id` / `target_call_id` 查不到活动呼叫都会返回 `CallNotFound`。

| 参数 | 必填 | 说明 |
|---|---|---|
| `supervisor_call_id` | ✅ | 主管腿的 Call-ID 或 `session_id` |
| `target_call_id` | ✅ | 被督导坐席通话的 Call-ID 或 `session_id` |
| `agent_leg` | whisper / barge 可选 | 显式指定坐席腿；同时让督导事件扇出给坐席侧连接 |

## 命令示例

```json
{ "action": "supervisor.listen",  "action_id": "s1",
  "params": { "supervisor_call_id": "<主管腿>", "target_call_id": "<坐席通话>" } }

{ "action": "supervisor.whisper", "action_id": "s2",
  "params": { "supervisor_call_id": "…", "target_call_id": "…", "agent_leg": "callee" } }

{ "action": "supervisor.barge",   "action_id": "s3",
  "params": { "supervisor_call_id": "…", "target_call_id": "…", "agent_leg": "callee" } }

{ "action": "supervisor.takeover","action_id": "s4",
  "params": { "supervisor_call_id": "…", "target_call_id": "…" } }

{ "action": "supervisor.stop",    "action_id": "s5",
  "params": { "supervisor_call_id": "…", "target_call_id": "…" } }
```

## 典型督导流程

新人坐席陪练是四个模式的经典串联——主管从「听」渐进到「说」：

```
supervisor.listen    ← 开工：静默质检
supervisor.whisper   ← 坐席卡壳：耳语提示话术（客户听不到）
supervisor.barge     ← 需要出面：直接加入对话
supervisor.stop      ← 客户安抚完：退出，坐席继续
```

每一步直接下发新命令即可，PBX 把主管腿接入对应模式的内部会议（`supervisor-{主管}-{目标}`），媒体按模式重新接线。**接管（takeover）是不可逆动作**——坐席腿会被直接 BYE，之后用 `supervisor.stop` 只是让主管退出，坐席不会自动回来。

## 媒体实现细节

- 四种模式都在 PBX 内部建一个**督导专用会议**（MCU 混音），主管腿、坐席腿、客户腿按模式接入；
- **listen / whisper 的「单向」由混音增益保证**：listen 模式主管到两方的增益为 0（只听不说）；whisper 模式主管到客户增益为 0、到坐席为 1（只有坐席听到）；
- **接管时坐席腿被置为结束**并对坐席话机发 SIP BYE，同时 PBX 会抑制「坐席挂断 → 级联挂断客户」的连锁，客户只感到对话对象换了个声音；
- 被督导通话的媒体本来就锚定在 PBX（坐席 / 队列场景默认锚定），无需额外配置；若该通话处于媒体旁路，督导命令会失败。

## 事件与观测

| 事件 | 触发 | 载荷 |
|---|---|---|
| `supervisor_listen_started` | 监听开始 | `supervisor_call_id`、`target_call_id` |
| `supervisor_whisper_started` | 耳语开始 | 同上 |
| `supervisor_barge_started` | 强插开始 | 同上 |
| `supervisor_takeover_started` | 接管开始 | 同上 |
| `supervisor_mode_stopped` | 督导结束 | 同上 |

事件扇出给三方 owner 连接：主管腿、被督导通话、（指定了 `agent_leg` 时的）坐席腿——坐席大屏、质检系统订阅任意一方即可感知督导状态。此外每次督导动作都会写一条 `supervisor_action` 审计日志（含动作、双方 call_id、结果），供后台审计。

## 常见问题

- **主管说话双方都听到了，不是耳语？** 确认下发的命令是 `supervisor.whisper` 而不是 `supervisor.barge`；两种模式命令一旦发错，用再次下发正确命令纠正即可。
- **`CallNotFound`？** 两个 call_id 都必须是**当前活动呼叫**：主管腿要先把电话打通，坐席通话要没挂断；Call-ID 与 `session_id` 都可以传。
- **接管后坐席话机显示什么？** 坐席腿收到 BYE 正常挂断；客户侧无感。
- **监听合规？** 监听 / 耳语对通话双方无感知，是否需要播报「通话正在被监听」由你的业务决定（可对督导目标腿 `media.play` 一段提示音）；审计日志已内建。
- **权限**：建议为督导类 token 分配独立 scope（如 `supervisor.control`），与普通呼叫控制 token 分离，见 [RWI 实时接口](/interfaces/rwi#token-配置)。
