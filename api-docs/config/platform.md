# 平台与网络

本页覆盖 HTTP 服务、日志、数据库、RTP 端口与 NAT 穿透等平台级配置。

## HTTP / HTTPS

```toml
http_addr = "0.0.0.0:8080"

# HTTPS（可选）。证书也可由 ACME 插件自动申请并热重载
# https_addr = "0.0.0.0:443"
# ssl_certificate = "config/certs/fullchain.crt"
# ssl_private_key = "config/certs/privkey.key"

# 反向代理后才开启——否则任何调用者都能伪造来源 IP（绕过 AMI 白名单）
# trust_forward_headers = true
# http_gzip = true
```

WebSocket 端点（SIP over WS 与 RWI）挂在同一个 HTTP 服务上。

## 日志

```toml
log_level = "info"                 # 级别或 EnvFilter 指令，如 "info,rsipstack=debug"
# log_file = "/tmp/rustpbx.log"    # 不设置则输出到 stdout
# log_rotation = "daily"

# 本地统计日志：每个 stats_interval 秒追加一行 JSON（负载、SIP 量、媒体丢包、
# DB 池、tokio、内核 UDP 错误等），无需 Prometheus 即可做丢包/负载诊断
# stats_log = "/var/log/rustpbx.stats.log"
# stats_interval = 5

# 访问日志跳过路径
# http_access_skip_paths = ["/health", "/metrics*"]
```

第三方库（hyper_util / rustls / sqlx / reqwest）默认压到 `warn`，除非在 `log_level` 里显式命名。日志级别可在控制台在线热更。

## 数据库

```toml
# SQLite（默认）
database_url = "sqlite://rustpbx.sqlite3"
# PostgreSQL / MySQL
# database_url = "postgres://user:pass@localhost/rustpbx"

# 连接池（主池由控制台、CDR、插件共享；默认 max_connections=16）
# [database_pool]
# max_connections = 16
# min_connections = 0
# acquire_timeout_secs = 30
# idle_timeout_secs = 600
# max_lifetime_secs = 1800
```

## RTP 端口与外部 IP

```toml
# SDP 与 ICE candidate 中公布的公网 IP（NAT 后必设）
external_ip = "203.0.113.10"
# 或自动探测（与 external_ip 互斥）
# auto_external_ip = "http://ifconfig.me"

# RTP 端口段（默认 12000–42000，约 3 万端口；按每通电话 ~2 端口规划）
# rtp_start_port = 12000
# rtp_end_port = 42000
# WebRTC 专用端口段
# webrtc_port_start = 30000
# webrtc_port_end = 40000

# SIP Contact 中的主机（对话内 BYE / re-INVITE 用）。不设则跟随 external_ip
# sip_external_ip = "203.0.113.10"
# local_networks = ["192.168.0.0/16", "10.0.0.0/8"]
```

::: tip 媒体 IP 与信令 IP 分离
RustPBX 把 RTP/SDP（`external_ip`）与 SIP Contact（`sip_external_ip`）分开配置，适配媒体与信令走不同公网出口的部署。
:::

## 多路径出口（network_profile）

一个进程可以同时挂多条出口线路（公网 WAN、Tailscale/WireGuard 等），中继按 `profile` 字段选择出口：

```toml
default_network_profile = "wan"

[[network_profile]]
id = "wan"
label = "Public WAN"
external_ip = "203.0.113.10"
sip_external_ip = "203.0.113.10"

[[network_profile]]
id = "overlay"
label = "Tailscale / WireGuard"
external_ip = "100.64.0.5"
bind_ip = "100.64.0.5"
contact_lan_use_bind = true
```

## ICE / STUN / TURN（WebRTC 客户端）

```toml
[[ice_servers]]
urls = ["stun:stun.l.google.com:19302"]

[[ice_servers]]
urls = ["turn:turn.example.com:3478", "turn:turn.example.com:3478?transport=tcp"]
username = "user"
credential = "pass"

# 临时 TURN 凭据：Base64(HMAC-SHA1(secret, "<expiry>:<username>"))
# [[ice_servers]]
# urls = ["turn:turn.example.com:3478"]
# secrete = "same-secret-as-miuturn"
# lifetime = 3600
```

浏览器通过 `GET /iceservers` 获取下发的 ICE 配置。

## 媒体参数（[media]）

```toml
[media]
# 无音频源时输出舒适噪声而非数字静音（默认 true）
# comfort_noise = true
# comfort_noise_level_db = -35.0
# 普通 RTP 腿的 SDP 公布 a=ice-lite（Microsoft Teams Direct Routing 等严格
# full-ICE 端点要求）。WebRTC 腿始终跑 full ICE，不受此开关影响
# ice_lite = false
```

## 优雅停机

```toml
[graceful_shutdown]
# SIGTERM/docker stop/AMI shutdown：新呼叫回 503、OPTIONS/health 回 500
# （前端负载均衡停止摘流），等活跃通话结束后退出
drain_timeout_secs = 300
```

## AMI 访问白名单

```toml
[ami]
# 支持精确 IP、CIDR、"*"；省略时默认仅本机
allows = ["127.0.0.1", "::1", "10.0.0.0/8"]
```
