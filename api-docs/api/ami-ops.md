# AMI：热重载与运维

不停机应用配置变更、优雅停机，以及频控/封禁的查看与解除。

- 前缀：`{ami_path}`（默认 `/ami/v1`）
- 鉴权：IP 白名单 / 超管会话，见 [AMI 总览](/api/ami)

## 配置热重载

```http
POST {ami_path}/reload/trunks     # 重载 SIP 中继
POST {ami_path}/reload/routes     # 重载路由规则
POST {ami_path}/reload/acl        # 重载 ACL/安全规则
POST {ami_path}/reload/app        # 重载应用级配置
POST {ami_path}/reload/queues     # 重载队列
POST {ami_path}/reload/ivr        # 重载 IVR
```

**查询参数**

| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `sync_cluster` | bool | （commerce 构建）是否把重载同步广播到全部集群对端；响应回带 `synced` 与 `peers` 字段 |

**200 响应（以 trunks 为例）**

```json
{
  "status": "ok",
  "total": 12,
  "synced": true,
  "peers": [ { "addr": "10.0.0.2", "status": "ok" } ]
}
```

```bash
curl -s -X POST http://127.0.0.1:8080/ami/v1/reload/routes
```

::: tip 与控制台"待重载"的配合
控制台/REST 修改资源后会把目标加入待重载集合（[pending-reloads](/api/settings#待重载状态)），
通过本接口执行重载后该集合清空。
:::

## 优雅停机

```http
POST {ami_path}/shutdown
```

- 停止接受新呼叫，等待活动呼叫结束后退出进程；
- 排空期间 `GET {ami_path}/health` 返回 `status=draining` 且 HTTP 500（供 LB 摘流）。

::: warning 不可逆操作
该接口会关闭整个 PBX 进程，仅在维护窗口调用，并确保来源 IP 在白名单内。
:::

## 频率限制（频控）

```http
GET    {ami_path}/frequency_limits?policy_id=&scope=&scope_value=&limit_type=
DELETE {ami_path}/frequency_limits
```

| 端点 | 说明 |
| :--- | :--- |
| `GET` | 按 `policy_id` / `scope` / `scope_value` / `limit_type` 过滤当前生效的频控计数 |
| `DELETE` | 清空（或按同类参数清除指定）频控计数 |

**未配置频控时**返回 `501`：

```json
{ "status": "unavailable", "reason": "frequency_limiter_not_configured" }
```

## 封禁 (Bans)

```http
GET     {ami_path}/bans
DELETE  {ami_path}/bans?ip=1.2.3.4      # 或对应 release 路径，按实现而定
```

- `GET`：返回当前活跃封禁记录数组（来源 IP、原因、到期时间等）。
- 解除：控制台页面走 `POST {base_path}/security/bans/{ip}/release`；AMI 侧提供对应的释放操作。

**未配置封禁存储时**返回 `501`：

```json
{ "status": "unavailable", "reason": "ban_store_not_configured" }
```

**错误**

| 状态码 | 场景 |
| :--- | :--- |
| `403` | IP 不在 AMI 白名单 |
| `501` | 对应子系统未配置 |
| `500` | 执行失败（`{"status":"error","message":…}`） |
