# AMI：外呼 SSE 与集群

发起外呼并以 SSE 流订阅全程事件，以及集群节点间的互操作端点。

- 前缀：`{ami_path}`（默认 `/ami/v1`）
- 鉴权：IP 白名单 / 超管会话，见 [AMI 总览](/api/ami)

## 外呼 SSE

```http
POST {ami_path}/outbound/dial
Content-Type: application/json
```

发起一路外呼，并在**同一个 SSE 连接**上推送该呼叫的全部 RWI 事件
（振铃、应答、DTMF、挂断、录音状态等）。

::: info 前置条件
必须在配置中启用 `[outbound] enabled = true`，否则返回：

```json
HTTP/1.1 503 Service Unavailable
{ "error": "outbound module not enabled (set [outbound] enabled = true)" }
```
:::

### 请求体（`DialRequest`）

```json
{
  "destination": "13800000000",
  "caller_id": "sip:1000@pbx.local",
  "trunk": "carrier-a",
  "call_id": "optional-explicit-call-id",
  "ring_timeout": 30,
  "extra_headers": { "X-CRM-Ticket": "T-1001" },
  "on_answer": { "type": "execute_flow" },
  "on_failure": { "webhook": {
      "url": "https://crm.example.com/hooks/call-failed",
      "headers": { "X-API-Key": "…" },
      "timeout_secs": 5,
      "fallback": { "type": "hangup" }
  } },
  "record": { "…": "同 RWI record.start 参数；call_id 字段被忽略" },
  "metadata": { "campaign": "oct-promo" }
}
```

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `destination` | string | **是** | 目标 SIP URI 或裸号码（按服务端 realm 归一化） |
| `caller_id` | string | 否 | A 身份（如 `sip:1000@pbx.local`） |
| `trunk` | string | 否 | 指定出站中继名（直接盖章次跳、凭据、PAI） |
| `call_id` | string | 否 | 指定 Call-ID；缺省由服务端生成并在首个 SSE 事件返回 |
| `ring_timeout` | int | 否 | 振铃超时（秒），缺省取 `[outbound]` 配置或 `30` |
| `extra_headers` | object | 否 | 附加到出站 INVITE 的 SIP 头 |
| `on_answer` | object | 否 | 接听后动作（`type` 标签联合，见下） |
| `on_failure` | object | 否 | 失败回调：`{ "webhook": WebhookAction }` |
| `record` | object | 否 | 录音控制；首个远端 SDP 建立媒体时自动开始 |
| `metadata` | object | 否 | 透传到 webhook 载荷并写入 CDR |

**`on_answer` 取值**（`{"type": …}`）

| type | 附加字段 | 行为 |
| :--- | :--- | :--- |
| `execute_flow` | — | 默认：按拨号计划继续执行 |
| `bridge_to_leg` | `leg_id` | 桥接到已有腿（`session_id` 或 `dialog_id`） |
| `enqueue` | `queue`、`priority?` | 进入 ACD 队列等待坐席 |
| `app` | `app_name`、`app_params` | 运行指定呼叫应用/IVR |
| `webhook` | `url`、`headers`、`timeout_secs?`、`fallback` | POST 同步 webhook 并按返回指令继续 |

`WebhookAction.fallback` 取值：`{"type":"hangup"}`（默认）、`{"type":"bridge","leg_id":…}`、
`{"type":"enqueue","queue":…}`。

### 响应

- 成功：`text/event-stream`，逐条推送该呼叫的 RWI 事件（含服务端生成的 `call_id`）。
- 模块未启用：`503`（见上）。

## 集群查询（commerce 构建）

```http
GET {ami_path}/calls?call_id=&caller=&callee=&limit=&remote=
```

| 参数 | 说明 |
| :--- | :--- |
| `call_id` | 精确匹配代理会话 id 或对话 Call-ID 别名 |
| `caller` / `callee` | 主/被叫子串匹配（忽略大小写） |
| `limit` | 默认 `50`，夹取到 `1..=500` |
| `remote` | 默认 `true`：向全部集群对端（`remote=false`）扇出并合并、按会话 id 去重、新者在前；对端失败记入 `errors` 而不整体失败 |

## 集群互操作端点

| 端点 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/cluster/ping` | POST | 节点连通性探测 |
| `/cluster/reload_config` | GET | 拉取对端配置重载 |
| `/cluster/reload_sync` | POST | 配置重载同步 |
| `/cluster/evaluate_route` | POST | 跨节点路由求值 |
| `/cluster/forward_sip` | POST | 转发 SIP 请求到属主节点 |
| `/cluster/show_session/{session_id}` | GET | 查询会话归属与状态 |
| `/cluster/list_calls` | GET | 列出本节点活动通话 |
| `/cluster/logs/recent` | GET | 对端最近日志 |
| `/cluster/logs/follow` | GET | 对端日志跟随 |
| `/cluster/set_userdata` | POST | 写入会话 user_data（属主路由，终端执行） |
| `/cluster/get_userdata` | POST | 读取会话 user_data |
| `/cluster/set_var` | POST | 写入会话变量（属主路由） |
| `/cluster/get_var` | POST | 读取会话变量 |
| `/cluster/session_op` | POST | 通用会话操作封装（属主本地执行） |

::: info 这些端点是节点间协议
`/cluster/*` 面向集群内部通信，字段随版本演进较快；跨系统集成请优先使用
[Console REST](/apiguide/categories)（会自动把非属主节点的请求转发到属主节点）与
[外呼 SSE](#外呼-sse)。
:::
