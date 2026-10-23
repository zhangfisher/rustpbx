# AMI：健康检查与诊断

运行状态、SIP 对话与事务的原始转储，用于监控抓取与深度排障。

- 前缀：`{ami_path}`（默认 `/ami/v1`）
- 鉴权：IP 白名单 / 超管会话，见 [AMI 总览](/api/ami)

## 健康检查

```http
GET {ami_path}/health
```

**200 响应（结构摘要）**

```json
{
  "status": "running",
  "uptime": { "…": "启动时长信息" },
  "version": { "…": "版本信息" },
  "total": 1024,
  "failed": 12,
  "tasks": { "total": 57, "tokio::net::udp::poll_recv: 12" },
  "tokio": { "…": "Tokio 运行时指标" },
  "sipserver": {
    "transactions": { "running": 3, "finished": 1024, "waiting_ack": 0 },
    "dialogs": 4,
    "calls": 2,
    "running_tx": 2,
    "transport_connections": 1,
    "leak": { "handles_by_dialog": 0, "dialogs_by_session": 0 },
    "dashmaps": { "trunks": 3, "queues": 1, "presence_states": 2, "…": 0 }
  },
  "callrecord": { "…": "CDR 写入统计" },
  "locator": { "online_locations": 5, "online_users": 4, "webrtc_locations": 1, "by_transport": { } },
  "rwi": { "gateway_configured": false, "meta_store_size": 0 }
}
```

| 关键字段 | 说明 |
| :--- | :--- |
| `status` | `running`；**优雅停机排空期间为 `draining`** |
| `total` / `failed` | 累计呼叫数 / 失败数 |
| `sipserver.leak` | 对话/会话映射计数，用于泄漏排查 |
| `locator` | 注册在线统计 |

::: tip 排空期返回 500
节点处于 `draining` 时该接口返回 **HTTP 500**（body 仍是健康结构），
以便负载均衡器与集群对端停止向其发送新流量——监控应把 500 + `status=draining` 视为"摘流中"而非故障。
:::

```bash
curl -s http://127.0.0.1:8080/ami/v1/health | jq '{status, total, failed, calls: .sipserver.calls}'
```

## SIP 对话转储

```http
GET {ami_path}/dialogs
```

返回内部对话层的原始状态数组（Call-ID、from/to tag、状态机、协商 SDP 等），
用于排查 INVITE 会话卡死、半开连接等问题。

## 按 id 挂断对话

```http
GET {ami_path}/hangup/{id}
```

| 状态码 | 响应 |
| :--- | :--- |
| `200` | `{"status":"ok","message":"Dialog with id '<id>' hangup initiated"}` |
| `404` | 对话不存在 |
| `500` | 挂断失败（`{"status":"error","message":"Failed to hangup dialog with id '…': …"}`） |

## 事务列表

```http
GET {ami_path}/transactions
```

**200 响应**：字符串数组，如 `["INVITE:abc123", "REGISTER:def456"]`。

## 中继注册状态

```http
GET {ami_path}/trunk_registrations
```

返回本机作为客户端向运营商中继发起 REGISTER 的状态列表（是否注册成功、到期时间等）。

## SipFlow 查询

```http
GET {ami_path}/sipflow/flow/{call_id}?start=&end=
GET {ami_path}/sipflow/media/{call_id}?start=&end=
```

与 Console REST 版本能力一致（阶梯图 JSON / WAV 合成），但**无需会话与权限**，
仅受 AMI IP 白名单保护，适合监控/录存系统直接抓取。
时间参数支持 RFC3339 与 UNIX 秒，详见 [SipFlow](/api/sipflow)。

**常见错误**

| 状态码 | 场景 |
| :--- | :--- |
| `403` | IP 不在 `[ami].allows` 白名单 |
| `404` | 对话 / 归档不存在 |
