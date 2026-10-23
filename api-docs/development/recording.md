# 录音录像

本篇讲**音频录音**的二次开发：什么时候录、怎么按需分段、录音送到哪里、怎么拿到文件。文末说明当前版本「视频录像」的能力边界。

## 能力总览

| 能力 | 状态 | 入口 |
|---|---|---|
| 整通自动录音 | ✅ 内建 | `[recording]` 配置 |
| 按需分段录音（IVR 段 / 咨询段 / 坐席段…） | ✅ 内建 | RWI `record.*` |
| 路由时决定是否录音 | ✅ 内建 | HTTP Router `record` / `record_start_at` |
| 暂停 / 续录 / 停止 | ✅ 内建 | RWI `record.*` / REST 录音控制 |
| 录音推送到你的存储 | ✅ 内建 | `local` / `http` / `s3` / `sipflow` + Recording Upload Webhook |
| 分轨（主叫 / 被叫分开两个文件） | ✅ 内建 | `record.start` 的 `mode` |
| **视频文件录像** | ❌ 不提供 | 见文末「录像（视频）」 |

::: warning 前提：媒体必须锚定
录音要求 RTP 经过 PBX（锚定）。媒体旁路（bypass）模式下录音会以 `recording not supported in bypass mode` 失败。`media_proxy = "auto"`（默认）时 IVR / 队列等应用流程会自动锚定，见 [媒体代理模式](/config/media#媒体代理模式)。
:::

## 方式一：全局自动录音（配置驱动）

```toml
[recording]
enabled = true
auto_start = true
auto_start_at = "media"      # media（默认，媒体就绪即录）| answer（等 200 OK）
# auto_start_except = ["ivr"]   # 豁免的应用，如 IVR 阶段不自动录
# type = "local"              # local | http | s3 | sipflow
# path = "./config/recorders"
# subdir = "daily"            # daily | hourly
```

`type` 决定媒体去向：`local` 落 WAV、`http` 声明式 multipart 上传、`s3` 写对象存储、`sipflow` 走 RTP 全量捕获。完整配置见 [媒体、录音与 CDR](/config/media)。

## 方式二：按需分段录音（RWI，最灵活）

```toml
[recording]
enabled = true
auto_start = false           # 默认不录，由你的程序按需开片段
```

```json
{ "action": "record.start", "action_id": "r1",
  "params": {
    "call_id": "<Call-ID 或 session_id>",
    "mode": "mixed",
    "beep": true,
    "max_duration_secs": 600,
    "storage": { "path": "" },
    "segment_type": "agent",
    "label": "post-sale"
  } }
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `call_id` | — | 目标通话（Call-ID 或 `session_id` 均可） |
| `mode` | `mixed` | `mixed` 单文件混音 / `separate_legs` 主被叫两个文件 |
| `beep` | — | 开始时播提示音 |
| `max_duration_secs` | — | 到时自动停止 |
| `storage.path` | 空 | 覆盖输出路径；留空用 `[recording].path/{call_id}.wav` |
| `segment_type` | — | 片段标签（`ivr` / `consult` / `ringing` …），决定 `source` 分类 |
| `id` | 自动生成 | 片段唯一 id |
| `label` | 从上下文解析 | 参与生成文件名 `{session_id}_{seq}_{label}.wav` |

配套命令与事件：

| 命令 | 事件 |
|---|---|
| `record.start` | `record_started`（带 `unique_id`） |
| `record.pause` / `record.resume` | `record_paused` / `record_resumed` |
| `record.stop` | `record_stopped` → `record_end` → `recording_metadata_available` |

`unique_id` 在 `record_started` / `record_stopped` / `recording_metadata_available` 三条事件中相同，用来把一次录音的三个阶段对上号。

## 方式三：REST 命令（低频管理）

```http
POST {api_prefix}/calls/active/{session_id}/commands
```

```json
{ "action": "start_recording", "path": "optional/dir", "format": "wav" }
{ "action": "stop_recording" }
{ "action": "pause_recording" }
{ "action": "resume_recording" }
```

权限 `callcontrol:command`，详见 [通话控制](/api/call-control#录音控制)。

## 方式四：路由时决定（HTTP Router）

你的路由服务在返回呼叫去向的同时控制录音：

```json
{
  "action": "forward",
  "targets": ["sip:1001@internal"],
  "record": true,
  "record_start_at": "media"
}
```

`record_start_at` 覆盖全局 `[recording].auto_start_at`；只返回 `record_start_at` 而不返回 `record` 时保留全局启用策略、只改起录时机。外呼侧 RWI `call.originate` 也可带 `record`（**对象**，与 `record.start` 同参数，`call_id` 字段忽略）：

```json
{ "action": "call.originate",
  "params": { "destination": "sip:+8613800@trunk", "record": { "mode": "mixed" } } }
```

## 拿到录音文件

| 途径 | 说明 |
|---|---|
| `recording_metadata_available` | **录音就绪的可靠信号**：`metadata.download_url`、`filename`、`file_size`、`source`（`ivr` / `agent` / `consult` / `ringing` / `voicemail` / `full` / `external`）、`full`（整通聚合载荷为 `true`，分段为 `false`） |
| `record_end` | `url` / `duration_secs` / `file_size` |
| Recording Upload Webhook | 通话结束后 `multipart/form-data` 推给你的服务（`recording` 字段 + `call_id` / `track_id`），见 [API 集成指南](/guide/api-integration#1-4-cdr-事件推送与录音上传) |
| `GET {api_prefix}/call-records/{id}/recording?stream=&segment=` | 按 CDR 主键拉流播放 / 下载，`stream` 可选 `A` / `B` / `mixed` / `caller` / `callee`，见 [录音播放与下载](/api/recording) |
| `GET {api_prefix}/call-records/by-session/{session_id}/artifacts` | 一通逻辑呼叫的全部录音分段 + SipFlow 产物清单 |
| CDR | `recording_url` / `recording_duration_secs` / `metadata.recording_segments` |

::: tip `call_hangup` 不等于「录音已上传」
挂机事件到达后，CDR 落库与录音上传可能还有延迟——以 `recording_metadata_available` 为准。
:::

## 录像（视频）

当前版本**不提供视频文件的录制与导出**：

| 面向 | 现状 |
|---|---|
| 视频协商 / 透传 | ✅ 支持：`video_codecs = ["H264", "VP8"]`，`video_policy = "pass_through"`（默认，双方有公共 codec 即中继）/ `strip`（丢视频留音频）/ `transcode`（预留，暂同 pass_through） |
| 视频锚定中继 | ✅ 支持（WebRTC 话机之间的视频可经 PBX 中继） |
| 音频录音管道 | 只处理音频（PCM / WAV、`mixed` 与 `separate_legs`） |
| SipFlow | 存 SIP 信令 + RTP 包，**音频**可导出 WAV；不提供视频导出 |
| 视频落盘（MP4 等） | ❌ 未实现 |

需要「录像」时的两条二次开发路径：

1. **客户端录制（推荐）**：保持 `video_policy = "pass_through"`，由你的 WebRTC 页面 / 软电话在终端录制视频并上传到你的存储——PBX 只负责把视频流中继到位；
2. **服务端视频落盘（定制开发）**：在 `crates/rustpbx-media` 的媒体路径上扩展视频写盘能力（现有 recorder 只处理音频），属插件级定制，不在开箱能力内。

相关配置见 [视频策略](/config/media#视频策略)。
