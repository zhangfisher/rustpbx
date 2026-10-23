# AMI API 总览

AMI（Admin Management Interface）是 RustPBX 的**运维级**低层接口：健康检查、
对话转储、配置热重载、优雅停机、外呼 SSE 与集群操作。

- 默认前缀：`/ami/v1`（由 `[proxy].ami_path` 配置）
- 与 Console REST（`/api`）**相互独立**：路径、鉴权、错误格式都不同

## 鉴权

AMI 按以下顺序放行（任一命中即可）：

1. **IP 白名单** `[ami].allows`
   - 默认仅允许本机：`127.0.0.1`、`::1`、`localhost`
   - 支持精确 IP、CIDR（`10.20.0.0/16`、`2001:db8::/32`）与通配 `*`
   - 显式配置列表后**只**允许列表内地址（不再默认包含本机）；空列表 = 全部拒绝
2. **集群对端**：请求来源等于 `[cluster].peers` 中某个节点地址
3. **控制台超级用户会话**：携带有效会话 Cookie 且为超级用户，或拥有 `ami:access` 权限

::: warning 拒绝响应
未命中时返回：

```json
HTTP/1.1 403 Forbidden
{ "error": "Access denied", "message": "You don't have permission to access AMI interfaces" }
```
:::

```toml
[ami]
allows = ["127.0.0.1", "10.0.0.0/8", "*"]
```

```bash
curl -s http://127.0.0.1:8080/ami/v1/health | jq .status
```

## 端点分组

| 分组 | 端点 | 文档 |
| :--- | :--- | :--- |
| 健康与诊断 | `GET /health`、`GET /dialogs`、`GET /transactions`、`GET /hangup/{id}`、`GET /trunk_registrations`、`GET /sipflow/flow/{call_id}`、`GET /sipflow/media/{call_id}` | [健康检查与诊断](/api/ami-health) |
| 运维操作 | `POST /reload/{trunks,routes,acl,app,queues,ivr}`、`POST /shutdown`、`GET`/`DELETE /frequency_limits`、`GET`/`DELETE /bans` | [热重载与运维](/api/ami-ops) |
| 外呼与集群 | `POST /outbound/dial`、`GET /calls`、`POST /cluster/*` | [外呼 SSE 与集群](/api/ami-cluster) |

::: tip 何时用 AMI、何时用 Console REST
- **业务集成**（CRM、计费、报表）→ Console REST `/api` + Bearer Token
- **运维/排障**（健康、热重载、停机、原始对话）→ AMI `/ami/v1` + IP 白名单
- 部分能力两边都有（如 SipFlow 查询），AMI 侧无需会话，适合监控系统抓取
:::

## 与 Console REST 的差异

| | Console REST (`/api`) | AMI (`/ami/v1`) |
| :--- | :--- | :--- |
| 鉴权 | Bearer Token / 会话 + CSRF | IP 白名单 / 超管会话 |
| 权限模型 | `resource:action` 细粒度 | 整体放行或拒绝 |
| 错误格式 | `{"status":"error","message":…}` | `{"error":…,"message":…}` 等 |
| 面向 | 业务系统 | 运维、监控、集群 |
