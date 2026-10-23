# 媒体、录音与 CDR

## 录音（[recording]）

`enabled` 是总开关，`type` 决定媒体被捕获到哪里：

| type | 去向 |
|---|---|
| `local`（默认） | WAV 文件（`path`，按 `daily`/`hourly` 子目录归档） |
| `http` | 声明式 multipart 上传到任意 HTTP 接口 |
| `s3` | S3 兼容对象存储（可按来源分桶） |
| `sipflow` | 写入 SipFlow 后端（RTP 全量捕获） |

```toml
[recording]
enabled = true
auto_start = true
auto_start_at = "media"      # "media"（默认，媒体就绪即录）| "answer"（等 200）
# auto_start_except = ["ivr"]   # 豁免的应用（如 IVR 阶段不自动录）
# type = "local"
# path = "./config/recorders"
# subdir = "daily"           # daily | hourly

# 上传失败重试（写 .upload_failed 标记，后台 worker 扫描重试）
# retry_interval_secs = 60
# retry_max_attempts = 30
# upload_sla_secs = 600      # 完成 SLA，导出为 Prometheus 指标
```

### 分段录音

```toml
[recording]
auto_start = false           # 默认不录，由 IVR record_start / RWI record.start 按需开片段
```

- 片段命名 `{root_session_id}_{seq}_{label}.wav`，label 从呼叫上下文解析（坐席 id / IVR 名 / 片段类型）；
- 应用范围的 IVR 片段在会话移交（转接 / 入队 / IVR 跳转）时自动关闭，坐席阶段另起新片段；
- CDR 的 `metadata.recording_segments` 列出全部片段，每片段上传后发一条 `recording_metadata_available` 事件；
- **即使 `enabled = false`，媒体腿仍带采集 tap，随时可按需录音。**

### S3 模式

```toml
[recording]
type = "s3"
# access_key / secret_key 可同时留空（匿名访问公共桶）
signed_url_expiry_secs = 86400    # 控制台按需生成预签名下载 URL（最长 7 天）

# 按来源分桶（source: full / ivr / agent / consult / ringing / external）
[recording.sources.agent]
bucket = "isc_sr"
endpoint = "https://v2-isc.example.com"
access_key = "..."
secret_key = "..."
root = "agent"
```

### HTTP 模式（声明式上传）

```toml
[recording]
type = "http"
url = "https://archive.example.com/recording"    # 可含 {key}
headers = { Authorization = "Bearer token" }
method = "POST"
file_field = "recording"          # multipart 字段名
content_type = "audio/wav"
fields = { call_id = "{call_id}", track_id = "{track_id}" }
response_url_path = "data.url"    # 从响应 JSON 提取存储 URL
response_success = { path = "code", equals = 0 }
```

## CDR（[callrecord]）

CDR 默认写主库的 `rustpbx_call_records` 表——**即使没有 `[callrecord]` 段**。该段用于改道、外置或禁用：

```toml
[callrecord]
type = "database"           # database（默认）| local | s3 | http
# database_url = "postgres://user:pass@cdrhost/cdrs"   # 外置数据库
# table_name = "my_cdrs"
# skip_create_table = true
# rotate = "daily"          # SQLite 按日分文件：cdr.db → cdr-20260722.db
channel_capacity = 2048
batch_size = 16

# 文件 sink（无控制台查询支持）
# type = "local"
# root = "./config/cdr"
```

::: warning 外置存储的取舍
改用非默认数据库 / 表 / 轮转后，Web 控制台与插件（cc、wholesale、archive）的 CDR 查询**看不到**这些数据——它们只查主表。这是外置 / 轮转 CDR 存储的已知取舍。
:::

## 视频策略

```toml
# 视频编解码白名单（仅透传中继，不做视频转码）
# video_codecs = ["H264", "VP8"]

# 媒体面视频策略：pass_through（默认，双方有公共 codec 即中继）
# / strip（丢弃视频只留音频）/ transcode（预留，暂同 pass_through）
# video_policy = "pass_through"
```

## 媒体代理模式

```toml
[proxy]
# auto（默认）| all | nat | none | bypass —— PBX 是否锚定媒体
media_proxy = "auto"
```

- 录音、转码、监听、AI 参与都要求锚定；
- `auto` 下 IVR / 队列等应用流程自动锚定，纯分机互拨可旁路；
- 按中继可覆盖（`media_mode`）。

## 实时转写（流式 ASR）

```toml
[proxy.transcript.remote]
# api_key = "your-key"          # 兜底读 DEEPGRAM_API_KEY
# url = "wss://api.deepgram.com"
# model = "nova-2"
# language = "multi"
# interim_results = true
# punctuate = true
# provider = "deepgram"         # 内置 Deepgram 兼容协议；可注册自定义 provider
# auto_start = false            # 接通即自动开始转写

# 每句定稿推送到你的服务（订阅 transcript_final 事件即可）
# [rwi_webhook]
# url = "https://your-service.example.com/hook"
# events = ["transcript_final"]
```

## 音频编解码

```toml
# 音频编解码白名单
# audio_codecs = ["pcma", "pcmu", "g722", "opus"]
```

相同 codec 走零拷贝中继快速路径；不同 codec 自动转码（解码 → 重采样 → 重编码）。
