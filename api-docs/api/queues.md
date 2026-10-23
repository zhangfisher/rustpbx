# 呼叫队列 (Queues)

管理呼叫队列：查询、创建、修改、删除、导出与热重载。

- 前缀：`{api_prefix}`（默认 `/api`）
- 认证：登录身份（队列属于插件能力，随 `console` 一起挂载）
- 队列既可由配置文件定义，也可存数据库（`[proxy].use_db_config`），响应会体现来源

## 查询队列

```http
POST {api_prefix}/queues
Content-Type: application/json
```

请求体为标准 `ListQuery`，`filters` 字段：

| 过滤字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `q` | string | 名称关键字 |
| `status` | string | 状态过滤（如启用/停用） |

```json
{ "page": 1, "per_page": 20, "filters": { "q": "support" } }
```

**200 响应**：`{ "page", "per_page", "total_pages", "total_items", "items": [...] }`

## 创建队列

```http
PUT {api_prefix}/queues
```

::: info HTTP 方法映射
查询用 `POST /queues`，创建用 `PUT /queues`（两者同一路径）。
:::

**请求体**

```json
{
  "name": "support",
  "description": "技术支持队列",
  "is_active": true,
  "tags": ["support", "cn"],
  "metadata": "{\"owner\":\"ops\"}",
  "spec": {
    "accept_immediately": true,
    "passthrough_ringback": false,
    "hold": { "audio_file": "hold_music.wav", "loop_playback": true },
    "fallback": { "redirect": "sip:200@pbx.local", "failure_code": 503 },
    "strategy": { "mode": "sequential", "wait_timeout_secs": 300 },
    "voice_prompts": { "position_prompt": "queue_position.wav" }
  }
}
```

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `name` | string | 队列名（唯一） |
| `description` | string | 描述 |
| `is_active` | bool | 是否启用 |
| `tags` | string[] | 标签 |
| `metadata` | string | 附加元数据（JSON 字符串） |
| `spec` | object | 队列行为配置，见下表 |

### spec（`RouteQueueConfig`）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `accept_immediately` | bool | 是否立即接通（否则先放等待音/策略） |
| `passthrough_ringback` | bool | 透传回铃音（仅在 `accept_immediately` 为 true 时生效） |
| `hold.audio_file` | string | 等待音乐文件 |
| `hold.loop_playback` | bool | 循环播放（默认 `true`） |
| `fallback.redirect` | string | 超时/失败后的转移目标 URI |
| `fallback.failure_code` | int | 失败时返回的 SIP 状态码 |
| `fallback.failure_reason` | string | 失败原因文本 |
| `strategy.mode` | string | 拨打策略：`sequential`（顺序，坐席轮流）/ `parallel`（并行振铃），默认 `sequential` |
| `strategy.wait_timeout_secs` | int | 等待超时（秒） |
| `voice_prompts.*` | object | 提示音：`position_prompt`（排队位置）、`comfort_prompts`、`service_prompt`、`transfer_prompt`、`busy_prompt`、`off_hours_prompt`、`no_answer_prompt`、`final_destination_prompt` |

## 修改队列

```http
PATCH {api_prefix}/queues/{id}
```

请求体与创建相同，字段均为**部分更新**（只提交要改的字段）。

## 删除队列

```http
DELETE {api_prefix}/queues/{id}
```

## 导出

```http
POST {api_prefix}/queues/export          # 导出全部队列
POST {api_prefix}/queues/{id}/export     # 导出单个队列
```

返回队列配置的导出内容（用于备份/迁移回配置文件）。

## 热重载

```http
POST {api_prefix}/queues/reload
```

无需重启即可让队列配置生效（等价于 AMI 的 `POST {ami_path}/reload/queues`）。

## 队列提示音

```http
POST {api_prefix}/queues/download-audio          # 批量下载提示音
GET  {api_prefix}/queues/sound/{*file_path}      # 按路径读取提示音文件
```

`{file_path}` 为通配路径参数，指向服务端提示音文件。

**常见错误**

| 状态码 | 场景 |
| :--- | :--- |
| `400` | 请求体非法（如 `spec` 结构错误） |
| `401` / `403` | 未认证或权限不足 |
| `404` | `{id}` 对应的队列不存在 |

::: tip 路由到队列
路由规则可以把呼叫转到队列：路由 `action.target_type` 取 `queue` 并指定 `queue_file`，
见 [路由 (Routing)](/api/routing)。
:::
