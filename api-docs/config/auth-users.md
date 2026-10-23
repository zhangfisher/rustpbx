# 认证与用户

RustPBX 的 SIP 认证是**多后端链式**查询：请求依次问每个用户后端，直到某个后端确认或拒绝。

## 用户后端类型

```toml
[[proxy.user_backends]]
type = "memory"
users = [
  { username = "bob", password = "123456" },
  { username = "alice", password = "123456" },
]

[[proxy.user_backends]]
type = "extension"     # 从控制台维护的分机表认证（数据库）
```

| 类型 | 说明 |
|---|---|
| `memory` | 直接写在配置里，适合测试与小型部署 |
| `extension` | 走分机表（Web 控制台维护），支持每个分机独立的 SIP 密码 |
| `database` | 通用数据库查询 |
| `plain` | 密码文件 |
| `http` | 调用外部 HTTP 服务认证 |

## HTTP Token 一次性认证

给任何 HTTP 后端加上 `token_header` 即启用**一次性 Token 认证**——客户端在 REGISTER 里带 Token，免去 401/407 Digest 挑战（WebRTC / CC 坐席登录常用）：

```toml
[[proxy.user_backends]]
type = "http"
url = "https://auth-service.example.com/sip-auth"
method = "POST"
sip_headers = ["X-Auth-Token"]     # 把这些 SIP 头转发给外部服务
token_header = "X-Auth-Token"      # 启用一次性 Token 认证（跳过 407）
http_timeout_ms = 5000             # 默认 5000
http_retry_count = 1               # 网络错误 + 5xx 重试
http_retry_delay_ms = 500
token_cache_ttl_secs = 60          # 默认 0（禁用）。建议 30–300
token_cache_size = 10000           # LRU 上限
```

## JWT 快速注册

JWT 客户端（如 CC 坐席的 cc-phone 登录模式）免 Digest 挑战：

```toml
[proxy.jwt_auth]
enabled = true
secret = "your-shared-hs256-secret"
user_id_claim = "userId"
check_local_user = false
# 开发用 Token 铸造端点（POST /api/cc/dev/*），生产保持关闭
# dev_mint_enabled = true
```

::: tip 与 SSO 打通
把 `[sso.jwt].secret` 与 `[proxy.jwt_auth].secret` 配成同一个值，SSO 签发的 Token 可直接用于 SIP REGISTER（`X-Auth-Token`）与 WebSocket（`?token=`），无需额外管道。
:::

## 位置服务（Locator）

Registrar 把「用户 → 当前 Contact 地址」写入位置服务；呼叫时从这里解析真实 contact：

```toml
[proxy]
# locator = { type = "memory" }         # 默认内存
# locator = { type = "database" }       # 落库（集群共享）
# locator = { type = "http", url = "..." }  # 外部服务

registrar_expires = 60                  # REGISTER 有效期（秒）
```

## 控制台认证与 RBAC

Web 控制台使用 session cookie 认证 + CSRF 防护；REST API 的认证顺序：

1. **静态 API Token**（`[console.api_tokens]` 配置，绑定 scopes）；
2. **电话 / 坐席 Token**（插件提供校验器，固定权限集：呼叫控制、CDR、SipFlow、在席、仪表盘）；
3. **SSO broker Token**（商业版）；
4. **Session cookie**。

```toml
[console]
session_secret = "please_change_me_to_a_random_secret"
base_path = "/console"
api_prefix = "/api"
allow_registration = false     # 首个账号后是否开放自助注册
require_mfa = false            # 强制管理员启用 TOTP
secure_cookie = false          # true 强制 Secure；否则按请求自动判断
static_path = "/static"
```

权限模型为 `resource:action`（如 `trunks:read`、`system:write`、`callcontrol:command`），用户 → 角色 → 权限集，管理在控制台「设置 → 用户 / 角色」。

## SSO（商业版）

商业构建支持 SSO 登录 broker：把企业 IdP 登录经 OAuth2 授权码 + PKCE 流程转成原生 App deep link。

```toml
[sso]
enabled = true
base_path = "/sso"
provider = "jwt"
redirect_url = "myapp://auth/sso"
auto_provision = false      # 首次登录 JIT 创建控制台用户
code_ttl_secs = 60

[sso.jwt]
secret = "shared-secret-with-the-upstream-idp"
user_id_claim = "userId"
upstream_login_url = "https://sso.example.com/login?client=rustpbx"
token_mode = "passthrough"  # passthrough: 原样透传企业 JWT；minted: 自签（支持 refresh）
```

端点仅在 `enabled = true` 时挂载：`{base_path}/authorize|callback|token`。无状态信封设计，集群内各节点只需相同密钥，无需共享存储。对接契约见仓库 `docs/sso_upstream_integration.md` 与 `docs/sso_client_integration.md`。
