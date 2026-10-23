# 部署与运维

本页覆盖生产环境的部署形态、网络要求、日常运维操作（热重载、停机、排障）。

## 部署形态

| 形态 | 适用 | 要点 |
|---|---|---|
| Docker（单机） | 最常见 | `--net host`，挂载 `config.toml` |
| 源码构建 | 定制编译 | `cargo build --release`，可用 feature 裁剪 |
| 集群 | 高可用 / 大规模 | commerce 构建，AMI `/cluster/*` 同步 |

### Docker 注意点

```bash
docker run -d --name rustpbx --net host \
  -v $(pwd)/config.toml:/app/config.toml \
  docker.cnb.cool/miuda.ai/rustpbx:commerce --conf /app/config.toml
```

- **必须 `--net host`**（或自行映射全部 SIP 端口 + RTP 端口段）：SIP/RTP 对端会把公网 IP 与端口写进 SDP，NAT 网络下媒体不通。
- 数据库默认 SQLite（`sqlite://rustpbx.sqlite3`），生产建议 PostgreSQL / MySQL（`database_url`）；完整表结构见 [数据库表结构](/guide/database)。

### 交叉编译

```bash
rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu
```

仓库另提供 `Dockerfile.cross-x86_64` / `Dockerfile.cross-aarch64` 用于多架构镜像。

## 网络与端口

| 用途 | 默认端口 | 协议 |
|---|---|---|
| HTTP（控制台 / REST / WS） | 8080 | TCP |
| SIP | 5060（示例配置 15060） | UDP / TCP |
| SIP TLS | `[proxy].tls_port` | TCP |
| SIP over WS | `[proxy].ws_port` | TCP（HTTP 升级） |
| RTP 媒体 | `[proxy].media_proxy` 端口段 | UDP |
| Prometheus /metrics | `[metrics]` 配置 | TCP |

### NAT / Docker 后的 401 问题

SIP 注册在 NAT 或 Docker 后返回 401，通常是因为对端用可达的公网地址回不到内网。显式声明 realm：

```toml
[proxy]
realms = ["your-public-ip:5060"]
```

**最快的媒体排障信号**：拨打 `sip:echo@probe.rustpbx.com` —— 能听到自己的回声，说明信令 + RTP 都是通的。

## TLS 与证书

三种方式获得 TLS 证书：

1. 手动：`ssl_certificate` / `ssl_private_key` 指向 PEM 文件
2. 自动扫描：证书放到 `config/certs/*.crt`，程序自动加载
3. **ACME 自动签发**：`addon-acme` 插件（默认开启），Let's Encrypt HTTP-01 签发与自动续期，配置见 [SipFlow / 插件配置](/config/07-addons-admin-storage_zh)

证书热更新由 `src/tls_reloader.rs` 监听文件变化，无需重启。

## 日常运维

### 配置热重载

- **控制台**：`PATCH /api/settings/config/{platform,proxy,storage,security,rwi,network-profiles}`，改完即生效（本质是重建 AppState，会等 SIP 端口释放后重新绑定）
- **文件级**：AMI `POST /ami/v1/reload/{trunks,routes,acl,queues,ivr}` 按类重载
- **全量**：`POST /ami/v1/reload/app`（返回 SSE 进度流）
- 商业版集群：`GET /api/settings/config/cluster/reload`（SSE）同步到所有节点

### 优雅停机

```bash
curl -X POST http://127.0.0.1:8080/ami/v1/shutdown
```

停机时新呼叫 / 新注册回 `503`，活动通话等其自然结束；`[graceful_shutdown].drain_timeout_secs`（默认 300 秒）超时后强制退出。也支持 SIGTERM。

### 集群（commerce 构建）

集群节点间通过 AMI `/cluster/*` 同步：配置重载、呼叫列表、会话归属查询、事件转发（presence / locator / 队列 / user_data）、跨节点命令派发。事件带 `node_ip` 标识来源节点。集群 API 见 [AMI 外呼与集群](/api/ami-cluster)。

## 可观测性

| 信号 | 端点 / 位置 | 说明 |
|---|---|---|
| Prometheus 指标 | `GET /metrics`（observability 插件） | SIP 注册数、活动呼叫、RTP 包 / 丢包、进程指标 |
| 健康检查 | `GET /healthz`、`GET /ami/v1/health` | 存活 / 就绪 |
| 运行时指标页 | 控制台"指标" | CPU / 内存 / 连接数 |
| stats log | 每 `stats_interval` 秒一行 JSON | 本地统计日志 |
| tokio-console | `--tokio-console <addr>` | 异步任务诊断 |

指标口径与告警建议详见 [可观测性](/guide/observability)。

## 日志

- tracing + 热更新 `EnvFilter`（`POST /ami/v1/reload/app` 或控制台改日志级别，无需重启）
- 文件滚动轮转（`RotationMode` 配置）
- 控制台内置日志查看器（尾随 / 跟随，超管专属）：`GET /api/settings/logs/{nodes,recent,follow,stream}`
- 排查注册问题可开 SipFlow 抓包：见 [SipFlow 配置](/config/08-sipflow_zh)

## 常见问题速查

| 现象 | 排查方向 |
|---|---|
| 注册 401（NAT/Docker 后） | `realms` 显式声明公网地址（见上） |
| 能呼通但单向 / 无声音 | RTP 端口段未放行、SDP 公网地址不对；用 echo 探测定位 |
| 控制台 404（页面空白） | 克隆时漏了 `--recurse-submodules`，`frontend/` 为空 |
| Webhook 不触发 | 检查 `[proxy].http_router.url` 连通性，用 `/api/settings/config/proxy/http-router/test` 测试；看 `fallback_to_static` 是否掩盖了错误 |
| 录音 / CDR 未落库 | 看 `[recording]` / `[callrecord]` 配置与 CallRecordManager 日志；S3 检查 `[storage]` 凭据 |
| 高并发下媒体抖动 | 检查 `[proxy].media_worker_threads`、CPU 亲和、网卡中断绑核 |

更多排障命令见 [诊断接口](/api/diagnostics)（SIP 对话转储、中继 OPTIONS 探活、路由模拟求值、注册定位查询）。
