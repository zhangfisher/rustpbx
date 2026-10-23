# IVR 语音流程

RustPBX 的 IVR 支持两种模式：**内置 IVR**（配置驱动）与**步模式 / 自定义 Provider**（由你的外部服务逐步驱动）。

## 内置 IVR

IVR 流程定义在配置目录（`[proxy] ivr_dir` / `ivr_files`），呼叫进入后按流程播放提示音、收集 DTMF、按分支跳转。

入口方式：

- 路由目标设为 IVR 应用（`DialplanFlow::Application`）；
- IVR 节点动作 `EntryAction::StartApp`；
- RWI `call.app_start`。

## 步模式（Step Mode）与自定义 Provider

IVR 可以完全由你的外部服务驱动——PBX 只做媒体与 DTMF 的执行器，**流程逻辑在你的代码里**：

1. 呼叫进入 IVR，PBX 把**呼叫事件**（DTMF、超时、放音结束）POST 到你配置的 URL；
2. 你的服务返回 `ActionNode`（下一步动作）：播放、收集、跳转、转人工、挂断……；
3. 循环直到流程结束。

这样 IVR 逻辑可以放进你的业务系统：动态分支（查库决定）、A/B 测试、热更新流程，全部无需动 PBX。

相关文档与示例（仓库 `docs/`）：

- `ivr_step_protocol_zh.md` / `_en.md` —— 自定义 IVR Provider 协议规范（附参考 Python provider）；
- `ivr_editor_step_mode.md` —— IVR Editor 步模式配置与调试；
- `examples/unified_ivr_provider.py` —— 可运行的参考实现。

## 会话恢复回退

步模式下外部 Provider 无法继续时（超时 / 宕机），按回退规则恢复：

```toml
[proxy.ivr_fallback]
default = "default"

[[proxy.ivr_fallback.rules]]
name = "vip"
priority = 100
match = { "from.user" = "^9" }
target = "builtin_voicemail"
```

匹配语义与路由一致（`from` / `to` / `header.*`），首条高优先级匹配生效。

## IVR 事件

IVR 执行过程对 RWI 订阅者完全可见：

| 事件 | 说明 |
|---|---|
| `ivr_node_entered` / `ivr_node_exited` | 进出节点 |
| `ivr_flow_completed` | 流程完成 |
| `ivr_step_trace` | 步模式逐步执行轨迹（调试利器） |

## TTS 提示音

IVR 提示音支持 `tts://` 协议，实时合成任意文本：

```json
{ "action": "media.play",
  "params": { "source": { "source_type": "tts", "uri": "tts://您好，请说出您要查询的订单号" } } }
```

HTTP / CLI 双驱动 + 本地缓存，详见 [AI 语音与 TTS](/features/ai#tts)。

## 分段录音

IVR 阶段与坐席阶段可以**分别录音**：

```toml
[recording]
auto_start = true
auto_start_except = ["ivr"]     # IVR 路由的呼叫不自动装录音器
```

IVR 流程内用智能节点 `record start` / RWI `record.start` 开启自己的片段——IVR 阶段与坐席阶段落入不同文件，各自产生 `recording_metadata_available` 事件（`source=ivr` / `source=agent`）。应用范围的 IVR 片段在会话移交（转接 / 入队 / 跳转）时自动关闭。

## 语音信箱

内置语音信箱应用（响铃若干秒后录制留言），失败提示音与提示语可通过 `[proxy.audio_profile]` 与 `voicemail_greeting` 配置。CDR 报表含语音信箱标签页。
