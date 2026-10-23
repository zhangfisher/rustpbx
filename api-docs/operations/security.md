# 安全

## ACL 与 UA 过滤

```toml
[proxy]
acl_rules = [
    "allow 10.0.0.0/8",
    "deny all"
]
acl_files = ["config/acl/*.toml"]
ua_white_list = ["grandstream", "yealink"]   # 非空时作为白名单，优先于黑名单
ua_block_scanners = true                      # 拦截 sipvicious / friendly-scanner 等
```

::: warning 生产必改
默认配置为 `allow all`（启动时打印告警）。上线前务必替换为显式白名单。
:::

## 认证失败自动封禁（内建 fail2ban）

```toml
[security]
[security.bans]
enabled = true
max_failures = 5                    # 窗口内失败次数阈值
window_secs = 300
ban_durations_secs = [300, 900, 3600]   # 阶梯式封禁时长（按违规次数递增）
protected_cidrs = ["10.0.0.0/8"]    # 永不封禁的网段

[security.alerts]
webhook_url = "https://hooks.example.com/security"   # 封禁/告警通知
```

- 内存 + 数据库双写（重启不清除），热快照查询；
- 封禁触发 webhook + 邮件告警（`[mail]` 配置 SMTP）；
- 控制台「安全封禁」页查看与手动解封；AMI `GET /ami/v1/bans`。

控制台登录也有独立的爆破防护：MFA 连续错 5 次锁 300 秒。

## TLS 与 ACME 自动证书

**静态证书**：

```toml
https_addr = "0.0.0.0:443"
ssl_certificate = "config/certs/fullchain.crt"
ssl_private_key = "config/certs/privkey.key"

[proxy]
tls_port = 5061
# tls_ca_certificates = "..."
```

**ACME 插件**（Let's Encrypt，HTTP-01）：

```toml
[proxy]
addons = ["acme"]
```

插件配置在 `acme.toml`，功能：

- 自动申请证书（HTTP-01 挑战端点 `/.well-known/acme-challenge/{token}`）；
- 到期巡检 + 自动续期；
- 证书落盘 `config/certs/<domain>.crt` 并**回写配置**（必要时自动开启 `https_addr`）；
- **热重载 HTTPS 与 SIP TLS 双通道**——续期无需重启、不中断通话；
- 控制台页面 `/acme` 管理域名与状态。

## TOTP 双因子（商业版）

- 「账户安全」页启用：扫码 / otpauth URI 绑定（SHA1、6 位）；
- 登录与敏感操作二次校验；
- `[console] require_mfa = true` 强制所有管理员启用后才能登录；
- 管理员可重置用户的 TOTP 绑定。

## 许可证

```toml
[licenses]
enforce = false              # true = 无有效许可证的商业插件被禁用；false = 试用模式
allow_global = true          # 接受保留的 "global" 键名
public_key = ""              # hex Ed25519 公钥（校验离线令牌 "PBX1.<payload>.<sig>"）
email = "you@example.com"    # 邮箱限制型密钥

[licenses.addons]
wholesale = "enterprise"     # 插件 id -> 键名

[licenses.keys]
enterprise = "LICENSE-KEY-XXXX-XXXX-XXXX"
```

- **在线校验**：POST miuda.ai，5s 超时，失败回退 1 小时缓存；
- **离线令牌**：Ed25519 签名的 `PBX1.` 令牌，公钥来自配置（不硬编码），支持离线环境；
- 控制台「插件」页点「验证」自动写入配置节。

## 其他加固建议

- AMI 保持 IP 白名单（默认仅本机），不暴露公网；
- 反代之后才开 `trust_forward_headers`；
- 控制台 `session_secret` 必须改为随机值；
- REST 集成用静态 API Token（绑定最小 scopes），不用超管账号；
- `ensure_user = true` 防止垃圾扫描器通过响应差异探测用户存在性；
- SSO 场景把 `[sso.jwt].secret` 与 `[proxy.jwt_auth].secret` 统一并妥善保管。
