# 开发

RustPBX 本身不含业务逻辑——呼叫怎么路由、振铃给谁、什么时候录音、用户按键如何处理，全部由**你的程序**决定。本章汇总最常用的几类二次开发场景，每篇都给出「语义 + 实现方式 + 事件观测 + 注意事项」。

## 五个入口

| 入口 | 触发时机 | 适合做什么 | 详见 |
|---|---|---|---|
| **HTTP Router** | 每个入局 INVITE 到达时 | 决定呼叫去向：同振 / 顺振的目标列表、录音开关、超时 | [HTTP Router 动态路由](/interfaces/http-router) |
| **RWI WebSocket** | 通话全程实时 | 下发命令与接收事件：三方、录音、DTMF、转接、队列、监听 | [RWI 实时接口](/interfaces/rwi) |
| **REST API** | 低频管理 | 查活动通话、下发挂断 / 转接 / 放音 / 录音命令、下载录音 | [通话控制](/api/call-control) |
| **出站 Webhook** | 事件发生时 | 不想维持长连接：把 RWI 事件、CDR、录音推给你的服务 | [Webhook 事件推送](/interfaces/webhooks) |
| **插件** | 进程内（Rust） | 挂进 PBX 内部的扩展：拨号计划检查器、CDR 钩子、控制台页面 | [编写插件](/addons/development) |

## 本章章节

| 章节 | 解决什么问题 |
|---|---|
| [同振](/development/simultaneous-ring) | 一个呼叫同时振铃多个终端，先接者赢 |
| [顺振](/development/sequential-ring) | 按优先级逐个拨打，失败自动换下一个 |
| [呼叫转移](/development/call-transfer) | 分机前转（来电 / 遇忙 / 异常转移）与通话中转接（盲转 / 咨询转 / 替换转 / DTMF 热键） |
| [监听与督导](/development/monitoring) | 监听 / 耳语 / 强插 / 接管：主管介入坐席通话 |
| [多方会议](/development/conference-room) | N 人会议房间：SIP 拨入与 RWI 建房拉人（三方通话 = 三人会议） |
| [录音录像](/development/recording) | 按需开启 / 分段录音，把录音送到你的存储 |
| [DTMF 响应](/development/dtmf-response) | 收到用户按键后执行你的业务逻辑 |
| [黑白名单](/development/call-screening) | 黑名单拒接 / 白名单放行：呼叫拦截的三个时机 |
| [呼叫中心](/development/call-center) | 排队、坐席分配与技能组（ACD）调度 |

## 开发前准备

### 1. 领一个 RWI Token

```toml
[[rwi.tokens]]
token = "my-control-service-token"
name = "crm"
scopes = ["*"]            # 按需收敛，如 ["call.control"]
```

Token 支持热更新（保存即生效，无需重启），详见 [RWI 实时接口](/interfaces/rwi#token-配置)。

### 2. 连接、订阅、认领呼叫

```javascript
const ws = new WebSocket("ws://pbx:8080/rwi/v1?token=TOKEN", ["rwi-v1"]);

ws.onopen = () => ws.send(JSON.stringify({
  action: "session.subscribe", params: { contexts: ["default"] }
}));

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  // 命令响应：{ "type": "command_completed" | "command_failed",
  //             "action_id": "...", "action": "...", "status": ..., "data": ... }
  // 事件（扁平结构）：{ "event_type": "call_created" | "dtmf" | ...,
  //                    "call_id": "...", ...业务字段, ...上下文增强字段 }
};
```

- `session.subscribe` 的参数是 **`contexts`（数组）**；上下文按名字精确匹配，没有通配；
- **入局呼叫**先以 `call_created`（`context: "default"`）扇出给该上下文的订阅者，你再用 `session.attach_call` 认领；
- 路由把呼叫派给 `rwi` 应用时，`call_created` 按该路由指定的上下文名扇出，订阅时用同一个名字；
- **你发起的呼叫**（`call.originate`）与**你认领的呼叫**（`session.attach_call`）：事件直达你的连接，不依赖上下文订阅；
- 连接断开后孤儿呼叫默认保持 `orphan_hold_secs`（30s），重连用 `session.resume` 接管（缓存事件可回放）。

### 3. 关联 ID

| ID | 用途 |
|---|---|
| `session_id` | 一通逻辑呼叫（含转接 / 咨询腿）全生命周期不变，串联全部事件与 CDR |
| `call_id` | 单条 SIP 腿；RWI 命令的 `call_id` 字段传 Call-ID 或 `session_id` 都可（活动通话注册表两者都索引） |

规则见 [session_id 关联模型](/guide/session-id)。

::: tip 不想维持 WebSocket？
RWI 事件可以按事件名订阅成 HTTP Webhook（带重试与幂等键），命令侧用 REST API 下发即可。见 [Webhook 事件推送](/interfaces/webhooks)。
:::

## 调试手段

| 手段 | 说明 |
|---|---|
| 控制台「诊断」页 | 评估路由规则，不发起真实呼叫 |
| `POST /api/settings/config/proxy/http-router/test` | 先测试路由服务返回值，再启用 `[proxy.http_router]` |
| 控制台「实时通话」 | 看 legs / 媒体 / 录制状态与会议成员 |
| CDR `metadata.trace` | 呼叫级轨迹：路由决策、每次拨号尝试、IVR 回退 |
| 仓库 `examples/` | `http_router_service.py`、`rwi_outbound_bridge.py`、`unified_ivr_provider.py` 等可运行参考 |
