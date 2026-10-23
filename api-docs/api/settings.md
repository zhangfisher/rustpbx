# 系统设置与日志

运行时修改 `config.toml` 的关键配置段（直接写回配置文件），以及服务日志的读取与跟随。

- 权限：配置写入需 `system:write`（RWI 设置额外接受 `ami:access`），日志读取需 `system:read`
- 前缀：`{api_prefix}`（默认 `/api`）
- 方法：配置用 **PATCH**（部分更新），测试用 **POST**，日志用 **GET**

::: warning 写配置会落盘
所有 `PATCH /settings/config/*` 都会修改磁盘上的 `config.toml` 并触发相应热更新流程，
请确保调用方具备 `system:write` 权限（建议使用带 scope 的专用 Token，如 `scopes=["system.admin"]`）。
:::

## 配置 PATCH 端点

| 端点 | 配置段 | 主要字段 |
| :--- | :--- | :--- |
| `PATCH /settings/config/platform` | 顶层 | `log_level`、`log_file`、`external_ip`、`auto_external_ip`、`sip_external_ip`、`auto_sip_external_ip`、`local_networks`、`contact_lan_use_bind`、`sip_contact_always_bind`、`rtp_start_port`、`rtp_end_port` |
| `PATCH /settings/config/network-profiles` | `[[network_profile]]` | `default`、`profiles[]`（每项需非空唯一 `id`，`rtp_start_port <= rtp_end_port`） |
| `PATCH /settings/config/proxy` | `[proxy]` | `realms`、`registrar_expires`、`max_registrar_expires`、`locator_webhook`、`rwi_webhook`、`user_backends`、`http_router`、`jwt_auth`、`max_ring_time`、`ivr_fallback` |
| `PATCH /settings/config/storage` | `[recording]` / `[callrecord]` | `recorder_path`、`recorder_format`、`callrecord`（`type` 标签联合：`disabled`/`local`/…）、`recording_policy` |
| `PATCH /settings/config/security` | ACL / DoS / 紧急路由 | `acl_rules`、`dos_*`、`uri_*`、`emergency`（`enabled`/`numbers`/`emergency_trunk`）、`session_*_channel_capacity` |
| `PATCH /settings/config/rwi` | `[rwi]` | `enabled`、`max_connections`、`max_calls_per_connection`、`orphan_hold_secs`、`originate_rate_limit`、`tokens[]`、`contexts[]` |
| `PATCH /settings/config/cluster` | `[cluster]`（commerce 构建） | 集群节点与同步配置 |

**通用语义**

- 字段多为 `Option<...>`：`null`/缺省 = 不改动；部分字段为 `Option<Option<T>>` 双层包装
  （外层 `None` = 不改动，内层 `None` = 删除该配置项）。
- 校验失败返回 `422`（如网络配置：`Each network profile must have a non-empty id`、
  `Duplicate network profile id: …`、`Default network profile '…' was not found`）。
- 无权限返回 `403 {"status":"error","message":"Permission denied"}`。

### JWT 鉴权子对象（`proxy.jwt_auth`）

```json
{ "enabled": true, "secret": "…", "user_id_claim": "sub", "issuer": "…",
  "audience": "…", "sip_header_name": "X-User", "check_local_user": true,
  "ws_token_param": "token", "dev_mint_enabled": false }
```

## 连通性测试 (POST)

| 端点 | 请求体 | 说明 |
| :--- | :--- | :--- |
| `/settings/config/platform/auto-external-ip/test` | `{ "url": "…" }` | 测试公网 IP 自动探测 |
| `/settings/config/storage/test` | `{ "vendor", "bucket", "region", "access_key", "secret_key", "endpoint", "root" }` | 测试对象存储连通性（`vendor` 必填） |
| `/settings/config/proxy/locator-webhook/test` | `{ "url", "headers": { } }` | 发测试事件到 Locator Webhook |
| `/settings/config/proxy/rwi-webhook/test` | `{ "url", "headers": { } }` | 发测试事件到 RWI Webhook |
| `/settings/config/proxy/http-router/test` | `{ "url", "headers": { } }` | 测试 HTTP Router 回调 |
| `/settings/config/proxy/user-backend/test` | `{ "backend": { "type": "http", "url": "…", … } }` | 测试用户后端查询 |

## 日志接口

| 端点 | 查询参数 | 说明 |
| :--- | :--- | :--- |
| `GET /settings/logs/nodes` | — | 可用节点列表（单机返回本机） |
| `GET /settings/logs/recent` | `limit`、`node` | 最近若干行日志 |
| `GET /settings/logs/follow` | `position`、`limit`、`node` | 从 `position` 起增量拉取（轮询用） |
| `GET /settings/logs/stream` | `position`、`limit`、`node` | SSE 流式跟随（长连接） |

```bash
curl -sN -H "Authorization: Bearer $TOKEN" \
  "$BASE/settings/logs/stream?limit=100"
```

## 集群（commerce 构建）

| 端点 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/settings/config/cluster` | PATCH | 更新集群配置 |
| `/settings/config/cluster/reload` | GET (SSE) | 集群配置重载进度流 |
| `/settings/config/cluster/reload-addons` | GET | 可重载插件列表 |

## 待重载状态

```http
GET {api_prefix}/pending-reloads
```

返回修改路由/中继/队列/ACL 后**尚未生效**的重载目标列表，供控制台提示与集成方轮询。
