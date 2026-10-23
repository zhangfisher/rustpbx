# 控制台、SipFlow 与存储

## Web 控制台（[console]）

```toml
[console]
session_secret = "please_change_me_to_a_random_secret"
base_path = "/console"          # 控制台页面前缀
api_prefix = "/api"             # REST API 前缀
static_path = "/static"         # 静态资源前缀
allow_registration = false      # 首个账号后开放自助注册
require_mfa = false             # 强制管理员启用 TOTP（商业版）
secure_cookie = false           # true 强制 Secure；否则按请求自动判断

# 前端资源 CDN 覆盖（默认走内置/CDN）
# alpine_js = "https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"
# chart_js = "/static/vendor/chart.umd.min.js"
# jssip_js = "https://cdn.jsdelivr.net/npm/jssip@3.10.0/dist/jssip.min.js"

# 多语言
# locale_default = "zh"
# locales = ["zh", "en"]

# 静态 API Token（绑定 scopes，如 "*"、"cdr:read"、"call.control"）
# [[console.api_tokens]]
# token = "my-integration-token"
# scopes = ["cdr:read", "callcontrol:command"]
```

控制台技术栈：服务端 minijinja 模板 + Alpine.js + Tailwind CSS 4 + Chart.js（非 SPA，构建产物入库，运行无需 Node）。

## SipFlow（[sipflow]）

配置 SIP 信令采集（`[sipflow]` 存在即采集所有呼叫的 SIP 消息）；RTP 媒体采集额外要求 `[recording] type = "sipflow"`：

```toml
[sipflow]
type = "local"                # local（SQLite）| remote（集群）
root = "./config/sipflow"
subdirs = "daily"             # none | daily | hourly
# flush_count = 1000
# flush_interval_secs = 5

# 每通呼叫结束后上传
# [sipflow.upload]
# type = "s3"
# vendor = "aws"
# bucket = "my-recordings"
# region = "us-east-1"
# access_key = "AKID"
# secret_key = "SECRET"
# endpoint = "https://s3.amazonaws.com"
# root = "recordings"
# media = true                # type=sipflow 时把 RTP 导出 WAV 上传
# signaling = true            # 上传 SIP 信令 JSONL
# signed_url_expiry_secs = 86400
```

远程单节点 / 集群（按 call_id 一致性哈希分布）：

```toml
[sipflow]
type = "remote"
udp_addr = "192.168.1.100:3000"
http_addr = "http://192.168.1.100:3001"
timeout_secs = 10
mtu = 1500                    # 0 = 关闭 UDP 分批

# 集群：nodes = [{ udp = "...", http = "..." }, ...]
```

控制台「通话记录」详情页的「信令流」标签展示 SIP 阶梯图与媒体质量（丢包 / jitter），并可从 RTP 现场合成 WAV 下载。详见 [SipFlow](/operations/sipflow)。

## 对象存储

`rustpbx-storage` 基于 `object_store` 抽象统一存储后端，用于录音、SipFlow 包、CDR、语音信箱等的上传与预签名下载：

- 本地文件系统；
- S3 兼容（AWS / 阿里云 OSS / 腾讯云 COS / MinIO…）；
- Azure Blob、Google Cloud Storage；
- HTTP 直传（任意接收端点）。

所有 S3 类配置中 `access_key` 与 `secret_key` **可同时留空**（匿名访问公共桶，请求不签名）；只填其一是错误。

## 集群（[cluster]）

```toml
[cluster]
peers = [{ addr = "10.0.0.2", sip_port = 5060, ami_port = 8080 }]
# session_registry_backend = "database"   # 跨节点会话注册表
# session_registry_ttl_secs = 60
# session_max_age_secs = 86400
```

节点间通过 SIP 与 AMI 双通道同步在席、事件与会话注册表；RWI 命令命中非本机会话时自动转发到 owner 节点。详见 [集群与高可用](/operations/cluster)。

## 预测式外呼（[outbound]）

```toml
[outbound]
enabled = true
max_concurrent = 100
default_ring_timeout = 30     # 秒
default_answer_timeout = 60
default_webhook_timeout = 5
```

对应 AMI 端点 `POST /ami/v1/outbound/dial`（SSE 事件流）。详见 [外呼](/features/outbound)。

## SMTP 外发邮件

```toml
[mail]
enabled = true
host = "smtp.example.com"
port = 25
username = "noreply@example.com"
password = "secret"
from = "noreply@example.com"
to = ["ops@example.com"]
timeout_secs = 10
```

用于安全告警（认证失败封禁通知）等；商业版支持品牌化发件人与模板。

## 插件配置文件

部分插件有独立配置文件（放在配置目录下）：

| 文件 | 插件 |
|---|---|
| `acme.toml` | ACME 证书（域名、续期巡检） |
| `archive.toml` | CDR 归档计划 |
| `observability.toml` | Prometheus 端点与 token |
| `cc.toml` / `wholesale.toml` 等 | 商业插件 |
