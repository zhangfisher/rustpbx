# 报表 (Reports)

按时间桶聚合的通话、中继、路由、语音信箱与注册在线报表，均支持 CSV 导出。

- 权限：`reports:read` **或** `cdr:read`（呼叫中心域另有 `cc_reports:read`；超级用户直接放行）
- 前缀：`{api_prefix}`（默认 `/api`）
- 方法：**GET + URL 查询参数**

## 通用查询参数

以下参数适用于 `/reports/v2/*` 全部端点：

| 参数 | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `from` | string | 当天起点（按时区折算） | 起始时间，`YYYY-MM-DD` 或 RFC3339 |
| `to` | string | 当前时刻 | 结束时间（`YYYY-MM-DD` 按当天 23:59:59 处理） |
| `bucket` | string | `day` | 聚合粒度：`hour`（`hourly`）、`day`（`daily`）、`week`（`weekly`） |
| `tz` | string | UTC | 时区偏移，`+08:00` / `08:00` / `8`（东为正，夹取 `-12..=14` 小时） |
| `direction` | string | — | `inbound` / `outbound` / `internal`（`any` 或空视为不过滤） |
| `trunk_id` | string | — | 中继热力图按中继过滤 |
| `group_id` | string | — | 技能组过滤（呼叫中心域报表使用） |

```bash
curl -s -G -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "from=2026-10-01" --data-urlencode "to=2026-10-21" \
  --data-urlencode "bucket=day" --data-urlencode "tz=+08:00" \
  "$BASE/reports/v2/call"
```

## 端点一览

| 端点 | 内容 |
| :--- | :--- |
| `GET /reports/v2/call` | 通话时序、挂断原因分布、SIP 状态分布、Top 主叫、忙时热力图 |
| `GET /reports/v2/call/export` | 上述通话报表 CSV |
| `GET /reports/v2/trunk` | 中继话务统计（offered/answered/missed/时长/ASR） |
| `GET /reports/v2/trunk/export` | 中继报表 CSV |
| `GET /reports/v2/trunk/heat` | 中继热力图（可配合 `trunk_id`） |
| `GET /reports/v2/route` | 路由命中统计 |
| `GET /reports/v2/route/export` | 路由报表 CSV |
| `GET /reports/v2/voicemail` | 语音信箱趋势与信箱汇总 |
| `GET /reports/v2/voicemail/export` | 语音信箱报表 CSV |
| `GET /reports/v2/locator` | 注册在线统计 |
| `GET /reports/v2/locator/export` | 注册报表 CSV |

## 通话报表响应

```json
{
  "data": {
    "series": [
      { "bucket_start": "2026-10-20T00:00:00+08:00", "total": 120, "answered": 100,
        "missed": 20, "total_duration_secs": 34000, "avg_duration_secs": 340,
        "asr_pct": 83.3 }
    ],
    "hangup_reasons": [ … ],
    "sip_status": [ … ],
    "top_callers": [ … ],
    "heatmap": [ [0,0,…], [ … ] ]
  },
  "meta": {
    "from": "2026-10-20T00:00:00+08:00",
    "to": "2026-10-21T00:00:00+08:00",
    "bucket": "day"
  }
}
```

| 字段 | 说明 |
| :--- | :--- |
| `data.series` | 时间桶序列（`bucket_start`、`total`、`answered`、`missed`、时长与 ASR） |
| `data.heatmap` | 忙时热力图：7 行（周一~周日）× 24 列（小时），按 `tz` 折算 |
| `meta` | 实际生效的时间窗与聚合粒度 |

查询失败时返回 `200` 且 `{"error":"call report failed: …"}`。

## CSV 导出

`/export` 端点参数与查询端点一致，返回 `text/csv` 附件。各域列头示例：

- 通话：`bucket_start,total,answered,missed,total_duration_secs,avg_duration_secs,asr_pct`
- 中继：`trunk_id,name,carrier,offered,answered,missed,total_duration_secs,asr_pct`
- 路由：`route_id,name,offered,answered,missed,total_duration_secs,asr_pct`
- 语音信箱：`section,bucket_or_extension,count,unread`

## 错误响应

| 状态码 | 场景 |
| :--- | :--- |
| `403` | `{"status":"error","message":"Permission denied"}`（缺少 `reports:read` / `cdr:read`） |
| `200` + `error` 字段 | 数据库查询失败（见上） |
