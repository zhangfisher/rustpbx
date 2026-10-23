# 出站 Webhook 概览

RustPBX 除了提供入站 REST 接口，还会主动调用你的服务（出站 Webhook），把路由决策、
注册事件、通话记录等实时推给业务系统。本页只做总览，完整协议与示例见仓库中的
[`docs/api_integration_guide.md`](https://github.com/restsend/rustpbx/blob/main/docs/api_integration_guide.md)。

| Webhook | 方向 | 触发时机 | 配置段 |
| :--- | :--- | :--- | :--- |
| **HTTP Router** | RustPBX → 你的服务 | 每个入站/内部 INVITE，请求你决定转发目标 | `[proxy.http_router]` |
| **User Backend** | RustPBX → 你的服务 | REGISTER/INVITE 鉴权，委托外部账号体系校验密码 | `[[proxy.user_backends]]` |
| **Locator Webhook** | RustPBX → 你的服务 | 终端注册/注销/离线事件 | `[proxy.locator_webhook]` |
| **CDR Push** | RustPBX → 你的服务 | 通话结束后推送 CDR JSON | `[callrecord]` |
| **Recording Upload** | RustPBX → 你的服务 | 录音生成后上传 WAV | `[recording]` |
| **RWI Webhook** | RustPBX → 你的服务 | 通话实时事件（RWI 事件流） | `[rwi]` / 设置页 |

## 与入站 REST 的关系

```
你的 CRM ──REST(入站)──► RustPBX ──Webhook(出站)──► 你的业务服务
   │                        │
   └── 查询/控制通话  ◄──────┘  路由决策、CDR、注册事件
```

- **入站 REST**：你主动拉取/修改资源（本手册其余页面）。
- **出站 Webhook**：RustPBX 在关键节点回调你，常用于动态路由、计费鉴权、坐席状态同步。

::: tip 快速验证入站调用
仓库示例 `examples/http_router_service.py` 展示了如何用 `POST {api_prefix}/diagnostics/locator/lookup`
判断某分机当前是否在线（返回 `total > 0` 即在线），配合 HTTP Router 做智能路由。
:::

## 安全建议

- 出站请求可通过配置段的 `[...headers]` 附加自定义鉴权头（如 `X-API-Key`）。
- 入站 REST 请使用带 scope 的 Bearer Token，见 [认证与权限](/apiguide/authentication)。
- AMI 接口依赖 IP 白名单，避免暴露到公网，见 [AMI API 总览](/api/ami)。
