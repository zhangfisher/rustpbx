# SipFlow 抓包与回放

SipFlow 是 RustPBX 的统一通信捕获子系统：**SIP 信令 + RTP 媒体**一并落盘，支持按 Call-ID 提取、信令阶梯图回放、媒体质量统计与 WAV 导出。

## 能力

- 每通呼叫的完整 SIP 消息序列（MessageInspector 采集）；
- RTP 媒体捕获（需 `[recording] type = "sipflow"`）；
- 媒体质量统计：包数、丢包率、jitter、SSRC、payload type、采样率；
- gzip/zstd 压缩落盘，按日 / 按小时子目录；
- 本地 SQLite 引擎或远程集群后端；
- 通话结束后可上传 S3 / HTTP；
- 从 RTP 现场合成 WAV 下载回放。

## 配置

```toml
[sipflow]
type = "local"              # local（SQLite）| remote
root = "./config/sipflow"
subdirs = "daily"           # none | daily | hourly
# flush_count = 1000
# flush_interval_secs = 5

# 通话结束后上传
# [sipflow.upload]
# type = "s3"
# bucket = "my-recordings"
# endpoint = "https://s3.amazonaws.com"
# media = true              # type=sipflow 时把 RTP 导出 WAV
# signaling = true          # 上传 SIP 信令 JSONL
```

采集矩阵：

| 配置 | SIP 信令 | RTP 媒体 |
|---|---|---|
| 有 `[sipflow]` | ✅ | ❌ |
| `[sipflow]` + `[recording] type="sipflow"` | ✅ | ✅ |
| `[sipflow]` + `[recording] type="local"/"s3"/"http"` | ✅ | WAV 由 `[recording]` 负责，`[sipflow.upload].media` 自动跳过 |

## 远程与集群

```toml
# 单节点采集服务器
[sipflow]
type = "remote"
udp_addr = "192.168.1.100:3000"
http_addr = "http://192.168.1.100:3001"
timeout_secs = 10
mtu = 1500                  # 0 = 关闭 UDP 分批

# 集群：按 call_id 一致性哈希分布
# nodes = [
#   { udp = "192.168.1.1:3000", http = "http://192.168.1.1:3001" },
#   { udp = "192.168.1.2:3000", http = "http://192.168.1.2:3001" },
# ]
```

## 独立采集进程

`sipflow` 二进制可作为独立的 SIP/RTP 采集服务器部署（不在 PBX 进程内）：

```bash
sipflow --udp-addr 0.0.0.0:3000 --http-addr 0.0.0.0:3001 --data-dir ./sipflow
```

- UDP 3000 收包（PBX 以 remote 模式投递）；
- HTTP 3001 提供查询 API（信令流、媒体、健康检查）；
- 压测工具：`crates/rustpbx-sipflow/examples/sipflow_loadgen.rs`、`tools/sipflow_stress.sh`。

## 控制台使用

### 通话记录详情页 → 「信令流」标签

- **SIP 阶梯图**：完整消息时序（INVITE/100/183/200/ACK/BYE…），点击消息查看头与 SDP；
- **媒体质量表**：每腿的丢包率、jitter、码率；
- **信令诊断**：异常消息高亮；
- 下载：信令 JSONL（`?scope=session` 可会话级合并）、从 RTP 合成的 WAV。

### 设置页 → SipFlow 面板

配置录制模式（`sipflow`）、后端（local/remote）、flush 参数、媒体录制与 S3 上传；保存后热生效（`reload_sipflow`）。

## REST / AMI 接口

| 端点 | 说明 |
|---|---|
| `GET /api/sipflow/flow/{call_id}` | 信令流 JSON（默认先 flush 写管线） |
| `GET /api/sipflow/media/{call_id}` | 从 RTP 合成 WAV 下载 |
| `GET /ami/v1/sipflow/flow/{call_id}` | AMI 版查询 |
| `GET /ami/v1/sipflow/media/{call_id}` | AMI 版媒体 |

权限：`sipflow:read`。

## 性能与取舍

- 采集走独立通道与 flusher，不阻塞呼叫主路径；
- 全量 RTP 捕获（type=sipflow）磁盘/带宽开销大，生产建议按需开启；
- 信令采集（仅 SIP）开销很小，**建议默认开启**——排障时的信令阶梯图价值极高。
