# 路由与中继

路由决定「呼叫去哪」，中继（Trunk）决定「怎么到达外部网关」。

## 静态路由

```toml
[[proxy.routes]]
name = "international"
priority = 10                # 大者优先；首条匹配生效
dest = "wuhoo"               # 指向下面的中继名

[proxy.routes.match]         # 匹配条件（全部满足）。支持正则
"to.user" = "^\\+.*"
# "from.user" = "^100"
# "to.host" = "pbx.example.com"
# "header.X-Custom" = "value"

[proxy.routes.rewrite]       # 匹配后改写（{n} 为正则捕获组）
"to.user" = "+{1}"
"to.host" = "123.456.789.00:1234"
"from.user" = "12345"
```

路由文件支持外置：`routes_files = ["config/routes/*.toml"]`。控制台「路由」页维护的规则保存后导出到 `generated_dir` 并热重载。

## HTTP 动态路由

```toml
[proxy.http_router]
url = "https://your-service.example.com/route"
headers = { "X-Key" = "secret" }
timeout_ms = 5000
fallback_to_static = true     # 你的服务不可用 / 返回 not_handled 时回落静态路由
```

每个入局 INVITE 都会 POST 给你的服务，由你实时返回决策（forward / reject / abort / spam）。详见 [HTTP Router](/interfaces/http-router)。

## 忙线等待（camp-on）

```toml
[[proxy.routes]]
name = "busy-wait-1001"
priority = 10

[proxy.routes.match]
"to.user" = "1001"

[proxy.routes.busy_wait]
enabled = true
max_wait_secs = 60           # 0 = 无限等待
retry_interval_secs = 5      # 每隔多久重拨
hold_audio = "sounds/phone-calling.wav"
```

被叫回 486 时主叫被停放（183 早期媒体循环等待音），定时重拨直到空闲接通或超时。

## 中继（Trunk）

```toml
[proxy.trunks.wuhoo]
dest = "sip:123.456.789.00:1234"
# backup_dest = "sip:back.example.com"         # 备用目的地
# outbound_proxy = "sip:proxy.example.com"     # REGISTER 与 next-hop 走此地址

# 认证
username = "account"
password = "secret"

# 编解码白名单（别名：allow_codecs / audio_codecs）
codec = ["pcma", "pcmu", "g722", "opus"]

# 限流与负载
max_calls = 100               # 并发上限
max_cps = 10                  # 每秒呼叫上限
weight = 100                  # 加权负载均衡
# overflow_threshold = 80     # 溢出阈值 + CAC 策略

# 传输与方向
transport = "udp"             # udp / tcp / tls / ws
direction = "both"            # inbound / outbound / both
# inbound_hosts = ["203.0.113.50"]   # 允许接入的上游主机（direction 含 inbound 时）

# 注册
register_enabled = true
register_expires = 300
# register_extra_headers = { "X-Extra" = "v" }

# 健康检查与故障转移
health_check_enabled = true
health_check_interval_secs = 30
# health_check_fallback_trunk = "backup"

# 媒体
# media_mode = "auto"         # 锚定/旁路策略
# video_policy = "pass_through"   # pass_through / strip
# profile = "wan"             # 使用哪条 [[network_profile]] 出口
# external_ip / bind_ip / ice_lite / max_ring_time 均可按中继覆盖
```

### 头改写与透传

```toml
[proxy.trunks.wuhoo]
# HMR 头处理规则
# header_rules = [...]

# 自定义头透传（默认不透传；标准 SIP 头永不透传）
# header_passthrough = { mode = "all" }
# header_passthrough = { mode = "whitelist", whitelist = ["X-Smart2Agent"] }
# header_passthrough = { mode = "blacklist", blacklist = ["X-Token"] }
```

配置了 `username` 时 PBX 自动为出局 INVITE 注入 Digest 凭据与 `P-Asserted-Identity`（用原始主叫）。

## 负载均衡选择

同名多中继（或路由 dest 指向多个候选）时按策略选择：

| 策略 | 行为 |
|---|---|
| `random` | 均匀随机 |
| `hash` | 按 `from.user` / `to.user` / `call-id` 哈希（默认 caller），同输入稳定命中 |
| `rr` | 有状态轮询（默认） |
| `weighted` | 按 `weight` 加权（默认权重 100；全 0 退化为均匀随机） |

## 失败重试与转移

出局候选序列**一次性构建**，失败时按策略推进（不重新走路由决策）：

- 推进条件基于失败 SIP 响应码与振铃时长（`max_ring_time` 超时视为 no-answer）；
- `backup_dest` 提供同中继内的第二目的地；
- 健康检查失败自动切到 `fallback_trunk`。

详见仓库 `docs/trunk-retry.md`。

## 按中继的回铃 / 失败提示音

```toml
[proxy.trunks.wuhoo.ringback]
ring = "/sounds/company_ringback.wav"   # 振铃期彩铃（183 早期媒体）
busy = "tone://480,3000"                # 忙音
noanswer = "tone://480,3000"
# 可用值：ring / busy / reject / offline / notfound / noanswer / error
# 支持音频文件路径或 tone://频率,毫秒

# 全局失败提示音基线（中继可覆盖单个字段）
# [proxy.audio_profile]
# busy = "sounds/failure-busy-zh.wav"
# offline = "sounds/failure-offline-zh.wav"
# notfound = "sounds/failure-notfound-zh.wav"
# noanswer = "sounds/failure-noanswer-zh.wav"
# error = "sounds/failure-service-zh.wav"
```

内置中文失败提示音（`sounds/failure-*-zh.wav`）开箱可用：忙线、无法接通、空号、无人接听、服务不可用。

## 拨号计划检查器栈

路由决策后、拨号前，呼叫会经过一组**检查器**（emergency 紧急号码、number_pool 号码池、插件提供的检查器），可 `Continue` / `Final` / `Reject`。
