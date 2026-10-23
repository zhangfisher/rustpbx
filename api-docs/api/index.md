# REST API 总览

RustPBX 对外暴露两组 HTTP 接口，都可以用同一个 `config.toml` 配置前缀：

| 接口族 | 默认前缀 | 用途 | 鉴权方式 |
| :--- | :--- | :--- | :--- |
| **Console REST API** | `/api` | 业务资源的增删改查、通话控制、诊断、报表 | Bearer Token / 会话 Cookie |
| **AMI 管理接口** | `/ami/v1` | 健康检查、热重载、停机、集群运维 | IP 白名单（`[ami].allows`）或超管会话 |

::: tip 配置项
- REST 前缀由 `[console].api_prefix` 配置，默认 `/api`；控制台页面前缀 `[console].base_path` 默认 `/console`
- AMI 前缀由 `[proxy].ami_path` 配置，默认 `/ami/v1`
:::

## 快速示例

```bash
# 列出分页的活动通话
curl -H "Authorization: Bearer $RUSTPBX_TOKEN" \
  http://127.0.0.1:8080/api/calls/active?limit=20
```

```bash
# 挂断一路通话
curl -X POST \
  -H "Authorization: Bearer $RUSTPBX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"hangup","reason":"admin_kick"}' \
  http://127.0.0.1:8080/api/calls/active/{session_id}/commands
```

## 接口分类

| 分组 | 文档 |
|---|---|
| 通话与媒体 | [通话控制](/api/call-control) · [通话记录 CDR](/api/call-records) · [录音播放与下载](/api/recording) · [SipFlow 信令与媒体](/api/sipflow) · [状态呈现](/api/presence) · [呼叫队列](/api/queues) |
| 资源管理 | [分机](/api/extensions) · [SIP 中继](/api/sip-trunk) · [路由](/api/routing) |
| 监控与诊断 | [仪表盘与运行指标](/api/dashboard) · [报表](/api/reports) · [诊断](/api/diagnostics) |
| 系统管理 | [系统设置与日志](/api/settings) · [用户 / 角色 / 部门](/api/users-roles) · [通知与其他接口](/api/misc) |
| AMI 管理接口 | [AMI 总览](/api/ami) · [健康检查与诊断](/api/ami-health) · [热重载与运维](/api/ami-ops) · [外呼 SSE 与集群](/api/ami-cluster) |

## 下一步

- 第一次调用接口：[快速开始](/apiguide/quick-start)
- Token scope 与权限点：[认证与权限](/apiguide/authentication)
- 分页、错误信封与状态码：[通用约定](/apiguide/conventions)
- 全部接口按功能域速查：[接口分类一览](/apiguide/categories)
