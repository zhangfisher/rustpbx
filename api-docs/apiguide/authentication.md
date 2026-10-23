# 认证与权限

所有 `{api_prefix}`（默认 `/api`）下的 REST 接口都经过统一的 API 认证中间件，按以下顺序解析身份：

1. `Authorization: Bearer <token>` 头
2. 控制台会话 Cookie（浏览器场景）

两者都没有时返回 `401`。

## 1. 静态 API Token（推荐用于服务端集成）

```toml
[[console.api_tokens]]
token = "my-secret-token"
description = "CRM integration"
scopes = ["call.control", "recording"]
```

```http
GET /api/calls/active HTTP/1.1
Authorization: Bearer my-secret-token
```

### scope 与权限的映射

Token 的 `scopes` 会在启动后换算成 `resource:action` 权限点，请求时按权限点校验：

| scope | 等价权限点 |
| :--- | :--- |
| `*` | 全部权限 |
| `call` / `call.control` / `session` | `callcontrol:read`、`callcontrol:command`、`presence:read` |
| `recording` / `record` | `cdr:read`、`recording:read` |
| `media` | `sipflow:read`、`recording:read` |
| `system` | `system:read` |
| `system.admin` | `system:read`、`system:write` |
| `users` | `users:manage` |
| `extensions` | `extensions:read`、`extensions:write`、`extensions:delete` |
| `trunks` | `trunks:read`、`trunks:write` |
| `routes` | `routes:read`、`routes:write` |
| `departments` | `departments:read`、`departments:write` |
| `资源名:动作`（任意） | 原样作为权限点，如 `cdr:delete` |
| 其他任意字符串 `foo` | 展开为 `foo:*`，如 `sipflow:*` |

::: warning 无 scope 的 Token 是超级权限
`scopes` 留空的 Token 以 **超级管理员** 身份通过认证。服务启动时会打印告警，生产环境请务必显式声明 scope。
:::

### 手机话机 / 坐席令牌

若配置了话机侧鉴权（phone auth validator），Bearer 令牌也可由注册话机或坐席客户端签发。这类令牌固定只能获得以下权限（**不是**超级用户）：

```
callcontrol:read, callcontrol:command,
cdr:read, sipflow:read, presence:read, dashboard:read
```

### 常用权限点速查

| 权限点 | 用途 |
| :--- | :--- |
| `callcontrol:read` / `callcontrol:command` | 查询 / 控制活动通话 |
| `cdr:read` / `cdr:write` / `cdr:delete` | 查询 / 修改 / 删除通话记录 |
| `recording:read`、`sipflow:read` | 录音与 SipFlow 信令/媒体 |
| `extensions:*`、`trunks:*`、`routes:*` | 分机、中继、路由资源 |
| `departments:*`、`users:manage` | 部门与用户体系 |
| `system:read` / `system:write` | 设置、日志、插件、热重载 |
| `reports:read`（或 `cdr:read`） | 报表接口 |
| `ami:access` | 绕过 AMI IP 白名单 |

## 2. 会话 Cookie（浏览器 / 控制台）

控制台登录（`POST {base_path}/login`）后，浏览器持有会话 Cookie，REST 接口同样接受该身份。

::: warning 非安全方法需要 CSRF 双提交
使用 **Cookie 认证** 时，`POST` / `PUT` / `PATCH` / `DELETE` 必须同时携带：

- Cookie：`csrf_token=<token>`
- 请求头：`x-csrf-token: <token>`

否则返回 `403 {"status":"error","message":"CSRF token missing or invalid"}`。

使用 `Authorization: Bearer …` 头时会跳过 CSRF 检查，服务端集成请优先用 Bearer。
:::

## 3. 错误响应

| 状态码 | 场景 | 响应体 |
| :--- | :--- | :--- |
| `401` | 未认证 / Token 无效或过期 | `{"status":"error","message":"authentication required"}` 或 `{"status":"error","message":"invalid or expired token"}` |
| `403` | 已认证但权限不足 | `{"status":"error","message":"Permission denied"}` |
| `403` | CSRF 校验失败（仅 Cookie 认证的写操作） | `{"status":"error","message":"CSRF token missing or invalid"}` |
| `403` | AMI 接口 IP 不在白名单 | `{"error":"Access denied","message":"…"}` |

## 4. 示例：用 Token 调用受限接口

```bash
# 只授予通话控制权限的 Token
curl -s -H "Authorization: Bearer $CONTROL_TOKEN" \
  http://127.0.0.1:8080/api/calls/active

# 越权访问分机管理 -> 403
curl -s -H "Authorization: Bearer $CONTROL_TOKEN" \
  -H 'Content-Type: application/json' \
  -X POST -d '{"page":1,"per_page":10}' \
  http://127.0.0.1:8080/api/extensions
# {"status":"error","message":"Permission denied"}
```
