# REST API 与 AMI

RustPBX 对外有三套 HTTP 接口：

| 接口 | 前缀 | 用途 |
|---|---|---|
| REST API | `/api`（可配 `console.api_prefix`） | 控制台同源的资源管理接口（分机、中继、CDR、设置…） |
| AMI | `/ami/v1` | 管理面：健康、热重载、集群、外呼、SipFlow 查询 |
| RWI | `/rwi/v1` | 实时 WebSocket 控制面（见 [RWI](/interfaces/rwi)） |

> REST API 的逐端点参考见 **[API 文档站](https://github.com/restsend/rustpbx/tree/main/api-docs)**（`api-docs/`，含调用指南、认证说明与全部分组）。本页概述认证与 AMI。

## REST API 认证

认证中间件按以下顺序匹配（命中即止）：

1. **静态 API Token**——`[console.api_tokens]` 配置，绑定 scopes；
2. **电话 / 坐席 Token**——插件提供校验器，权限固定为：`callcontrol:read`、`callcontrol:command`、`cdr:read`、`sipflow:read`、`presence:read`、`dashboard:read`；
3. **SSO broker Token**（商业版）；
4. **Session cookie**（控制台登录）；
5. 全部不匹配 → `401`。

所有变更请求（POST/PUT/PATCH/DELETE）额外过 CSRF guard——Token 认证不受影响，cookie 认证需带 CSRF token。

## 权限模型

`resource:action` 格式（如 `trunks:read`、`system:write`），支持：

- `*`：全部权限；
- `resource:*`：某资源全部动作；
- scope 别名展开：`call.control` → `callcontrol:read + command + presence:read`；`recording` → `cdr:read + recording:read`；`system.admin` → `system:read + write` 等。

## REST API 主要分组

| 分组 | 示例端点 |
|---|---|
| 通话控制 | `/api/call-control`（实时呼叫列表与命令） |
| 分机 | `/api/extensions`（CRUD、SIP 密码、导入） |
| SIP 中继 | `/api/sip-trunk`（CRUD、依赖查询） |
| 路由 | `/api/routing`（规则 CRUD、克隆、启停） |
| 通话记录 | `/api/call-records`（CDR 查询、录音流、SipFlow、CSV 导出） |
| SipFlow | `/api/sipflow`（信令流查询、设置） |
| 仪表盘 / 报表 / 诊断 | `/api/dashboard`、`/api/reports`、`/api/diagnostics` |
| 设置 / 用户 / 角色 | `/api/settings`、`/api/users`、`/api/roles` |
| 在席 / 指标 / 插件 | `/api/presence`、`/api/metrics`、`/api/addons` |

## AMI（管理接口）

默认路径 `/ami/v1`（`[proxy] ami_path` 可改）。鉴权链：**IP 白名单**（`[ami] allows`，默认仅本机；集群 peer IP 自动放行）→ console 超管或 `ami:access` 权限 → 403。

| 端点 | 说明 |
|---|---|
| `GET /ami/v1/health` | 健康检查 |
| `GET /ami/v1/dialogs` / `transactions` | 当前对话 / 事务 |
| `POST /ami/v1/hangup/{id}` | 挂断指定呼叫 |
| `POST /ami/v1/shutdown` | 触发优雅排水停机 |
| `POST /ami/v1/reload/{trunks,routes,acl,app,queues,ivr}` | 细粒度热重载 |
| `GET /ami/v1/trunk_registrations` | 中继注册状态 |
| `GET /ami/v1/bans` | 当前封禁列表 |
| `GET /ami/v1/sipflow/flow/{call_id}` | 信令流查询 |
| `GET /ami/v1/sipflow/media/{call_id}` | 媒体（WAV）查询 |
| `POST /ami/v1/outbound/dial` | 预测式外呼（SSE，`[outbound].enabled` 门控） |
| `/ami/v1/cluster/*` | 集群同步与节点操作（商业版） |

```bash
# 健康检查
curl http://127.0.0.1:8080/ami/v1/health

# 热重载中继
curl -X POST http://127.0.0.1:8080/ami/v1/reload/trunks

# 触发外呼（SSE 返回事件流）
curl -N -X POST http://127.0.0.1:8080/ami/v1/outbound/dial \
  -H 'Content-Type: application/json' \
  -d '{"destination": "sip:1001@internal", "caller_id": "1000"}'
```

::: warning 生产加固
AMI 默认只允许本机访问。暴露到网络时务必在 `[ami].allows` 里配置精确的来源 IP/CIDR，并保持 `trust_forward_headers = false`（除非确在会覆写该头的反代之后）。
:::
