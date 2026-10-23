# 路由 (Routing)

管理呼入/呼出/内部呼叫的路由规则：匹配条件、改写规则、动作目标与路由栈优先级。

- 权限：读 `routes:read`、写 `routes:write`
- 前缀：`{api_prefix}`（默认 `/api`）
- 修改类操作会标记"路由待重载"，需通过重载（`GET {api_prefix}/pending-reloads` 查看、
  `POST {ami_path}/reload/routes` 或控制台按钮）才会在新呼叫上生效

## 查询路由

```http
POST {api_prefix}/routing
Content-Type: application/json
```

请求体为标准 `ListQuery`，`filters` 字段：

| 过滤字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `q` | string | 名称/模式关键字 |
| `source_context` | string | 来源上下文过滤 |
| `status` | string | 状态过滤 |
| `selection` | string | 选择策略过滤 |
| `owner` | string | 归属人过滤 |

按 `priority` 降序、`name` 升序返回，响应为标准分页结构。

## 路由规则对象 (RouteDocument)

创建与更新使用同一对象：

```json
{
  "name": "strip-00-to-carrier",
  "description": "外呼去 00 前缀走 carrier-a",
  "owner": "ops",
  "direction": "outbound",
  "priority": 100,
  "disabled": false,
  "match": { "to_user": "^00(\\d+)$" },
  "rewrite": { "to_user": "{1}" },
  "action": {
    "select": "roundrobin",
    "hash_key": null,
    "trunks": [ { "name": "carrier-a", "weight": 0 } ],
    "target_type": "sip_trunk"
  },
  "source_trunk": null,
  "notes": []
}
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `name` | string | 规则名（必填，唯一） |
| `description` / `owner` / `notes` | — | 描述、归属、备注 |
| `direction` | string | `inbound` / `outbound` / `internal`（有默认值） |
| `priority` | int | 优先级（数值越大越优先，有默认值） |
| `disabled` | bool | 是否停用（配合 `is_active` 生效） |
| `match` | object | 匹配条件：键为匹配字段（如 `to_user`、`from_user`），值为**正则**；不合法正则返回 `400 "Invalid regex"` |
| `rewrite` | object | 号码改写：值支持反向引用（如 `{1}` 对应第 1 个捕获组） |
| `action` | object | 命中后的动作，见下表 |
| `source_trunk` | string | 限定来源中继名 |
| `id` | int | 只读，服务端维护 |

### action 字段

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `select` | string | 中继/目标选择策略：`roundrobin`（默认，别名 `rr` / `round_robin` / `round-robin`）、`weight`、`hash` |
| `hash_key` | string | `select: hash` 时使用的哈希键字段 |
| `trunks` | array | 中继列表 `[{ "name": "carrier-a", "weight": 0 }]`（按名字引用中继） |
| `target_type` | string | 目标类型：`sip_trunk`（默认）、`queue`、`voicemail`、`ivr`、`realtime` |
| `queue_file` | string | `target_type=queue` 时的队列引用 |
| `voicemail_extension` | string | `target_type=voicemail` 时的语音信箱分机 |
| `ivr_file` | string | `target_type=ivr` 时的 IVR 引用 |
| `realtime_preset` | string | `target_type=realtime` 时的实时预设 |

::: warning 校验
提交前服务端会执行 `validate()`：正则非法、引用了不存在的中继等都会返回 `400` 并附带原因文本。
:::

## 创建路由

```http
PUT {api_prefix}/routing
```

请求体为 `RouteDocument`（`id` 会被忽略）。**200** 表示创建成功。

## 修改路由

```http
PATCH {api_prefix}/routing/{id}
```

整体替换该规则（请先用 `GET {api_prefix}/routing/{id}/data` 取回当前文档再改）。

## 删除 / 克隆 / 启停

```http
DELETE {api_prefix}/routing/{id}          # 删除
POST   {api_prefix}/routing/{id}/clone    # 克隆（自动命名 "xxx (copy)"）
POST   {api_prefix}/routing/{id}/toggle   # 启用 <-> 停用
```

**toggle 响应**

```json
{ "status": "ok", "…": "更新后的启用状态" }
```

三者都会标记路由待重载（`ReloadTarget::Routes`）。

## 路由详情数据

```http
GET {api_prefix}/routing/{id}/data
```

**200 响应**

```json
{
  "route": { "…": "RouteDocument，含中继上下文补全" },
  "trunk_options": [ { "id": 3, "name": "carrier-a" } ],
  "forwarding_catalog": { "queues": [ … ], "ivr_projects": [ … ], "realtime_presets": [ … ] }
}
```

用于编辑页填充下拉选项；`404` 表示路由不存在。

## 路由栈（多来源优先级）

路由可能来自数据库规则、配置文件与插件贡献方，路由栈展示并调整它们的整体顺序：

```http
GET  {api_prefix}/routing-stack
PATCH {api_prefix}/routing-stack/{id}
```

**GET 响应**：路由栈快照（`contributions` 数组：每项含 `id`、`editable`、`priority`、
`eval_mode` 及冲突 `warnings`）。

**PATCH 请求体**（`camelCase`）

```json
{ "enabled": true, "priority": 500, "evalMode": "first_match" }
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `enabled` | bool | 启停该贡献方 |
| `priority` | int | 优先级，必须在 `0..=10000`（越界返回 `400 "priority must be between 0 and 10000"`） |
| `evalMode` | string | 求值模式 |

**错误**：未知贡献方或不可编辑的贡献方返回 `400`（`Unknown routing stack contribution: …` /
`Contribution "…" is not editable from the routing stack`）。

## 常见错误

| 状态码 | 场景 |
| :--- | :--- |
| `400` | 正则非法、引用不存在的中继、参数越界 |
| `403` | 缺少 `routes:read` / `routes:write` |
| `404` | 路由不存在 |
| `500` | 数据库错误（`{"message":"…"}`） |

::: tip 模拟一次路由决策
不实际发起呼叫即可验证规则是否命中：[诊断 → 路由模拟求值](/api/diagnostics#路由模拟求值)。
:::
