# SipFlow 信令与媒体

SipFlow 是 RustPBX 的信令/媒体流水线：按通话归档 SIP 报文（JSONL）与 RTP 媒体，
并可按需生成阶梯图和 WAV 录音。

- 权限：读取需 `sipflow:read`，修改设置需 `system:write`
- 前缀：`{api_prefix}`（默认 `/api`）

## 读取设置

```http
GET {api_prefix}/sipflow/settings
```

**200 响应**

```json
{
  "enabled": true,
  "backend_type": "local",
  "config": { "root": "./config/sipflow", "…": "后端相关配置" }
}
```

| 字段 | 说明 |
| :--- | :--- |
| `enabled` | 是否启用 SipFlow |
| `backend_type` | `none` / `local` / 集群或对象存储后端（依 `[sipflow]` 配置） |
| `config` | 后端配置的 JSON 视图 |

未初始化时返回 `503 {"error":"Application not initialized"}`。

## 更新设置

```http
PUT {api_prefix}/sipflow/settings
Content-Type: application/json
```

需 `system:write` 权限，写入 `[sipflow]` 配置段（热更新）。

## 查询信令阶梯图

```http
GET {api_prefix}/sipflow/flow/{call_id}?start=&end=&flush=
```

| 查询参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `start` | string | 时间范围起点，RFC3339（`2026-04-16T10:00:00+08:00`）或 UNIX 秒（`1713232800`） |
| `end` | string | 时间范围终点，格式同上 |
| `flush` | string | `0` / `false` 跳过查询前的管道刷写（读旧数据但更快），默认刷写 |

```bash
curl -s -G -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "start=2026-04-16T10:00:00+08:00" \
  --data-urlencode "end=2026-04-16T10:30:00+08:00" \
  "$BASE/sipflow/flow/ab39-551-229"
```

**响应**：阶梯图 JSON（`call_id`、时间轴上的 SIP 消息序列、RTP 流与诊断信息），结构与
[CDR sip-flow](/api/call-records#信令阶梯图-sip-flow) 类似。

## 导出通话媒体 (WAV)

```http
GET {api_prefix}/sipflow/media/{call_id}?start=&end=
```

- 时间参数与 `flow` 相同，用于限定参与合成的 RTP 时间窗。
- 成功时返回 WAV 音频流（由存储的 RTP 按需合成）。

```bash
curl -s -G -OJ -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "start=1713232800" --data-urlencode "end=1713234600" \
  "$BASE/sipflow/media/abc123"
```

## 与录音的关系

| `[recording].type` | 录音产物 | SipFlow 产物 |
| :--- | :--- | :--- |
| `sipflow` | 无独立 WAV，媒体写入 SipFlow | 信令 + RTP（可合成 WAV） |
| `local` / `http` / `s3` | WAV 文件（由 `[recording]` 上传） | 取决于是否配置 `[sipflow]` |
| 未配置 `[sipflow]` | WAV 文件 | 仅本地 JSONL 回退或无 |

配置示例与组合方式见仓库 `docs/api_integration_guide.md` 的 "Compliance Recording" 一节。

**常见错误**

| 状态码 | 场景 |
| :--- | :--- |
| `403` | 缺少 `sipflow:read` |
| `404` | `call_id` 对应的归档不存在 |
| `503` | 应用未初始化 |
