# 录音播放与下载

播放/下载通话录音，以及按会话列出全部媒体与信令产物。

- 权限：`cdr:read`
- 前缀：`{api_prefix}`（默认 `/api`）

## 录音播放

```http
GET {api_prefix}/call-records/{id}/recording?stream=&segment=
```

`{id}` 为**数字 CDR 主键**（不接受 Call-ID）。

| 查询参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `stream` | string | 选择音轨：`A` / `B` / `mixed` / `caller` / `callee`；非法值返回 `400` 并在 `allowed` 中列出可选值 |
| `segment` | string | 分段录音选择器：优先用媒体条目的 `unique_id`，其次 `track_id`；缺省返回第一个存在的文件 |

::: warning 分段选择器不回退
指定 `segment` 但未匹配到时返回 `404 {"message":"Recording segment not found","segment":"…"}`，
不会静默回退到其他分段或整通录音。
:::

**响应**

- 成功时直接返回音频流（`audio/wav` 等，依存储的实际文件），可直接用于 `<audio>` 播放。
- `404`：记录不存在或没有可用录音文件。

```bash
# 播放主叫轨
curl -OJ -H "Authorization: Bearer $TOKEN" \
  "$BASE/call-records/1042/recording?stream=caller"
```

::: tip 从 CDR 列表拿到可用信息
CDR 详情中会给出 `recording: { url, duration_secs, supports_streams }`，
以及分段清单 `recording_segments`（`unique_id`、`track_id`、`segment_type`、`seq`、`label`、
`started_at`、`ended_at` 等），用于填充上述查询参数。
:::

## 会话产物清单

列出一个逻辑通话（`session_id` 下所有 CDR 腿）的录音与信令产物：

```http
GET {api_prefix}/call-records/by-session/{session_id}/artifacts
```

匹配规则：`session_id` 列等于给定 id 的所有行，加上根记录本身（旧行 `session_id` 为空或等于 `call_id`）。

**200 响应**

```json
{
  "session_id": "…",
  "legs": [
    {
      "id": 1042,
      "call_id": "…",
      "leg_role": "caller",
      "direction": "inbound",
      "status": "completed",
      "started_at": "…",
      "ended_at": "…",
      "recording_url": "…",
      "recording_segments": [ … ],
      "sipflow_jsonl": "…",
      "…": "其他产物定位字段"
    }
  ]
}
```

**错误**

| 状态码 | 场景 |
| :--- | :--- |
| `404` | 该 `session_id` 下没有任何通话记录 |
| `403` | 缺少 `cdr:read` |

::: tip 配套能力
- SipFlow 信令/媒体导出：见 [SipFlow 信令与媒体](/api/sipflow)。
- 通话结束后的录音自动上传、CDR 推送属于出站 Webhook，见 [出站 Webhook 概览](/apiguide/webhooks)。
:::
