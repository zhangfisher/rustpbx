# 可观测性

RustPBX 提供三档可观测性能力：

| 档位 | Feature | 内容 |
|---|---|---|
| 社区版 | `addon-observability`（默认开启） | Prometheus 指标 + 存活探针 |
| 本地统计 | `stats_log` | 无 Prometheus 的 JSON 行统计日志 |
| 商业版 | `addon-telemetry` | + OpenTelemetry（OTLP/gRPC traces） |

## Prometheus 与健康探针

由 `observability` 插件提供（配置文件 `observability.toml`）：

| 端点 | 说明 |
|---|---|
| `GET /metrics` | Prometheus text 0.0.4 格式；可配 Bearer token 保护（未配则开放） |
| `GET /healthz` | 存活探针；**排水中返回 500 `draining`**（负载均衡摘流信号） |

```toml
# observability.toml
enabled = true
path = "/metrics"
healthz_path = "/healthz"
# token = "scrape-secret"    # 设置后 /metrics 需 Authorization: Bearer <token>
```

另有 AMI 的 `GET /ami/v1/health`（管理面健康）。

## 指标命名空间

指标前缀 `rustpbx_`，按命名空间分组：`sip` / `session` / `transaction` / `media` / `db` / `system` / `transfer` / `conference` / `cc` / `cdr` / `recording`。

关键指标举例：

| 指标 | 说明 |
|---|---|
| `rustpbx_calls_total` | 完成呼叫总数（按 direction / result 分） |
| `rustpbx_call_duration_seconds` | 通话时长直方图 |
| `rustpbx_call_talk_time_seconds` | 通话讲谈时长 |
| `rustpbx_rtp_*` | RTP 包 / 丢包 / jitter |
| `rustpbx_process_*` | CPU / RSS / fd / TCP（15s 采样器） |
| `rustpbx_recording_upload_*` | 录音上传延迟与 SLA |

Label 约定：`direction`（inbound/outbound/internal）、`result`（SIP 状态码段映射）。完整指标表见仓库 `docs/observability_zh.md`。预置直方图桶针对电话场景调优（毫秒级事务、小时级通话）。

Grafana 快速开始：导入 `docs/grafana/rustpbx-overview.json` 即得「RustPBX Overview」仪表盘；`docs/observability_zh.md` 附 PromQL 示例。

## 本地统计日志

无 Prometheus 也可诊断丢包与负载：

```toml
stats_log = "/var/log/rustpbx.stats.log"
stats_interval = 5      # 每 5 秒一行 JSON
```

每行包含：系统负载、SIP 消息量 / 注册数 / 事务时延、媒体丢包、DB 池状态、tokio 指标、内核 UDP 错误。轮转交给 logrotate。

## 日志与追踪关联

- 结构化日志（tracing），panic hook 输出文件+行号的可用回栈；
- 商业版 OTel：每通呼叫一个 span，`log_trace_id` 把日志与 trace 关联；
- 每次挂机产生 trace 与 CDR 快照，早期失败也有 CDR 记录。

## DB 写失败上报

数据库写失败统一走上报中心：一条结构化错误日志 + 按 `(entity, operation)` 节流 30s 的 `db_write_failed` RWI 事件（带被抑制计数）——订阅该事件即可监控存储健康。

## 控制台指标页

控制台「指标」页展示运行时指标与 Prometheus 端点信息（地址、是否需鉴权）；「报表」页提供通话 / 中继 / 路由维度的统计与热力图。

## OpenTelemetry（商业版）

```toml
[otel]
endpoint = "otel-collector:4317"
service_name = "rustpbx-prod"
sample_ratio = 0.1
export_metrics = false
log_trace_id = true
```

每通呼叫的 span 事件包含呼叫建立、路由决策、转接、挂机等节点，可直接在 Jaeger/Tempo 中还原完整呼叫时间线。
