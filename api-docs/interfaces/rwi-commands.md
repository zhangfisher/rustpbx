# RWI 命令参考

所有命令共用信封：

```json
{ "action": "<命令名>", "action_id": "<任意关联 id>", "params": { ... } }
```

响应为 `command_completed` / `command_failed`，回带 `action_id`。以下按分组列出核心命令与主要参数。

## 会话管理

| 命令 | params | 说明 |
|---|---|---|
| `session.subscribe` | `context` | 订阅事件上下文（如 `"global"`） |
| `session.unsubscribe` | `context` | 取消订阅 |
| `session.attach_call` | `session_id` / `call_id` | 把已有呼叫挂到本连接管理 |
| `session.list_calls` | — | 列出本连接关联的呼叫 |
| `session.detach_call` | `session_id` | 摘除关联 |
| `session.resume` | `session_id` | 恢复管理（断线重连后） |

::: tip 连接生命周期
连接断开后，其管理的孤儿呼叫默认保持 `orphan_hold_secs`（30s）再释放；`session.attach_call` + `session.resume` 可在重连后接管回来。
:::

## 呼叫控制

| 命令 | 关键 params | 说明 |
|---|---|---|
| `call.originate` | `destination`、`caller_id`、`timeout_secs`、`extra_headers`、`trunk`、`route_originated_calls`、`record` | 主动外呼 |
| `call.answer` | `call_id` | 接听 |
| `call.reject` | `call_id`、`reason`（`busy` / `decline` / `unavailable` / `reject`，映射 486 / 603 / 480 / 403，缺省 603） | 拒接 |
| `call.ring` | `call_id` | 振铃指示 |
| `call.hangup` | `call_id`、`reason`、`code` | 挂断 |
| `call.bridge` / `call.unbridge` | `call_id`（bridge 另有 `leg_a` / `leg_b`） | 桥接 / 拆桥 |
| `call.leg_add` / `call.leg_remove` | `call_id` | 多腿管理 |

`call_id` 传 Call-ID 或 `session_id` 均可（活动通话注册表两者都索引）。

`call.originate` 的三个重要参数：

- **`trunk`**：显式指定出局中继——直接套用该中继的 next-hop / transport / 凭据 / 改写 / P-Asserted-Identity，**不**走路由表；
- **`route_originated_calls`**：设为 `true` 则按路由表决策（默认直接拨）；
- **`record`**：自动开启录音。

```json
{
  "action": "call.originate",
  "params": {
    "destination": "sip:+8613800@trunk",
    "caller_id": "010-88888888",
    "timeout_secs": 45,
    "trunk": "wuhoo",
    "record": true
  }
}
```

## 转接

| 命令 | 关键 params | 说明 |
|---|---|---|
| `call.transfer` | `call_id`、`target` | 盲转（SIP REFER，失败自动回退 B2BUA 转接） |
| `call.transfer.attended` | `call_id`、`target` | 咨询转接（先建立咨询腿，响应返回 `consultation_call_id`） |
| `call.transfer.complete` | `call_id`、`consultation_call_id` | 完成咨询转接 |
| `call.transfer.cancel` | `consultation_call_id` | 取消咨询腿 |
| `call.transfer.replace` | `call_id`、`target` | Replaces 语义替换（席位替换 / 出席转接） |

详见 [呼叫转移](/development/call-transfer)。

## 保持与媒体

| 命令 | 关键 params | 说明 |
|---|---|---|
| `call.hold` / `call.unhold` | `session_id` | 保持 / 恢复 |
| `call.set_ringback_source` | `source` | 自定义回铃音源 |
| `media.play` | `source`（`{source_type, uri, looped}`）、`interrupt_on_dtmf`、`leg_id` | 放音（文件 / http / tts） |
| `media.stop` | `session_id` | 停止放音 |
| `call.send_dtmf` | `session_id`、`digits` | 发送 DTMF |
| `dtmf.collect` | `min_digits`（默认 1）、`max_digits`（默认 16）、`timeout_ms`（默认 10000）、`terminator` | 收集 DTMF，结果走 `dtmf_collected` 事件 |

## 录音

| 命令 | 说明 |
|---|---|
| `record.start` | 开始录音（可带分段标签） |
| `record.pause` / `record.resume` | 暂停 / 续录 |
| `record.stop` | 停止并落盘上传 |

上传完成后每片段产生 `recording_metadata_available` 事件。

## 队列

| 命令 | 说明 |
|---|---|
| `queue.enqueue` | 呼叫入队（含 `skill_groups` 技能组匹配） |
| `queue.dequeue` | 出队 |
| `queue.hold` / `queue.unhold` | 队内保持 |
| `queue.set_priority` | 调整队列优先级 |
| `queue.assign_agent` | 指定坐席 |
| `queue.requeue` | 重新入队（如坐席未接） |

配合事件：`queue_joined` / `queue_position_changed` / `queue_agent_offered` / `queue_agent_connected` / `queue_wait_timeout` 等。

## 监听与强插（Supervisor）

| 命令 | 关键 params | 说明 |
|---|---|---|
| `supervisor.listen` | `supervisor_call_id`、`target_call_id` | 静默监听（坐席与客户无感知） |
| `supervisor.whisper` | 同上（+ 可选 `agent_leg`） | 耳语（只有坐席听到主管） |
| `supervisor.barge` | 同上（+ 可选 `agent_leg`） | 强插（三方都听到） |
| `supervisor.takeover` | `supervisor_call_id`、`target_call_id` | 接管通话（顶替坐席，坐席腿被挂断） |
| `supervisor.stop` | `supervisor_call_id`、`target_call_id` | 结束旁路会话 |

`supervisor_call_id` 必须是主管已建立的活动呼叫。详见 [监听与督导](/development/monitoring)。

## 会议

| 命令 | 说明 |
|---|---|
| `conference.create` | 创建会议 |
| `conference.add` / `remove` | 加入 / 移除成员 |
| `conference.mute` / `unmute` | 静音 / 取消静音 |
| `conference.merge` | 合并另一通话（三方会议） |
| `conference.seat_replace` | 席位替换 |
| `conference.destroy` / `end` | 解散 / 结束 |

## 应用与变量

| 命令 | 说明 |
|---|---|
| `call.app_start` / `call.app_stop` | 启动 / 停止呼叫应用（如 `realtime` AI） |
| `app.chain` | 链式应用 |
| `call.set_var` / `call.get_var` | 呼叫变量 |
| `call.set_userdata` / `call.get_userdata` | 业务自定义数据（触发 `call_userdata_updated` 事件） |

## SIP 直通

| 命令 | 说明 |
|---|---|
| `sip.message` | 发送 SIP MESSAGE |
| `sip.notify` | 发送 NOTIFY |
| `sip.options_ping` | OPTIONS 心跳 |

收到对端消息时产生 `sip_message_received` / `sip_notify_received` 事件。
