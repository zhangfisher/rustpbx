# 通话控制

查询和操控**正在进行**的通话：列表、详情、命令下发与会话 user_data。

- 权限：读取需 `callcontrol:read`，命令与 user_data 写入需 `callcontrol:command`
- 前缀：`{api_prefix}`（默认 `/api`）

## 活动通话列表

```http
GET {api_prefix}/calls/active?limit=50
```

| 查询参数 | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `limit` | int | `50` | 返回条数，夹取到 `1..=500`，按开始时间倒序 |

**200 响应**

```json
{
  "data": [
    {
      "node": "local",
      "meta": { "session_id": "…", "caller": "…", "callee": "…", "started_at": "…" },
      "state": { "…": "通话状态快照（legs/媒体/录制等）" }
    }
  ]
}
```

| 字段 | 说明 |
| :--- | :--- |
| `node` | 数据来源节点；`local` 表示本机，集群模式下可能是对端节点地址 |
| `meta` | 通话元数据（会话 id、主被叫、开始时间等） |
| `state` | 由活动通话注册表生成的实时快照 |

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/calls/active?limit=20" | jq '.data[].meta.session_id'
```

## 单路通话详情

```http
GET {api_prefix}/calls/active/{session_id}
```

**200 响应**：`{"data": {"node": "local", "meta": {...}, "state": {...}}}`

通话不存在或已结束时返回错误状态（`404`）。

## 通话命令

```http
POST {api_prefix}/calls/active/{session_id}/commands
Content-Type: application/json
```

请求体用 `action` 字段（`snake_case`）区分命令：

### hangup — 挂断

```json
{ "action": "hangup", "reason": "admin_kick", "code": 0, "initiator": "admin" }
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `reason` | string | 挂断原因（写入 CDR / SIP Reason 头） |
| `code` | int | SIP 结束码 |
| `initiator` | string | 发起方标识（审计用） |

### accept — 强接听（振铃中的被叫）

```json
{ "action": "accept", "callee": "200", "sdp": "v=0\r\n…" }
```

`accept` 是 `answer` 的别名。`sdp` 为应答 SDP；缺省时由服务端生成。

### transfer — 转接

```json
{ "action": "transfer", "target": "sip:1002@pbx.local", "attended": false }
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `target` | string | 目标 URI（盲转）或已接听的会话（出席转接 `attended: true`） |
| `attended` | bool | 是否出席转接 |

### hold / unhold — 保持与恢复

```json
{ "action": "hold", "leg_id": "leg-a" }
{ "action": "unhold", "leg_id": "leg-a" }
```

`leg_id` 可选，缺省作用于整路通话。

### send_dtmf — 发送按键

```json
{ "action": "send_dtmf", "digits": "123#", "leg_id": "leg-a" }
```

### mute / unmute — 静音

```json
{ "action": "mute", "track_id": "audio-0" }
{ "action": "unmute", "track_id": "audio-0" }
```

`track_id` 为媒体轨标识（如 `audio-0`）。

### play / stop_playback — 放音

```json
{ "action": "play", "source": { "type": "file", "path": "welcome.wav" },
  "leg_id": "leg-a", "interrupt_on_dtmf": true, "loop_playback": false }
```

`source` 是**带 `type` 标签的联合类型**：

| type | 字段 | 说明 |
| :--- | :--- | :--- |
| `file` | `path` | 服务端音频文件路径 |
| `url` | `url` | 远程音频 URL |
| `silence` | — | 静音填充 |
| `tone` | `frequency`、`duration_ms` | 单音信号 |

停止放音：`{ "action": "stop_playback", "leg_id": "leg-a" }`

### 录音控制

```json
{ "action": "start_recording", "path": "optional/dir", "format": "wav" }
{ "action": "stop_recording" }
{ "action": "pause_recording" }
{ "action": "resume_recording" }
```

### 实时转写

```json
{ "action": "start_transcription", "language": "zh-CN" }
{ "action": "stop_transcription" }
```

::: info 依赖与引用计数
实时转写要求配置 `[proxy.transcript.remote]`（流式 ASR）且通话未处于媒体直连（bypass）模式；
采用引用计数：REST 启动、SSE 订阅、auto_start 都会加引用，`stop_transcription` 释放一次引用。
:::

### 响应

| 状态码 | 响应体 |
| :--- | :--- |
| `200` | `{"message":"Command dispatched"}`，部分命令附带 `data` |
| `400` | `{"message":"<命令失败原因>"}` |
| `401` / `403` | 认证或权限（`callcontrol:command`）不足 |
| `404` | 会话不存在或通话已结束 |

## 会话 User Data

给通话附加业务上下文（CRM 工单、客户画像等）。语义为 **replace-all**：
每次写入整体替换，值必须是 JSON 对象，上限 **16 KiB**。

```http
GET    {api_prefix}/calls/active/{session_id}/userdata
PUT    {api_prefix}/calls/active/{session_id}/userdata
```

**PUT 请求体**（任意 JSON 对象）：

```json
{ "crm_id": "C-1001", "customer": { "tier": "gold" } }
```

**200 响应**：`{"message":"User data updated","data":{ ... 写入后的对象 ... }}`

| 状态码 | 场景 |
| :--- | :--- |
| `200` | 写入成功；GET 读取成功（未设置时为 `{}`） |
| `400` | 请求体不是 JSON 对象 |
| `404` | 通话未知或已结束 |
| `413` | 负载超过 16 KiB |

**GET 响应**：`{"data": { ...当前对象... }}`

### 生效范围

- 随后续所有通话相关的 RWI 事件 / Webhook 一起下发（`user_data` 字段）；
- 每次变更广播 `call_userdata_updated` 事件；
- 通话结束时写入 CDR 的 `metadata["user_data"]`；
- 集群内全节点复制（`event_type=user_data`），落在非属主节点的 `PUT`/`GET` 会自动转发到属主节点。
