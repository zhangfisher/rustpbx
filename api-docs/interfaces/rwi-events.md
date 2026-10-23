# RWI 事件参考

事件与命令响应共用同一条 WebSocket 下行通道。先用 `session.subscribe`（`params.context`）订阅上下文后开始接收。

事件信封：

```json
{
  "action": "call_answered",
  "action_id": "evt-...",
  "params": { "session_id": "01J...", "call_id": "...", ... }
}
```

以下按领域列出全部事件。事件定义位于 `src/rwi/event.rs`。

## 呼叫生命周期

| 事件 | 触发 | 主要载荷 |
|---|---|---|
| `call_created` | 呼叫建立 | `session_id`、`call_id`、`direction`、`from`、`to` |
| `call_ringing` | 被叫振铃 | `session_id`、leg 信息 |
| `call_answered` | 接通 | `session_id`、`answered_at` |
| `call_hangup` | 挂机 | `reason`、`hangup_by`（caller/agent/system/transfer/unknown）、`sip_status`、`duration_secs` |
| `call_no_answer` | 无应答 | `session_id` |
| `call_busy` | 被叫忙 | `session_id` |
| `call_error` | 呼叫错误 | 错误详情 |
| `call_unbridged` | 桥接拆除 | `session_id` |

## 转接

| 事件 | 说明 |
|---|---|
| `call_transferred` | 转接完成 |
| `call_transfer_accepted` | 对端接受转接 |
| `call_transfer_failed` | 转接失败 |
| `consult_switched` | 咨询腿切换 |
| `conference_auth_result` | 转接/会议鉴权结果 |

## 保持与媒体

| 事件 | 说明 |
|---|---|
| `call_held` / `call_unheld` | 保持 / 恢复 |
| `media_hold_started` / `media_hold_stopped` | 媒体保持 |
| `media_play_started` / `media_play_finished` | 放音开始 / 结束 |

## DTMF

| 事件 | 说明 |
|---|---|
| `dtmf` | 单个按键 |
| `dtmf_collected` | `dtmf.collect` 收集完成（返回数字串） |
| `dtmf_collection_timeout` | 收集超时 |

## 录音

| 事件 | 说明 |
|---|---|
| `record_started` / `record_paused` / `record_resumed` / `record_stopped` | 录音控制 |
| `record_end` | 录音结束 |
| `recording_metadata_available` | 片段上传完成（含存储 URL、时长、片段类型 full/ivr/agent/ringing…） |

## 转写

| 事件 | 说明 |
|---|---|
| `transcript_started` | 转写开始 |
| `transcript_segment` | 增量文本段（`interim`） |
| `transcript_final` | 整句定稿（订阅它做「一句一 POST」的 Webhook） |
| `transcript_ended` | 转写结束 |
| `transcript_error` | 转写错误 |

## 队列

| 事件 | 说明 |
|---|---|
| `queue_joined` / `queue_left` | 入队 / 离队 |
| `queue_position_changed` | 排队位次变化 |
| `queue_agent_offered` | 向坐席发起（振铃） |
| `queue_agent_connected` | 坐席接起 |
| `queue_agent_no_answer` / `queue_agent_rejected` | 坐席未接 / 拒接 |
| `queue_overflow_joined` | 溢出入队 |
| `queue_wait_timeout` | 等待超时 |
| `queue_candidates_found` | 匹配到候选坐席 |
| `queue_fallback_executed` | 溢出 / 回退策略执行 |
| `realtime_event` | 队列实时遥测 |

## 会议

| 事件 | 说明 |
|---|---|
| `conference_joined` / `conference_left` | 参会 / 离会 |
| `conference_member_joined` / `conference_member_left` | 成员进出 |
| `conference_member_muted` / `conference_member_unmuted` | 静音状态 |
| `conference_merge_requested` / `conference_merged` / `conference_merge_failed` | 合并三方 |

## 变量与用户数据

| 事件 | 说明 |
|---|---|
| `call_userdata_updated` | `call.set_userdata` 触发，携带业务数据 |

## IVR

| 事件 | 说明 |
|---|---|
| `ivr_node_entered` / `ivr_node_exited` | 进出 IVR 节点 |
| `ivr_flow_completed` | IVR 流程完成 |
| `ivr_step_trace` | 步模式逐步执行轨迹 |

## SIP 直通

| 事件 | 说明 |
|---|---|
| `sip_message_received` | 收到 SIP MESSAGE |
| `sip_notify_received` | 收到 NOTIFY |

## AI（realtime）

`realtime_event` 携带 AI 通话的转写、函数调用、barge-in（打断）等遥测，详见 [AI 语音与 TTS](/features/ai)。

## 上下文增强

事件 payload 会自动合并上下文信息（如 `direction`、坐席标识），但**不会覆盖**已有的同名键——你可以放心在事件源头写入业务字段。

## 关联建议

- 用 `session_id` 串联一通逻辑呼叫的全部事件（含转接前后）；
- 用 `call_id` 定位具体 SIP leg；
- `call_hangup` 事件到达后，CDR 落库与录音上传可能稍有延迟，`recording_metadata_available` 是「录音就绪」的可靠信号。
