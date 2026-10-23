# 通知与其他接口

系统通知、插件启停、多语言包与待重载状态等杂项端点。

- 前缀：`{api_prefix}`（默认 `/api`）
- 认证：登录身份；插件启停额外要求 `system:write`

## 通知

| 端点 | 方法 | 权限 | 说明 |
| :--- | :--- | :--- | :--- |
| `/notifications/unread-count` | GET | 登录身份 | 未读计数 |
| `/notifications/{id}/read` | POST | 登录身份 | 标记单条已读 |
| `/notifications/read-all` | POST | 登录身份 | 全部标记已读 |

**响应**

```json
// GET /notifications/unread-count
{ "count": 3 }

// POST /notifications/{id}/read 与 /notifications/read-all
{ "ok": true }
```

::: tip
未读计数适合做低频轮询（如 30 秒一次）；通知列表页面本身属于控制台页面路由
（`GET {base_path}/notifications`），不在 REST 前缀下。
:::

## 插件管理

```http
POST {api_prefix}/addons/toggle
```

```json
{ "id": "archive", "enabled": true }
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | string | 插件 id（写入 `[proxy].addons` 数组） |
| `enabled` | bool | `true` 追加启用（已存在则不重复），`false` 移除 |

- 权限：`system:write`；修改直接写回 `config.toml`。
- 插件列表与详情属于控制台页面（`GET {base_path}/addons`、`/addons/{id}`），REST 侧仅提供启停。

## 多语言包

```http
GET {api_prefix}/locales/{lang}
```

`{lang}` 语言代码（可带 `.js` 后缀，服务端会剥掉）。

**200 响应**：`Content-Type: application/javascript`，正文形如

```js
window.__i18n_t = { "…": "…" };
```

响应头 `Cache-Control: public, max-age=604800, immutable`（可长期缓存）。

## 待重载项

```http
GET {api_prefix}/pending-reloads
```

返回路由/中继/队列/ACL/应用等修改后尚未热重载的目标集合，
控制台据此提示"有配置待生效"；集成方可在批量改配置后轮询此端点直至清空。
（详见 [系统设置与日志](/api/settings#待重载状态)）

## 错误码手册（控制台页面）

错误码字典接口位于控制台页面路由下（非 REST 前缀）：

```http
GET {base_path}/api/error-codes        # 默认 /console/api/error-codes
```

**200 响应**

```json
{
  "total": 120,
  "groups": [
    { "app": "proxy", "items": [
      { "app": "proxy", "code": "…", "message": "…", "sip_status": 503,
        "hangup_reason": "…", "severity": "warning",
        "locale_key": "…", "remediation_key": "…" }
    ] }
  ]
}
```

用于把 CDR 中的挂断码/错误码翻译成可读说明。
