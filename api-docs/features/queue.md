# 呼叫队列

社区版内置队列引擎（插件 `queue`，始终编译），提供呼叫排队、坐席分配、溢出与等待体验管理。呼叫中心版（CC）在其上增加坐席、技能组、ACD 与大屏。

## 进入队列的三种方式

1. **HTTP Router**：返回 `forward` 指向队列 URI；
2. **静态路由 / Dialplan**：路由目标设为队列（`DialplanFlow::Queue`）；
3. **RWI 命令**：`queue.enqueue` 把任意呼叫放入队列。

## 队列管理

- **控制台**：`/queues` 页面（创建、编辑、启停、导入导出、音频下载）；
- **REST API**：`/api/queues`（插件注入）；
- **配置文件**：`config/queue/*.toml`，支持热重载（`POST /ami/v1/reload/queues`）。

## RWI 队列命令

| 命令 | 说明 |
|---|---|
| `queue.enqueue` | 入队（支持 `skill_groups` 技能组匹配） |
| `queue.dequeue` | 出队 |
| `queue.hold` / `queue.unhold` | 队内保持 |
| `queue.set_priority` | 调整排队优先级 |
| `queue.assign_agent` | 指定坐席 |
| `queue.requeue` | 重新入队（如坐席未接后回队） |

## 队列事件

坐席大屏与调度系统靠这些事件驱动：

| 事件 | 说明 |
|---|---|
| `queue_joined` / `queue_left` | 呼叫入队 / 离队 |
| `queue_position_changed` | 排队位次变化（播报「前面还有 N 位」） |
| `queue_agent_offered` | 向坐席发起（振铃） |
| `queue_agent_connected` | 坐席接起 |
| `queue_agent_no_answer` / `queue_agent_rejected` | 坐席未接 / 拒接 |
| `queue_overflow_joined` | 溢出策略入队 |
| `queue_wait_timeout` | 等待超时 |
| `queue_candidates_found` | 匹配到候选坐席 |
| `queue_fallback_executed` | 溢出 / 回退策略执行 |
| `realtime_event` | 队列实时遥测（等待数、坐席状态） |

## 等待体验

- **等待音乐**：每队列独立配置（`[queue.hold]`），与全局保持音乐（`[proxy] hold_music`）分离；
- **溢出策略**：队列长度 / 等待时间超阈值时转入溢出路由或目标；
- **超时回退**：`queue_wait_timeout` 后执行配置的回退动作。

## 技能组（ACD）

入队时携带 `skill_groups`，按技能匹配坐席分配——呼叫中心版提供完整的技能组管理与 ACD 策略，事件与命令与社区版一致。

## 坐席侧呼叫流

典型坐席接听事件序列：

```
queue_joined → queue_position_changed × N
  → queue_agent_offered（坐席振铃）
  → queue_agent_connected（接通）或 queue_agent_no_answer → queue_requeue
  → call_hangup
```

## 与报表的联动

队列数据进入控制台报表：通话报表中的队列标签、排队时长分布、坐席面板（CC 版）。CDR 中记录呼叫的队列停留时间与分配结果。
