# 仪表盘与运行指标

控制台首页指标与运行时/媒体/语音信箱指标的 JSON 数据源。

- 认证：登录身份（Bearer Token 或会话 Cookie）
- 前缀：`{api_prefix}`（默认 `/api`）

## 仪表盘数据

```http
GET {api_prefix}/dashboard/data?range=
```

| 查询参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `range` | string | 时间范围键（如"最近 10 分钟"、"今天"等）；缺省或无法识别时使用默认范围 |

**200 响应**（`DashboardPayload`）

```json
{
  "range": {
    "key": "…",
    "label": "…",
    "period_label": "…",
    "period_label_short": "…",
    "timeline_title": "…"
  },
  "metrics": {
    "recent10": {
      "total": 128, "trend": "+12%", "util": 34, "answered": 110,
      "asr": "85.9%", "ans_util": 28, "acd": "142s", "acd_util": 31,
      "timeline": [3, 5, 8], "timeline_labels": ["10:00", "10:05", "10:10"]
    },
    "today": { "acd": "137s" },
    "active": 6,
    "capacity": 32,
    "active_util": 18,
    "transaction_running": 1,
    "transaction_capacity": 4
  },
  "call_direction": { "inbound": 60, "outbound": 50, "internal": 18 },
  "active_calls": [
    { "session_id": "…", "caller": "1001", "callee": "200", "status": "answered",
      "started_at": "…", "duration": "02:15" }
  ]
}
```

| 字段 | 说明 |
| :--- | :--- |
| `range` | 实际生效的时间范围描述（用于图表标题） |
| `metrics.recent10` | 最近一段窗口的呼叫量、占用率（`util`）、接通率（`asr`）、平均通话时长（`acd`）及时间轴 |
| `metrics.today` | 今日汇总（当前含 `acd`） |
| `metrics.active` / `capacity` / `active_util` | 当前并发、容量与占用百分比 |
| `metrics.transaction_running` / `transaction_capacity` | 事务（如外呼任务）运行数与容量 |
| `call_direction` | 按方向的呼叫计数 |
| `active_calls` | 活动通话预览列表 |

构建失败时返回**空载荷**（字段齐全、数值为 0/空），不会返回 5xx。

## 运行时指标

```http
GET {api_prefix}/metrics/runtime/data
```

返回运行时综合指标 JSON，涵盖：

- 进程/Tokio 运行时指标；
- 媒体面遥测：活动媒体桥（`active_bridges`）、收发包/丢包计数、WebRTC 连接数；
- 注册侧在线统计；
- 语音信箱计数（`active_mailboxes`、`messages_today`，插件未启用时保持 0）。

::: tip 抓取型指标
Prometheus 抓取端点属于 `addon-observability` 能力（`metrics-exporter-prometheus`），
与本页的控制台 JSON 指标相互独立。
:::

## 相关接口

- 报表类聚合指标：[报表 (Reports)](/api/reports)
- 系统健康与任务统计：[AMI → 健康检查](/api/ami-health)
