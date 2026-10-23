# 通用约定

本页描述所有 REST 接口共享的请求/响应约定，各接口页面不再重复解释。

## Base URL 与路径

```
http://<host>:<port>{api_prefix}<endpoint>
```

- `{api_prefix}` 默认 `/api`，由 `[console].api_prefix` 配置。
- 路径参数写作 `{id}`、`{session_id}`、`{call_id}` 等。
- 接口返回 JSON（下载类接口除外：CSV、WAV、PCAP、JavaScript）。

## 请求体

- 写操作与列表查询的请求体均为 JSON，需带 `Content-Type: application/json`。
- 列表查询统一使用 **POST + `ListQuery` 请求体**；使用 URL 查询参数的接口（CDR 导出、报表、仪表盘、日志、SipFlow 时间窗等）会在各自页面单独标注。
- 字段命名以 `snake_case` 为主；少数结构使用 `camelCase`（见下表），请以各页面的字段表为准：

| 结构 | 命名风格 |
| :--- | :--- |
| CDR 更新 `PATCH /call-records/{id}`（`tags`、`note.text`） | `camelCase` |
| 录音播放查询（`stream`、`segment`） | `camelCase` |
| SipFlow CDR 查询（`detail`、`flush`、`scope`） | `camelCase` |
| 路由栈更新 `PATCH /routing-stack/{id}`（`evalMode`） | `camelCase` |
| 其余请求/响应体 | `snake_case` |

## 分页

### ListQuery 请求体

```json
{
  "page": 1,
  "per_page": 20,
  "per_page_min": 5,
  "per_page_max": 100,
  "filters": { },
  "sort": "created_at_desc"
}
```

| 字段 | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | int | `1` | 页码，最小为 1 |
| `per_page` | int | `20` | 每页条数，会被夹取到 `[per_page_min, per_page_max]` |
| `per_page_min` / `per_page_max` | int | `5` / `100` | 每页条数上下限（客户端可自定义） |
| `filters` | object | — | 各资源自己的过滤条件，见对应页面 |
| `sort` | string | `created_at_desc` | 排序键，见对应页面 |

### 分页响应

```json
{
  "page": 1,
  "per_page": 20,
  "total_pages": 3,
  "total_items": 42,
  "items": [ ]
}
```

| 字段 | 说明 |
| :--- | :--- |
| `page` | 当前页码（从 1 开始；越界页会被夹取到最后一页） |
| `per_page` | 实际生效的每页条数 |
| `total_pages` | 总页数（至少为 1） |
| `total_items` | 总条数 |
| `items` | 数据数组 |

部分接口（如 CDR 列表）还会附带 `summary` 统计字段。

::: tip items 的结构
不同资源的 `items` 元素结构不同，例如分机列表的元素是
`{ "extension": {...}, "departments": [...], "registrations": {...} }`，详见各资源页面。
:::

## 错误信封

绝大多数错误返回统一结构：

```json
{ "status": "error", "message": "人类可读的错误描述" }
```

| 状态码 | 含义 |
| :--- | :--- |
| `400` | 参数错误（缺必填字段、正则非法、命令执行失败等） |
| `401` | 未认证或 Token 无效 |
| `403` | 权限不足 / CSRF 校验失败 / AMI IP 不在白名单 |
| `404` | 资源不存在（部分接口返回 `{"message":"… not found"}`） |
| `413` | 请求体过大（如会话 user_data 超过 16 KiB） |
| `500` | 服务端内部错误 |
| `503` | 依赖能力未启用（如应用未初始化、转写未配置、外呼模块未开启） |

::: warning 兼容性说明
少数历史接口的错误体只有 `{"message":"…"}`（没有 `status` 字段），调用方建议同时判断
HTTP 状态码与 `message` 字段。
:::

## 时间与标识

- 时间戳多为 RFC3339/ISO8601 字符串（如 `2026-10-21T08:30:00Z`）；报表与 Locator 事件中会出现 UNIX 秒级时间戳。
- 日期过滤（`date_from` / `date_to`、报表 `from` / `to`）接受 `YYYY-MM-DD` 或 RFC3339。
- 时区参数（报表 `tz`）接受 `+08:00` / `08:00` / `8`，默认 UTC。
- `session_id` 是一路通话（逻辑会话）的唯一标识；`call_id` 是 SIP Call-ID；CDR 的 `{id}` 是记录主键。

## 通用行为

- **CSRF**：仅 Cookie 认证的写操作需要 CSRF 头，Bearer 请求跳过，见[认证与权限](/apiguide/authentication)。
- **审计日志**：通话命令等敏感操作会写入审计日志（`audit_event=call_command`）。
- **集群**：集群部署下，活动通话与会话数据可能由对端节点返回，响应中的 `node` 字段标识来源（`local` 或节点地址）。
