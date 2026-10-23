# 状态呈现 (Presence)

查询与设置分机（坐席）的呈现状态，供控制台、坐席软电话与业务系统同步在线状态。

- 前缀：`{api_prefix}`（默认 `/api`）
- 认证：登录身份（会话 Cookie 或 Bearer Token）

::: info 集群语义
状态归属注册节点：写请求落到非属主节点时会被属主节点拒绝，请在坐席**注册所在节点**上写入。
:::

## 查询状态

```http
GET {api_prefix}/presence/{extension}
```

`{extension}` 为分机号（如 `1001`）。

**200 响应**

```json
{
  "success": true,
  "data": {
    "status": "busy",
    "note": "在通话中",
    "activity": "busy",
    "last_updated": 1761024000
  }
}
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `success` | bool | `false` 表示 SIP 服务未就绪（此时 `data` 为 `null`） |
| `data.status` | string | 呈现状态 |
| `data.note` | string \| null | 坐席填写的备注 |
| `data.activity` | string \| null | 活动标签（如 `busy`、`away`） |
| `data.last_updated` | int | 最后更新时间（UNIX 秒） |

## 设置状态

```http
POST {api_prefix}/presence/{extension}
Content-Type: application/json
```

**请求体**

```json
{ "status": "busy", "note": "在通话中", "activity": "busy" }
```

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `status` | string | 是 | 状态值，见下表 |
| `note` | string | 否 | 备注文本 |
| `activity` | string | 否 | 活动标签 |

**常用状态取值**

| 取值 | 含义 |
| :--- | :--- |
| `idle` / `available` | 空闲、可接听 |
| `busy` | 忙 |
| `ringing` | 振铃中 |
| `wrapup` | 话后整理 |
| `dnd` | 免打扰 |
| `away` | 离开（可携带自定义详情，如 `away` + 备注） |
| `offline` | 离线 |

::: tip 归一化行为
未知的自定义状态值会被归一化为"离开"类状态并原样携带取值；读写往返时 `status`
以字符串形式回显，前端可直接做字符串比较（控制台即以 `available` / `busy` / `away` / `offline` 展示）。
:::

**200 响应**：与查询接口相同结构，`data` 为写入后的最新状态。

**错误**：SIP 服务不可用时返回 `200 {"success":false,"data":null}`；认证失败返回 `401`。

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"busy","note":"在通话中"}' \
  "$BASE/presence/1001"
```

::: tip 关联能力
- 终端 REGISTER/注销事件推送（Locator Webhook）属于出站事件，见 [出站 Webhook 概览](/apiguide/webhooks)。
- 分机详情接口会附带注册信息（`registrations`），见 [分机](/api/extensions)。
:::
