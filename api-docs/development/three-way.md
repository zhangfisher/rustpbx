# 三方通话

三方通话 = **三路媒体同时互通**（A、B、C 互相听到）。RustPBX 的媒体面里，两腿通话走 `MediaBridge`（只能桥两条腿），三路及以上必须走**会议 MCU 混音器**（`conference_mixer`）。因此三方通话 = 建一个三人会议，而不是三段两两桥接。

程序化入口只有 **RWI WebSocket**（REST 通话命令没有三方动作）。

## 方式一：咨询后合并（推荐）

坐席接到 A，先咨询 B，接通后再把两通合成三方：

**1. 咨询腿**

```json
{ "action": "call.transfer.attended", "action_id": "t1",
  "params": { "call_id": "<A 与坐席的 Call-ID 或 session_id>",
              "target": "sip:1002@internal",
              "timeout_secs": 30 } }
```

`command_completed.data` 返回：

```json
{ "original_call_id": "…", "consultation_call_id": "…" }
```

**2. 建会议**

```json
{ "action": "conference.create", "action_id": "c1",
  "params": { "conf_id": "room-20261023-001", "max_members": 3 } }
```

响应 `data`：`{ "conf_id": "room-…" }`（`conf_id` 省略时自动生成）。

**3. 合并两通**

```json
{ "action": "conference.merge", "action_id": "m1",
  "params": {
    "conf_id": "room-20261023-001",
    "call_id": "<original_call_id>",
    "consultation_call_id": "<consultation_call_id>"
  } }
```

PBX 会把两腿都加入会议（若尚未加入会自动 `conference.add`），并**对两腿执行 `unhold`** 保证媒体畅通，随后三方进入同一混音器。

**4. 结束**

```json
{ "action": "conference.end",     "params": { "conf_id": "room-…", "host_call_id": "<主持人 call_id>" } }
{ "action": "conference.destroy", "params": { "conf_id": "room-…" } }
```

::: tip 与「出席转接」的区别
`call.transfer.complete` 是把两通**合成一路**（A 被转走，只剩 B+C）；`conference.merge` 是把两通**合成三方**（A、B、C 同时在）。选错命令是三方通话最常见的问题。
:::

## 方式二：两通独立通话 + 第三方

你已经分别持有两通通话时，用 `conference.add` 逐个拉进会议：

```json
{ "action": "conference.create", "params": { "conf_id": "room-1", "max_members": 3 } }

{ "action": "conference.add",
  "params": { "conf_id": "room-1", "call_id": "<通话一>" } }

{ "action": "call.originate",
  "params": { "destination": "sip:1003@internal", "timeout_secs": 30,
              "record": { "mode": "mixed" } } }

{ "action": "conference.add",
  "params": { "conf_id": "room-1", "call_id": "<通话二>" } }
```

::: tip 参数名
RWI 的 `conference.*` 命令参数用 **`conf_id`**；只有 `conference.create` 额外接受 `conference_id` 作为别名。`conference.create` 还支持 `max_members`、`host_call_id`、`max_duration_secs`，没有 `name` / `record` 字段。
:::

## 方式三：强插（supervisor.barge）

| 命令 | 语义 | 是三方吗 |
|---|---|---|
| `supervisor.listen` | 静默监听，双方无感知 | ❌ 主管只听 |
| `supervisor.whisper` | 耳语，只有坐席听到主管 | ❌ |
| `supervisor.barge` | 主管加入双方通话，三方都听到 | ⚠️ 是三方混音，但属督导场景，主管挂断即恢复 |
| `conference.merge` | 三路平等地合成一个会议 | ✅ 标准三方 |

## 事件与观测

| 事件 | 说明 |
|---|---|
| `consult_switched` | 咨询腿切换 |
| `conference_merge_requested` | 合并开始 |
| `conference_merged` | 合并成功（三方互通） |
| `conference_merge_failed` | 合并失败（带 `reason`），**不会静默丢通话** |
| `conference_member_joined` / `conference_member_left` | 成员进出 |
| `conference_error` | 会议错误 |

全部命令响应与事件见 [RWI 命令参考](/interfaces/rwi-commands) / [RWI 事件参考](/interfaces/rwi-events)。

## 前置条件与已知限制

- **权限**：RWI token 的 `scopes` 需包含呼叫控制与会议（`["*"]` 或对应范围），见 [RWI 实时接口](/interfaces/rwi#token-配置)；
- **会议工厂 URI 是可选的**：`[proxy] conference_factory_uri` 只用于**话机直接拨入会议**（`sip:1234@conference@host`），RWI 的 `conference.*` 命令不依赖它，见 [电话会议](/features/conference)；
- **媒体必然锚定**：会议成员的 RTP 经 MCU 混音，无法旁路；
- **静音是部分实现**：`conference.mute` / `conference.unmute` 会发事件，但当前**未真正静音混音器音频**（见 [RWI 协议](/guide/rwi) 的实现状态表）；
- **CDR 归属**：咨询腿与原腿共享同一 `session_id`，用它串联三路的 CDR 与事件，见 [session_id 关联模型](/guide/session-id)；
- **会议成员的录音**：成员本来就是普通通话腿，是否录音跟随全局 `[recording]`（`auto_start`）或你用 RWI `record.start` 对单腿开启，详见 [录音录像](/development/recording)。
