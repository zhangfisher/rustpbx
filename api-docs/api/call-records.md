# 通话记录 CDR

查询、导出、修改和删除通话记录（CDR），并获取信令阶梯图与原始 CDR JSON。

- 权限：读取需 `cdr:read`，修改需 `cdr:write`，删除需 `cdr:delete`
- 前缀：`{api_prefix}`（默认 `/api`）

::: tip 记录寻址方式
`{id}` 路径参数既接受**数字主键**，也接受 **SIP Call-ID**（`sip-flow`、`cdr-json` 接口两者皆可；
`recording` 接口只接受数字主键）。
:::

## 查询通话记录

```http
POST {api_prefix}/call-records
Content-Type: application/json
```

请求体为标准 `ListQuery`（见[通用约定](/apiguide/conventions)），`filters` 字段如下：

| 过滤字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `q` | string | 关键字（主叫/被叫等模糊匹配） |
| `status` | string | `any` / `completed` / `missed` / `failed` |
| `direction` | string | `any` / `inbound` / `outbound` / `internal` |
| `date_from` / `date_to` | string | 起止日期，`YYYY-MM-DD` 或 RFC3339 |
| `only_transcribed` | bool | 仅返回有转写文本的记录 |
| `department_ids` | int[] | 部门过滤 |
| `sip_trunk_ids` | int[] | 入站中继过滤 |
| `outbound_sip_trunk_ids` | int[] | 出站中继过滤 |
| `tags` | string[] | 标签过滤 |
| `caller` / `callee` | string | 主叫/被叫精确过滤 |
| `all_legs` | bool | `false`（默认）只返回主 CDR；`true` 返回全部子腿（队列分发、REFER 转接） |

::: info 按天分库
CDR 按 `date_from`（缺省为当天）定位所在日期的数据文件/分表，跨天翻页时请保持过滤条件一致。
:::

**200 响应**

```json
{
  "page": 1,
  "per_page": 20,
  "total_pages": 4,
  "total_items": 78,
  "items": [ { "id": 1, "call_id": "…", "session_id": "…", "direction": "inbound", "…": "…" } ],
  "summary": { "…": "状态/方向统计" }
}
```

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"page":1,"per_page":20,"filters":{"direction":"inbound","date_from":"2026-10-20"}}' \
  "$BASE/call-records"
```

## 导出 CSV

```http
GET {api_prefix}/call-records/export?q=&status=&direction=&date_from=&date_to=…
```

与查询接口**同名过滤条件**，但走 **URL 查询参数**。返回 `text/csv` 附件。

- 单次导出上限 **50 000 行**（超出部分截断，防止一次请求把整表拉进内存）。
- 权限：`cdr:read`。

## 修改记录（标签 / 备注）

```http
PATCH {api_prefix}/call-records/{id}
```

请求体（`camelCase`）：

```json
{ "tags": ["vip", "complaint"], "note": { "text": "客户要求回访" } }
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `tags` | string[] | 整体替换标签集合 |
| `note.text` | string | 备注文本 |

**200 响应**

```json
{ "status": "ok", "record": { "id": 1, "tags": ["vip", "complaint"] },
  "notes": { "text": "客户要求回访", "updated_at": "…", "updated_by": null } }
```

无变化时返回 `{"status":"noop", …}`。

## 删除记录

```http
DELETE {api_prefix}/call-records/{id}
```

需 `cdr:delete` 权限。

## 信令阶梯图 (sip-flow)

```http
GET {api_prefix}/call-records/{id}/sip-flow?detail=false&flush=true&scope=leg
```

查询参数（`camelCase`）：

| 参数 | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `detail` | bool | `false` | 是否返回完整 SIP 报文文本 |
| `flush` | bool | `true` | 查询前先刷写管道，保证刚结束的通话也能读全；`false`/`0` 跳过（更快但可能读到旧数据） |
| `scope` | string | `leg` | `leg` 只返回本条 CDR 的腿；`session` 合并同一逻辑通话的全部 CDR 腿（可见 REFER 转接目标腿） |

**200 响应（结构摘要）**

```json
{
  "call_id": "…",
  "start_time": "…",
  "status": "success",
  "flow": [
    { "timestamp": "…", "seq": 1, "msg_type": "Sip", "src_addr": "…", "dst_addr": "…",
      "raw_message": "INVITE sip:…", "role": "caller", "call_id": "…" }
  ],
  "rtp_streams": [ { "role": "caller", "leg": 0, "src_addr": "…", "dst_addr": "RTP", "…": "…" } ],
  "diagnostics": { "backend_configured": true, "backend_type": "…", "scope": "leg",
                   "time_window": { "start": "…", "end": "…" } }
}
```

未配置 SipFlow 后端时回退到本地 JSONL 存档（`backend_type: "local-jsonl"`，`rtp_streams` 为空）。

## 下载原始 CDR JSON

```http
GET {api_prefix}/call-records/{id}/cdr-json
```

- 优先返回归档的 CDR 文件；文件缺失时由数据库行合成 JSON。
- 响应头：`Content-Type: application/json`、`Content-Disposition: attachment; filename="…"`。
- `404` 时响应体为 `{"message":"Call record not found for identifier: …","hint":"Provide either the numeric call record ID or the SIP Call-ID."}`。

## 错误响应

| 状态码 | 场景 |
| :--- | :--- |
| `404` | 记录不存在 |
| `403` | 权限不足（`cdr:read` / `cdr:write` / `cdr:delete`） |
| `500` | 查询或序列化失败（`{"message":"…"}`） |
