# 接口分类一览

RustPBX REST 接口按功能域分为五类，全部挂在 `{api_prefix}`（默认 `/api`）之下；
另有独立的 AMI 运维接口挂在 `{proxy.ami_path}`（默认 `/ami/v1`）之下。

## 通话与媒体

| 接口 | 方法与路径 | 权限 | 文档 |
| :--- | :--- | :--- | :--- |
| 活动通话列表 | `GET /calls/active` | `callcontrol:read` | [通话控制](/api/call-control) |
| 单路通话详情 | `GET /calls/active/{session_id}` | `callcontrol:read` | [通话控制](/api/call-control) |
| 通话命令 | `POST /calls/active/{session_id}/commands` | `callcontrol:command` | [通话控制](/api/call-control) |
| 会话 user_data | `GET` / `PUT /calls/active/{session_id}/userdata` | `callcontrol:read` / `command` | [通话控制](/api/call-control) |
| 通话记录查询 | `POST /call-records` | `cdr:read` | [通话记录 CDR](/api/call-records) |
| 通话记录导出 | `GET /call-records/export` | `cdr:read` | [通话记录 CDR](/api/call-records) |
| 通话记录改/删 | `PATCH` / `DELETE /call-records/{id}` | `cdr:write` / `cdr:delete` | [通话记录 CDR](/api/call-records) |
| 信令阶梯图 | `GET /call-records/{id}/sip-flow` | `cdr:read` | [通话记录 CDR](/api/call-records) |
| CDR 原始 JSON | `GET /call-records/{id}/cdr-json` | `cdr:read` | [通话记录 CDR](/api/call-records) |
| 录音播放 | `GET /call-records/{id}/recording` | `cdr:read` | [录音播放与下载](/api/recording) |
| 会话产物清单 | `GET /call-records/by-session/{session_id}/artifacts` | `cdr:read` | [录音播放与下载](/api/recording) |
| SipFlow 设置 | `GET` / `PUT /sipflow/settings` | `sipflow:read` / `system:write` | [SipFlow](/api/sipflow) |
| SipFlow 信令/媒体 | `GET /sipflow/flow/{call_id}`、`GET /sipflow/media/{call_id}` | `sipflow:read` | [SipFlow](/api/sipflow) |
| 状态查询/设置 | `GET` / `POST /presence/{extension}` | 登录身份 | [Presence](/api/presence) |
| 队列查询 / 创建 | `POST` / `PUT /queues` | 登录身份 | [呼叫队列](/api/queues) |
| 队列修改 / 删除 | `PATCH` / `DELETE /queues/{id}` | 登录身份 | [呼叫队列](/api/queues) |
| 队列导出/重载 | `POST /queues/export`、`POST /queues/reload`、`POST /queues/{id}/export` | 登录身份 | [呼叫队列](/api/queues) |

## 资源管理

| 接口 | 方法与路径 | 权限 | 文档 |
| :--- | :--- | :--- | :--- |
| 分机创建/查询 | `PUT` / `POST /extensions` | `extensions:write` / `read` | [分机](/api/extensions) |
| 分机改/删 | `PATCH` / `DELETE /extensions/{id}` | `extensions:write` / `delete` | [分机](/api/extensions) |
| 分机口令揭示 | `GET /extensions/{id}/sip-password` | `extensions:read` | [分机](/api/extensions) |
| 分机批量导入 | `POST /extensions/import` | `extensions:write` | [分机](/api/extensions) |
| 中继创建/查询 | `PUT` / `POST /sip-trunk` | `trunks:write` / `read` | [SIP 中继](/api/sip-trunk) |
| 中继改/删 | `PATCH` / `DELETE /sip-trunk/{id}` | `trunks:write` | [SIP 中继](/api/sip-trunk) |
| 中继口令/依赖 | `GET /sip-trunk/{id}/auth-password`、`GET /sip-trunk/{id}/dependencies` | `trunks:read` | [SIP 中继](/api/sip-trunk) |
| 路由创建/查询 | `PUT` / `POST /routing` | `routes:write` / `read` | [路由](/api/routing) |
| 路由改/删/克隆/启停 | `PATCH` / `DELETE /routing/{id}`、`POST /routing/{id}/clone`、`POST /routing/{id}/toggle` | `routes:write` | [路由](/api/routing) |
| 路由栈 | `GET /routing-stack`、`PATCH /routing-stack/{id}` | `routes:read` / `write` | [路由](/api/routing) |

## 监控与诊断

| 接口 | 方法与路径 | 权限 | 文档 |
| :--- | :--- | :--- | :--- |
| 仪表盘数据 | `GET /dashboard/data` | 登录身份 | [仪表盘](/api/dashboard) |
| 运行时指标 | `GET /metrics/runtime/data` | 登录身份 | [仪表盘](/api/dashboard) |
| 报表（通话/中继/路由/语音信箱/注册） | `GET /reports/v2/*` | `reports:read` 或 `cdr:read` | [报表](/api/reports) |
| 报表 CSV 导出 | `GET /reports/v2/*/export` | 同上 | [报表](/api/reports) |
| SIP 对话转储 | `GET /diagnostics/dialogs` | 登录身份 | [诊断](/api/diagnostics) |
| 中继地址测试 | `POST /diagnostics/trunks/test`、`POST /diagnostics/trunks/options` | 登录身份 | [诊断](/api/diagnostics) |
| 路由模拟求值 | `POST /diagnostics/routes/evaluate` | 登录身份 | [诊断](/api/diagnostics) |
| 注册定位查询/清理 | `POST /diagnostics/locator/lookup`、`POST /diagnostics/locator/clear` | 登录身份 | [诊断](/api/diagnostics) |

## 系统管理

| 接口 | 方法与路径 | 权限 | 文档 |
| :--- | :--- | :--- | :--- |
| 配置热更新 | `PATCH /settings/config/*` | `system:write` | [系统设置与日志](/api/settings) |
| 连通性测试 | `POST /settings/config/*/test` | `system:write` | [系统设置与日志](/api/settings) |
| 日志读取/跟随/流式 | `GET /settings/logs/*` | `system:read` | [系统设置与日志](/api/settings) |
| 部门 CRUD | `POST` / `PUT /settings/departments`、`GET` / `PATCH` / `DELETE /settings/departments/{id}` | `departments:*` | [用户/角色/部门](/api/users-roles) |
| 用户 CRUD | `POST` / `PUT /settings/users`、`GET` / `PATCH` / `DELETE /settings/users/{id}` | `users:manage` | [用户/角色/部门](/api/users-roles) |
| 用户角色/MFA | `GET` / `POST /settings/users/{id}/roles`、`POST /settings/users/{id}/mfa/reset` | `users:manage` | [用户/角色/部门](/api/users-roles) |
| 角色 CRUD | `GET` / `POST /settings/roles`、`GET` / `PATCH` / `DELETE /settings/roles/{id}` | `users:manage` | [用户/角色/部门](/api/users-roles) |
| 通知 | `GET /notifications/unread-count`、`POST /notifications/{id}/read`、`POST /notifications/read-all` | 登录身份 | [通知与其他](/api/misc) |
| 插件启停 | `POST /addons/toggle` | `system:write` | [通知与其他](/api/misc) |
| 语言包 | `GET /locales/{lang}` | 登录身份 | [通知与其他](/api/misc) |
| 待重载项 | `GET /pending-reloads` | 登录身份 | [通知与其他](/api/misc) |

## AMI 管理接口

| 接口 | 方法与路径 | 文档 |
| :--- | :--- | :--- |
| 健康检查 | `GET /health` | [AMI](/api/ami-health) |
| SIP 对话 / 事务 | `GET /dialogs`、`GET /transactions` | [AMI](/api/ami-health) |
| 配置热重载 | `POST /reload/{trunks,routes,acl,app,queues,ivr}` | [AMI](/api/ami-ops) |
| 优雅停机 | `POST /shutdown` | [AMI](/api/ami-ops) |
| 封禁管理 | `GET` / `DELETE /bans`、`GET` / `DELETE /frequency_limits` | [AMI](/api/ami-ops) |
| 外呼 SSE | `POST /outbound/dial`（需启用 `[outbound]`） | [AMI](/api/ami-cluster) |
| 集群操作 | `POST /cluster/*`（commerce 构建） | [AMI](/api/ami-cluster) |

::: tip 出站 Webhook
除入站 REST 外，RustPBX 还支持 HTTP Router 动态路由、用户后端鉴权、Locator 事件、
CDR/录音回传等**出站 Webhook**，见 [出站 Webhook 概览](/apiguide/webhooks)。
:::
