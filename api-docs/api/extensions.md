# 分机 (Extensions)

SIP 分机（话机/软电话账号）的增删改查、口令揭示与批量导入。

- 权限：读 `extensions:read`、写 `extensions:write`、删 `extensions:delete`
- 前缀：`{api_prefix}`（默认 `/api`）

## 查询分机

```http
POST {api_prefix}/extensions
Content-Type: application/json
```

请求体为标准 `ListQuery`（见[通用约定](/apiguide/conventions)），`filters` 字段：

| 过滤字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `q` | string | 模糊匹配分机号、显示名、邮箱 |
| `department_ids` | int[] | 部门过滤（多选时要求**同时属于**全部所选部门） |
| `call_forwarding_enabled` | bool | 是否开启了呼叫转移 |
| `status` | string | 状态精确过滤 |
| `login_allowed` | bool | 是否允许登录控制台 |
| `created_at_from` / `created_at_to` | string | 创建时间范围 |
| `registered_at_from` / `registered_at_to` | string | 注册时间范围 |

**`sort` 可选值**：`created_at_desc`（默认）、`created_at_asc`、`extension_asc`、`extension_desc`、
`display_name_asc`、`display_name_desc`、`status_asc`、`status_desc`、`registered_at_asc`、`registered_at_desc`。

**200 响应**

```json
{
  "page": 1,
  "per_page": 20,
  "total_pages": 1,
  "total_items": 2,
  "items": [
    {
      "extension": {
        "id": 7,
        "extension": "1001",
        "display_name": "张三",
        "email": "zhangsan@example.com",
        "sip_password": null,
        "status": "active",
        "call_forwarding_mode": null,
        "…": "分机模型其余字段",
        "created_at": "…",
        "registered_at": "…"
      },
      "departments": [ { "id": 1, "name": "sales" } ],
      "registrations": {
        "available": true,
        "total": 1,
        "records": [ { "aor": "sip:1001@…", "destination": "UDP 1.2.3.4:5060", "transport": "UDP", "…": "…" } ]
      }
    }
  ]
}
```

::: warning 列表接口不返回口令
`items[].extension.sip_password` 恒为 `null`——SIP 口令是**只写**字段，只能通过
[揭示口令接口](#揭示-sip-口令)单独读取。
:::

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"page":1,"per_page":20,"filters":{"q":"1001"},"sort":"extension_asc"}' \
  "$BASE/extensions"
```

## 创建分机

```http
PUT {api_prefix}/extensions
```

**请求体**（`ExtensionPayload`）

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `extension` | string | **是** | 分机号，缺失或空返回 `400 "Extension is required"` |
| `display_name` | string | 否 | 显示名 |
| `email` | string | 否 | 邮箱 |
| `sip_password` | string | 否 | SIP 注册口令 |
| `call_forwarding_mode` | string | 否 | 呼叫转移模式（`none` 等） |
| `call_forwarding_destination` | string | 否 | 转移目标 |
| `call_forwarding_timeout` | int | 否 | 转移振铃超时（秒） |
| `login_disabled` | bool | 否 | 禁止登录控制台（默认 `false`） |
| `voicemail_disabled` | bool | 否 | 禁用语音信箱（默认 `false`） |
| `allow_guest_calls` | bool | 否 | 允许匿名呼叫（默认 `false`） |
| `notes` | string | 否 | 备注 |
| `department_ids` | int[] | 否 | 所属部门 |

**200 响应**：`{"status":"ok","id":7}`

## 修改分机

```http
PATCH {api_prefix}/extensions/{id}
```

请求体同创建；所有字段可选，**只更新提交的字段**（`department_ids` 传入即整体替换所属部门）。

## 删除分机

```http
DELETE {api_prefix}/extensions/{id}
```

需 `extensions:delete` 权限。

## 揭示 SIP 口令

```http
GET {api_prefix}/extensions/{id}/sip-password
```

**200 响应**

```json
{ "id": 7, "sip_password": "ChangeMe#1" }
```

| 状态码 | 场景 |
| :--- | :--- |
| `404` | 分机不存在（`{"message":"Extension not found"}`） |
| `403` | 缺少 `extensions:read` |
| `500` | 数据库读取失败 |

## 批量导入 (CSV 行)

```http
POST {api_prefix}/extensions/import
```

**请求体**

```json
{
  "extensions": [
    {
      "extension": "1001",
      "display_name": "张三",
      "email": "zhangsan@example.com",
      "sip_password": "ChangeMe#1",
      "login_disabled": "false",
      "voicemail_disabled": "false",
      "allow_guest_calls": "false",
      "call_forwarding_mode": "",
      "call_forwarding_destination": "",
      "call_forwarding_timeout": "15",
      "notes": "",
      "departments": "sales,ops"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `extension` | string | **必填**，最长 32 字符，不能与已有分机重复 |
| 布尔类（`login_disabled` 等） | string | 以字符串提交的布尔值，空值视为默认（`false`） |
| `departments` | string | 逗号分隔的部门名 |

**逐行校验**：空分机号、超过 32 字符、分机已存在都会被跳过并计入 `errors`
（错误消息带行号，如 `Row 2: extension '1001' already exists`），其余行继续导入。
响应汇总 `imported` / `skipped` / `errors`。

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @import.json "$BASE/extensions/import"
```

## 常见错误

| 状态码 | 场景 |
| :--- | :--- |
| `400` | 缺少 `extension`（创建时） |
| `401` / `403` | 认证失败或缺少对应权限点 |
| `404` | 分机不存在 |
| `500` | 数据库错误（`{"message":"…"}`） |
