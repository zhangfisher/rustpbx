# SIP 中继 (Trunks)

管理上游运营商/网关中继：创建、查询、修改、删除，口令揭示与依赖检查。

- 权限：读 `trunks:read`、写 `trunks:write`
- 前缀：`{api_prefix}`（默认 `/api`）

## 查询中继

```http
POST {api_prefix}/sip-trunk
Content-Type: application/json
```

请求体为标准 `ListQuery`，`filters` 字段：

| 过滤字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `q` | string | 名称等关键字 |
| `status` | string | 状态过滤 |
| `direction` | string | 方向过滤（入站/出站/双向） |
| `transport` | string | SIP 传输过滤（`UDP` / `TCP` / `TLS` / `WS` / `WSS`） |
| `only_active` | bool | 仅返回启用的中继 |

**200 响应**：标准分页结构
`{ "page", "per_page", "total_pages", "total_items", "items": [ … ] }`

## 创建中继

```http
PUT {api_prefix}/sip-trunk
```

**请求体**（`SipTrunkForm`，全部字段可选，未提交的取默认值）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `name` | string | 中继名（路由与命令中按名字引用） |
| `display_name` | string | 显示名 |
| `carrier` | string | 运营商标识 |
| `description` | string | 描述 |
| `status` | string | 状态 |
| `direction` | string | 方向（入站/出站/双向） |
| `sip_server` | string | 对端 SIP 地址（`host:port` 或 URI） |
| `sip_transport` | string | `UDP` / `TCP` / `TLS` / `WS` / `WSS` |
| `outbound_proxy` | string | 出站代理 |
| `auth_username` | string | 鉴权用户名 |
| `auth_password` | string | 鉴权口令（只写，见下文揭示接口） |
| `default_route_label` | string | 默认路由标签 |
| `tenant_id` / `clear_tenant` | int / bool | 租户绑定 / 解绑 |
| `max_cps` | int | 每秒呼叫数上限 |
| `max_concurrent` | int | 并发呼叫上限 |
| `max_call_duration` | int | 单通最长通话时长（秒） |
| `utilisation_percent` | float | 容量占用告警阈值（%） |
| `warning_threshold_percent` | float | 预警阈值（%） |
| `allowed_ips` | string | 允许的来源 IP（白名单文本） |
| `did_numbers` | string | 绑定的 DID 号段 |
| `billing_snapshot` | string | 计费快照（JSON 字符串） |
| `analytics` | string | 分析配置（JSON 字符串） |
| `tags` | string | 标签 |
| `incoming_from_user_prefix` / `incoming_to_user_prefix` | string | 入站号码前缀改写 |
| `ice_lite` | bool | ICE-lite 开关（写入 `metadata.sbc.ice_lite`；`null` 保持不变） |
| `metadata` | string | 元数据（JSON 字符串） |
| `is_active` | bool | 是否启用 |
| `register_enabled` | bool | 是否向对端注册 |
| `register_expires` | int | 注册有效期（秒） |
| `register_extra_headers` | string | 注册附加头（JSON 字符串） |

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"carrier-a","sip_server":"203.0.113.10:5060","direction":"both",
       "auth_username":"10000","auth_password":"secret","is_active":true}' \
  "$BASE/sip-trunk"
```

## 修改中继

```http
PATCH {api_prefix}/sip-trunk/{id}
```

请求体同 `SipTrunkForm`，**部分更新**语义：只更新提交的字段；
`clear_tenant: true` 用于解除租户绑定。

## 删除中继

```http
DELETE {api_prefix}/sip-trunk/{id}
```

## 揭示鉴权口令

口令不再包含在列表/详情载荷中，需要单独读取：

```http
GET {api_prefix}/sip-trunk/{id}/auth-password
```

**200 响应**

```json
{ "id": 3, "auth_password": "secret" }
```

| 状态码 | 场景 |
| :--- | :--- |
| `404` | 中继不存在（`{"message":"SIP trunk not found"}`） |
| `403` | 缺少 `trunks:read` |

## 依赖检查

```http
GET {api_prefix}/sip-trunk/{id}/dependencies
```

返回该中继被哪些路由/资源引用（删除前的依赖确认）。需 `trunks:read`。

## 常见错误

| 状态码 | 场景 |
| :--- | :--- |
| `400` | 字段校验失败 |
| `403` | 权限不足 |
| `404` | 中继不存在 |
| `500` | 数据库错误 |

::: tip 诊断中继连通性
用 [诊断接口](/api/diagnostics) 测试中继地址解析、IP 白名单匹配与 SIP OPTIONS 探活。
:::
