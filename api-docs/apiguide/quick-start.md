# 快速开始

RustPBX 是一个用 Rust 编写的可编程 SIP PBX。它对外暴露两组 HTTP 接口：

| 接口组 | 默认前缀 | 用途 | 鉴权方式 |
| :--- | :--- | :--- | :--- |
| **Console REST API** | `/api` | 业务资源的增删改查、通话控制、诊断、报表 | Bearer Token / 会话 Cookie |
| **AMI 管理接口** | `/ami/v1` | 健康检查、热重载、停机、集群运维 | IP 白名单（`[ami].allows`）/ 超管会话 |

::: tip 配置项
- REST 前缀由 `[console].api_prefix` 配置，默认 `/api`；控制台页面前缀 `[console].base_path` 默认 `/console`。
- AMI 前缀由 `[proxy].ami_path` 配置，默认 `/ami/v1`。
- HTTP 监听端口由 `config.toml` 中的 HTTP 相关配置决定，下文以 `8080` 为例。
:::

## 1. 配置一个 API Token

在 `config.toml` 中声明静态令牌：

```toml
[console]
api_prefix = "/api"

[[console.api_tokens]]
token = "my-secret-token"
description = "CRM integration"
# 留空 = 超级管理员全量权限（启动时会打印告警）
# 建议显式声明 scope，按需授权
scopes = ["call.control", "recording", "extensions", "trunks", "routes"]
```

重启 RustPBX 后，所有 REST 调用都带上：

```http
Authorization: Bearer my-secret-token
Content-Type: application/json
```

详见 [认证与权限](/apiguide/authentication)。

## 2. 发起第一个请求

```bash
BASE=http://127.0.0.1:8080/api
TOKEN=my-secret-token

# 查看当前活动通话
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/calls/active?limit=10"
```

响应：

```json
{
  "data": [
    {
      "node": "local",
      "meta": { "session_id": "…", "caller": "…", "callee": "…", "started_at": "…" },
      "state": { "…": "通话实时快照" }
    }
  ]
}
```

```bash
# 创建一个分机
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"extension":"1001","display_name":"张三","sip_password":"ChangeMe#1"}' \
  "$BASE/extensions"
# -> {"status":"ok","id":7}
```

```bash
# 挂断一路通话
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"hangup","reason":"admin_kick"}' \
  "$BASE/calls/active/<session_id>/commands"
# -> {"message":"Command dispatched"}
```

## 3. 列表查询统一走 POST + JSON

分机、中继、路由、CDR、队列等列表接口统一使用 **POST + JSON 请求体**（`ListQuery<T>` 结构）：

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "page": 1,
    "per_page": 20,
    "filters": { "q": "1001", "status": "active" },
    "sort": "created_at_desc"
  }' \
  "$BASE/extensions"
```

响应为统一分页结构：

```json
{
  "page": 1,
  "per_page": 20,
  "total_pages": 3,
  "total_items": 42,
  "items": [ ]
}
```

字段说明见 [通用约定](/apiguide/conventions)。

## 4. 下一步

- [认证与权限](/apiguide/authentication)：Token scope、权限点、会话 Cookie 与 CSRF 规则
- [通用约定](/apiguide/conventions)：分页、错误信封、状态码、时间格式
- [接口分类一览](/apiguide/categories)：全部接口按功能域速查
- [名词解释](/apiguide/glossary)：SIP、中继、SipFlow、CDR、路由等关键名词说明
