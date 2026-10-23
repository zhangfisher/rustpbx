# AI 语音与 TTS

RustPBX 是 **AI 原生**的：AI 智能体作为通话的**原生参与者**接入——可听、可说、可被打断（barge-in）、可被转接，与人类坐席走完全相同的呼叫控制路径。

## realtime 应用

`realtime` 是一个呼叫应用：在通话与外部实时语音端点（OpenAI Realtime API 或自建 PCM 服务）之间建立**双向音频桥**。

### 四种启动入口

1. **Dialplan**：`action = "application", app = "realtime"`；
2. **出局活动**：`on_answer: { "type": "app", "app_name": "realtime" }`；
3. **IVR 节点**：`EntryAction::StartApp`；
4. **RWI**：`call.app_start`。

```json
{ "action": "call.app_start",
  "params": { "session_id": "01J...", "app": "realtime", "preset": "support-bot" } }
```

### 凭据安全

::: warning 凭据永不出现在调用面
app 参数**只能按名字引用** `[[realtime]]` 预设，永远不能携带 API key。Key 只在会话内部解析（或走 WebSocket upgrade header），不出现在 URL、日志与 CDR 中。
:::

## 预设配置

```toml
[[realtime]]
name = "support-bot"
url = "wss://api.openai.com/v1/realtime"
protocol = "openai"                  # "openai"（默认）或 "pcm"（裸 PCM16 + DTMF JSON）
api_key = "sk-..."
model = "gpt-4o-realtime-preview"
voice = "alloy"
instructions = "You are a phone support agent. Keep replies short."
sample_rate = 24000                  # openai 默认 24000，pcm 默认 8000
timeout_ms = 5000
hangup_on_disconnect = true          # 端点断开即挂断通话

# 自建服务（与 voip_bridge: 转移同一线格式）
# [[realtime]]
# name = "local-bot"
# url = "ws://127.0.0.1:9100"
# protocol = "pcm"
# sample_rate = 8000
```

Key 兜底读环境变量 `OPENAI_API_KEY` / `REALTIME_API_KEY`。

## 生命周期

- 应用启动时自动 `answer()` 并建立音频桥，随后进入常驻事件循环；
- 桥由会话拥有：挂机或替换应用时自动拆除；
- AI 的转写、函数调用、barge-in 通过 **`realtime_event`**（RWI 事件 / Webhook）对外透出。

## TTS（语音合成）

为 IVR、放音、AI 场景提供任意文本合成，HTTP / CLI 双驱动 + 本地文件缓存。

```toml
[tts]
cache_dir = "/tmp/rustpbx_tts_cache"   # 默认 %TEMP%/rustpbx_tts_cache
cache_ttl_seconds = 86400

# HTTP 驱动（任意 TTS 服务）
[tts.driver]
type = "http"
url = "https://tts.example.com/api/synthesize"
method = "POST"
param_name = "text"
output_format = "mp3"
body_format = "json"
# extra_params / headers / timeout_seconds 均可配

# CLI 驱动
# [tts.driver]
# type = "cli"
# command = "edge-cli"
# args = ["speak", "--voice", "{voice}", "--text", "{text}", "--output", "{output}"]
```

使用方式：`tts://<url编码后的文本>?voice=xxx`，或放音参数里的 `tts_text` / `tts_voice`。失败自动回退 `edge-cli speak`（默认中文语音 `zh-CN-XiaoxiaoNeural`，输出 mp3）。

## 实时转写（ASR）

流式转写把通话内容实时变成文本（Deepgram 兼容协议，任何同线格式端点可用）：

```toml
[proxy.transcript.remote]
url = "wss://api.deepgram.com"
model = "nova-2"
language = "multi"
interim_results = true
auto_start = false          # 接通自动开始；否则经 SSE / REST 命令启动
# provider = "deepgram"     # 内置；自定义协议注册 TranscriptionProviderFactory
```

事件：`transcript_started` / `transcript_segment`（增量）/ `transcript_final`（整句定稿）/ `transcript_ended` / `transcript_error`。订阅 `transcript_final` 的 Webhook 即可获得「一句一 POST」的转写推送。

离线录音转写由 `transcript` 插件提供（SenseVoice 模型，控制台 `/transcript` 页面）。

## 端到端示例

仓库 `examples/realtime_openai_smoke.py` 提供 OpenAI Realtime 的端到端冒烟流程：外呼 → 接通 → AI 对话 → 挂机。

## 架构要点

- AI 桥与人类坐席走**同一套**呼叫控制（转接、监听、录音、队列都能作用于 AI 通话）；
- `protocol = "pcm"` 模式可对接任何自建 ASR/TTS/LLM 服务（裸 PCM16 + DTMF JSON 线格式）；
- `hangup_on_disconnect` 决定端点断开时是否连带挂断通话。
