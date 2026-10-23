# SIP 代理核心

`[proxy]` 段是 SIP 代理的全部配置：监听、模块链、路由、中继、队列、IVR、限流等。

## 监听与模块

```toml
[proxy]
modules = ["acl", "auth", "presence", "registrar", "call"]
addr = "0.0.0.0"
udp_port = 15060            # 示例配置用 15060；默认 5060
# udp_ports = [5060, 5061]  # 多 UDP 端口
# tcp_port = 5060
# tls_port = 5061           # 需配置 ssl_certificate / ssl_private_key
# ws_port = 5062            # 独立 WS/WSS listener
ws_handler = "/ws"          # HTTP 服务上的 SIP WebSocket（软电话 / JsSIP 用）
ami_path = "/ami/v1"
rwi_path = "/rwi/v1"
ice_servers_path = "/iceservers"
```

模块按此顺序处理每个 SIP 事务，任一模块返回 `Abort` 即截断。模块的 `allow_methods` 并集决定 `Allow` 头。

| 模块 | 职责 |
|---|---|
| `acl` | UA 黑白名单、URI 规范化、按 IP 的 DoS/CPS 限速 |
| `auth` | Digest / JWT / HTTP Token 认证（多后端链） |
| `presence` | SUBSCRIBE / PUBLISH / NOTIFY 在线状态 |
| `registrar` | REGISTER → 位置服务 |
| `call` | INVITE / BYE / CANCEL / REFER 等呼叫处理与路由 |

## 会话与振铃

```toml
[proxy]
# RFC 4028 会话定时器（默认开启 Supported 模式，可探测对端静默掉线）
# session_timer = true
# session_timer_always = false
# session_expires = 600

# 全局最大振铃/建立时长（秒），超时回 408。0/不设 = 不限制。
# 可被中继 / 路由的 max_ring_time 覆盖；热更（仅新呼叫）
# max_ring_time = 60

# 被叫多设备注册时并行振铃（先接者赢）。false = 只振最后注册的设备
# parallel_fork = true

# 盲转模式：false（默认）= B2BUA 转接；true = 发 REFER（对端 405/420/501 自动回退）
# blind_transfer_use_refer = false

# 保持音乐（文件路径或 http(s) URL），热更
# hold_music = "sounds/phone-calling.wav"
```

## 线程隔离

```toml
[proxy]
# SIP 信令与 RTP 媒体跑在独立 tokio runtime，防止媒体负载饿死 SIP 定时任务
# 默认：sip_worker_threads = min(4, 核数)，media_worker_threads = 其余
# sip_worker_threads = 4
# media_worker_threads = 28
```

## ACL 与 UA 过滤

```toml
[proxy]
# 首条匹配生效。生产环境务必换成显式白名单！（当前默认全放行，启动时会告警）
acl_rules = [
    "allow 10.0.0.0/8",
    "deny all"
]
acl_files = ["config/acl/*.toml"]

# UA 过滤（不区分大小写的子串匹配）。白名单非空时优先生效
# ua_white_list = ["grandstream", "yealink"]
# ua_black_list = []
# ua_block_scanners = true   # 默认拦截 sipvicious / friendly-scanner 等扫描器
```

## 用户后端

```toml
# 链式配置：按顺序查询，直到某个后端确认
[[proxy.user_backends]]
type = "memory"
users = [{ username = "bob", password = "123456" }]

[[proxy.user_backends]]
type = "extension"        # 从分机表（数据库）认证

# 外部 HTTP 认证服务（可带一次性 Token 免 407 快速注册）
# [[proxy.user_backends]]
# type = "http"
# url = "https://auth-service.example.com/sip-auth"
# method = "POST"
# sip_headers = ["X-Auth-Token"]
# token_header = "X-Auth-Token"     # 启用一次性 Token 认证
# token_cache_ttl_secs = 60
```

其他后端类型：`plain`（密码文件）、`database`。详见 [认证与用户](/config/auth-users)。

## 路由、中继与生成文件

```toml
[proxy]
generated_dir = "./config"
routes_files = ["config/routes/*.toml"]
trunks_files = ["config/trunks/*.toml"]
addons = ["acme", "archive", "transcript", "queue"]   # 启用的插件

# HTTP 动态路由（所有入局 INVITE 先问它）
# [proxy.http_router]
# url = "https://your-service.example.com/route"
# timeout_ms = 5000
# fallback_to_static = true

# 不存在的用户不响应（防垃圾扫描器探测）
ensure_user = true
```

静态路由示例：

```toml
[[proxy.routes]]
name = "international"
priority = 10
dest = "wuhoo"                    # 指向 [proxy.trunks.wuhoo]

[proxy.routes.match]
"to.user" = "^\\+.*"

[proxy.routes.rewrite]
"to.user" = "+{1}"
"from.user" = "12345"
```

中继示例（详见 [路由与中继](/config/routing)）：

```toml
[proxy.trunks.wuhoo]
dest = "sip:123.456.789.00:1234"
register_enabled = true
max_calls = 100
max_cps = 10
```

## 并发与 DoS 防护

```toml
[proxy]
# max_concurrency = 10000        # 入站事务并发上限
# dos_* 系列：按 IP 的建流速率限制
```

配合 `[security.bans]`（认证失败自动封禁）与 ACL 规则构成多层防护。详见 [安全](/operations/security)。

## 呼叫中心 / 会议入口

```toml
[proxy]
# 网络会议工厂 URI（话机侧用法见「电话会议」）
# conference_factory_uri = "sip:conference@pbx.example.com:5060"
```

## IVR 步模式回退

```toml
# 外部 IVR Provider 无法继续时的会话恢复规则（匹配语义同路由）
# [proxy.ivr_fallback]
# default = "default"
# [[proxy.ivr_fallback.rules]]
# name = "vip"
# priority = 100
# match = { "from.user" = "^9" }
# target = "builtin_vip_step"
```
