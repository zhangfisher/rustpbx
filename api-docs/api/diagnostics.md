# 诊断 (Diagnostics)

不触碰生产配置即可验证中继、路由与注册状态的排障工具集。

- 认证：登录身份；写类操作（清理注册）按系统权限校验
- 前缀：`{api_prefix}`（默认 `/api`）

## SIP 对话转储

```http
GET {api_prefix}/diagnostics/dialogs?call_id=&limit=
```

| 查询参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `call_id` | string | 按 Call-ID 过滤 |
| `limit` | int | 返回条数 |

**200 响应**

```json
{
  "generated_at": "2026-10-21T08:00:00Z",
  "total": 2,
  "has_more": false,
  "items": [
    {
      "id": "…", "call_id": "…", "from_tag": "…", "to_tag": "…",
      "role": "caller", "state": "established", "state_detail": null,
      "from_display": "1001", "to_display": "200",
      "remote_contact": "sip:…", "offer": "…", "answer": "…"
    }
  ]
}
```

## 中继 IP 白名单测试

```http
POST {api_prefix}/diagnostics/trunks/test
```

```json
{ "trunk": "carrier-a", "address": "203.0.113.42" }
```

**200 响应**

```json
{
  "trunk": "carrier-a",
  "address": "203.0.113.42",
  "evaluated_at": "2026-10-21T08:00:00Z",
  "resolved_ips": ["203.0.113.42"],
  "ip_results": [
    { "ip": "203.0.113.42", "matched": true, "matched_sources": ["allowed_ips"] }
  ],
  "overall_match": true,
  "direction": "both",
  "allows_inbound": true,
  "allows_outbound": true
}
```

## SIP OPTIONS 探活

```http
POST {api_prefix}/diagnostics/trunks/options
```

```json
{ "trunk": "carrier-a", "address": "203.0.113.10:5060", "timeout_ms": 1500, "transport": "udp" }
```

| 字段 | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `trunk` | string | 必填 | 中继名 |
| `address` | string | 跟随中继 | 覆盖探测目标地址 |
| `timeout_ms` | int | `1500` | 超时，夹取到 `100..=20000` |
| `transport` | string | `udp` | `udp` / `tcp` / `tls` / `ws` / `wss`（目前实际支持 `udp`，其他返回 `400` 并提示 `unsupported transport`） |

**200 响应**

```json
{
  "trunk": "carrier-a",
  "target_uri": "sip:203.0.113.10:5060",
  "evaluated_at": "…",
  "transport": "udp",
  "success": true,
  "attempts": [
    { "destination": "203.0.113.10:5060", "transport": "udp", "success": true,
      "latency_ms": 12, "status_code": 200, "server": "…", "raw_response": "…" }
  ]
}
```

响应预览截断至 512 字符；失败的尝试会在 `attempts[].error` 中给出原因。

## 路由模拟求值

```http
POST {api_prefix}/diagnostics/routes/evaluate
```

```json
{
  "callee": "008613800138000",
  "caller": "1001",
  "direction": "outbound",
  "request_uri": "sip:008613800138000@pbx.local",
  "source_ip": "10.0.0.5",
  "headers": { "X-CRM-Tier": "gold" },
  "cluster": false
}
```

| 字段 | 说明 |
| :--- | :--- |
| `callee` / `caller` | 被叫（必填）与主叫 |
| `direction` | `inbound` / `outbound` / `internal` |
| `dataset` | 使用指定数据集求值（缺省用运行时数据） |
| `cluster` | `true`（默认，运行时数据集时）同时对全部集群对端求值并对比 |
| `source_trunk` / `source_ip` / `request_uri` / `headers` | 影响匹配的上下文 |

**200 响应**

```json
{
  "evaluated_at": "…",
  "direction": "outbound",
  "caller": "1001",
  "callee": "008613800138000",
  "request_uri": "sip:…",
  "source_trunk": null,
  "detected_trunk": "carrier-a",
  "source_ip": "10.0.0.5",
  "matched_rule": "strip-00-to-carrier",
  "…": "命中的动作与目标信息"
}
```

## 注册定位查询

```http
POST {api_prefix}/diagnostics/locator/lookup
```

```json
{ "user": "879831001" }
```

也可用 `{"uri": "sip:879831001@pbx.local"}` 直接给 URI。

**200 响应**

```json
{
  "generated_at": "…",
  "total": 1,
  "query": { "user": "879831001", "uri": "sip:879831001@localhost" },
  "records": [
    { "binding_key": "…", "aor": "sip:…", "destination": "TLS 1.2.3.4:5060",
      "expires": 3600, "supports_webrtc": false, "transport": "TLS",
      "user_agent": "MicroSIP/3.21.3", "home_proxy": "10.0.0.12:5060", "…": "…" }
  ]
}
```

`total > 0` 即表示该账号当前在线——可作为 HTTP Router 的在线判断依据。

## 注册定位清理

```http
POST {api_prefix}/diagnostics/locator/clear
```

清理指定绑定（配合 `user` / `uri` 定位）。

**200 响应**：`{ "removed": true, "remaining": 0 }`

::: warning 影响线上注册
清理后对应终端需重新 REGISTER 才能恢复，请谨慎调用。
:::

## 错误响应

| 状态码 | 场景 |
| :--- | :--- |
| `400` | 参数非法（不支持的 transport、缺少必填字段） |
| `401` / `403` | 认证或权限不足 |
| `503` | 依赖能力未就绪 |
