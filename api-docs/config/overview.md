# 配置体系总览

RustPBX 使用单一 TOML 配置文件（默认 `config.toml`，通过 `--conf` 指定）。完整的注释样例见仓库根目录的 [`config.toml.example`](https://github.com/restsend/rustpbx/blob/main/config.toml.example)。

## 配置来源与优先级

1. 命令行参数（`--conf`、`--super-username` 等）；
2. 指定路径的 TOML 文件；
3. `.env` 文件（dotenvy）；
4. 内置默认值（完全不配置也能启动）。

部分配置还可以来自**数据库**（控制台里修改的中继、路由、分机、设置等），通过热重载机制（`trunks.generated.toml` / `routes.generated.toml` 等生成文件）与文件配置合并。

## 配置装载与热重载

- 启动时配置重载循环最多重试 10 次（间隔 5s）；
- AMI 提供细粒度热重载端点：`POST /ami/v1/reload/{trunks,routes,acl,app,queues,ivr}`；
- 控制台「设置」页保存后触发对应 reload；
- 日志级别可通过控制台在线调整（EnvFilter 热替换）；
- TLS 证书（含 ACME 自动续期产物）支持 HTTPS 与 SIP TLS 双通道热重载，无需重启。

::: warning 只对新呼叫生效
热重载（如 `max_ring_time`、路由、中继）只影响**新建立的呼叫**，进行中的通话保持原参数。
:::

## 顶层配置一览

| 配置段 | 说明 | 章节 |
|---|---|---|
| `http_addr` / `https_addr` / `ssl_*` | HTTP/HTTPS 监听与证书 | [平台与网络](/config/platform) |
| `log_level` / `log_file` / `stats_log` | 日志与本地统计 | [平台与网络](/config/platform) |
| `database_url` / `[database_pool]` | 数据库（SQLite / MySQL / PostgreSQL）与连接池 | [平台与网络](/config/platform) |
| `external_ip` / `rtp_*` / `[[ice_servers]]` / `[[network_profile]]` | NAT、RTP 端口段、ICE | [平台与网络](/config/platform) |
| `[proxy]` | SIP 代理核心：监听、模块、路由、中继、队列、IVR、ACL… | [SIP 代理核心](/config/proxy-core) |
| `[console]` | Web 控制台：路径、注册策略、MFA、静态资源、API Token | [控制台、SipFlow 与存储](/config/console-storage) |
| `[ami]` / `[graceful_shutdown]` | AMI 访问白名单、优雅停机 | [REST API 与 AMI](/interfaces/rest-ami) |
| `[recording]` | 录音策略（master switch、类型、上传、分段） | [媒体、录音与 CDR](/config/media) |
| `[sipflow]` / `[sipflow.upload]` | SipFlow 采集与上传 | [SipFlow](/operations/sipflow) |
| `[callrecord]` | CDR 存储（database / local / s3 / http） | [媒体、录音与 CDR](/config/media) |
| `[security]` | 认证失败封禁与告警 | [安全](/operations/security) |
| `[rwi]` / `[rwi_webhook]` | RWI 连接限制与 Token、事件 Webhook | [RWI 实时接口](/interfaces/rwi) |
| `[licenses]` | 商业插件许可证 | [安全](/operations/security#许可证) |
| `[[realtime]]` | AI 实时语音端点预设 | [AI 语音与 TTS](/features/ai) |
| `[cluster]` | 集群节点 | [集群与高可用](/operations/cluster) |
| `[outbound]` | 外呼 API 并发与超时 | [外呼](/features/outbound) |
| `[proxy] addons` | 启用哪些插件 | [版本与插件体系](/guide/editions) |

## 数据库配置模式

配置里的绝大多数内容（分机、中继、路由、用户、录音策略…）都可以选择：

- **文件模式**：写在 TOML 里，适合 GitOps 式管理；
- **数据库模式**：在 Web 控制台里维护，保存时自动导出生成 TOML 片段并热重载。

两者生成的最终结构一致，可按 `[proxy] generated_dir`（默认 `./config`）查看导出产物。

## 环境变量

- `OPENAI_API_KEY` / `REALTIME_API_KEY`：realtime 预设的 API key 兜底；
- `DEEPGRAM_API_KEY`：实时转写远程 ASR 的 key 兜底；
- 其余可用 `.env` 注入（dotenvy 自动读取）。

## 下一篇

- [平台与网络](/config/platform)：HTTP、日志、数据库、RTP、NAT、ICE。
