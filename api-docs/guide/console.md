# 控制台与安全

RustPBX 内置 Web 控制台（`console` feature，默认开启），同时提供 WebRTC 软电话。本页介绍控制台的构成与安全模型（登录、RBAC、MFA、API Token、封禁）。

## Web 控制台

页面挂在 `[console].base_path`（默认 `/console`）下，REST API 挂在 `api_prefix`（默认 `/api`）下，两者都经过 `csrf_guard` 与认证中间件。

**内置页面**：仪表盘（首页）、用户、分机、SIP 中继、路由、呼叫队列、通话记录、录音、SipFlow、诊断、报表、系统设置、安全、指标、日志、插件、许可证、通知、错误码、呼叫控制，以及插件注入的页面。

**WebRTC 话机**：静态页 `phone.html` 与 `phone_jssip.html`（JsSIP + `RTCPeerConnection`），运行时配置来自：

- `GET /api/config/phone` —— 返回 ws_handler / ice_servers_path / ami_path 等路径
- `GET /iceservers` —— ICE/TURN 服务器，支持 TURN REST 临时凭据
- SIP over WebSocket 走 `ws_handler` 路径（默认 `/ws`）

## 认证方式

| 方式 | 机制 | 典型用途 |
|---|---|---|
| 会话 Cookie | 登录后发 session cookie；非安全方法需 CSRF 双提交头 | 浏览器控制台 |
| 静态 API Token | `[[console.api_tokens]]` 配置，带 scope；Bearer 头传递 | 服务器间集成 |
| 话机 / 坐席 Token | `TokenValidator` trait 实现（内置 JWT / HTTP 校验），固定受限权限集 | WebRTC 话机、坐席端 |
| SSO Token | 商业版（commerce）：OAuth / OIDC broker | 企业统一登录 |

**API 认证顺序**（Bearer 头）：① 静态 API Token → ② 话机 / 坐席 Token → ③ SSO Token → ④ 会话 Token；都没有则回退到会话 Cookie。

::: warning Token 安全
未配置 scope 的静态 API Token 会被视为**超级管理员**权限，启动时输出告警。生产环境务必为每个 Token 配置最小 scope。
:::

## RBAC 权限模型

权限点格式为 `resource:action`（如 `cdr:read`、`extensions:write`、`system:write`）。角色（role）持有权限点集合，用户（user）关联角色，部门（department）组织用户层级。

- 控制台内每个 handler 调用 `state.require_permission(&user, "cdr", "read")` 式检查
- 静态 API Token 的 scope 会映射到同一套权限点
- 话机 Token 只有固定受限集：`callcontrol:read/command`、`cdr:read`、`sipflow:read`、`presence:read`、`dashboard:read`
- 超级管理员拥有通配权限

权限点与 scope 的完整对照表见 [认证与权限](/apiguide/authentication)，用户 / 角色 / 部门接口见 [用户 / 角色 / 部门](/api/users-roles)。

## MFA（TOTP 两步验证）

控制台支持 TOTP（`totp-rs`）两步验证：

- 开关：`[console].require_mfa = true` 强制所有用户启用
- 用户侧：`enable_mfa`（生成密钥 + 二维码）→ 每次登录后校验 6 位动态码
- 防爆破：连续失败会临时锁定（`mfa_record_failure` / `mfa_is_locked`）
- MFA 会话用独立的临时 cookie `rustpbx_mfa`，验证通过后才换发正式会话
- 管理员可重置：`POST /api/settings/users/{id}/mfa/reset`

## 登录锁定与封禁（BanStore）

`src/security/` 实现基于数据库的封禁存储（`security_ban` 表）+ 内存失败计数：

- 登录失败次数超阈值 → 封禁来源 IP / 账号
- 封禁事件可通过 Webhook 或邮件告警（`[security].alerts`）
- 管理接口：`GET / DELETE /ami/v1/bans`、`GET / DELETE /ami/v1/frequency_limits`

## AMI 安全

AMI 运维接口（`/ami/v1`）**不走 RBAC**，而是：

1. **IP 白名单**（`[ami].allows`）—— 生产环境务必限制到内网 / 管理网段
2. 集群 peer 节点旁路
3. 控制台超级管理员会话（或 `ami:access` 权限）旁路

::: warning 不要暴露 AMI 到公网
AMI 提供 `/shutdown`（停机）、`/reload/*`（热重载）、`/hangup/{id}`（挂断任意通话）等高危操作，且经 IP 白名单授权 —— 暴露公网等于把 PBX 交给别人。
:::

## 多租户与品牌

`src/branding.rs` 支持控制台品牌化（logo、标题等）；商业版支持部门 / 租户隔离与 SSO（配置演练见 [SSO 接入演练](/config/sso_walkthrough)）。
