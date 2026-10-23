# 核心概念

阅读其他文档前，先掌握这几个贯穿全书的概念。

## call_id 与 session_id（两级 ID）

RustPBX 用两级标识关联一通呼叫：

| ID | 含义 | 生命周期 |
|---|---|---|
| `call_id` | 一条 SIP 对话（leg）的 `Call-ID` 头 | 每个 SIP leg 一个；转接、并行振铃、会议合并都会产生新的 leg / call_id |
| `session_id` | 一通**逻辑呼叫**的根会话 ID（RFC 7989 风格全局会话标识） | 从呼叫创建到最终挂机不变，贯穿转接 / 队列 / IVR 的所有 leg |

::: tip 关联技巧
HTTP Router 请求体、RWI 事件、CDR、Webhook 中都同时携带这两个 ID。**用 `session_id` 串联一通呼叫的全部环节，用 `call_id` 定位具体某条腿。**
:::

## B2BUA

RustPBX 是 B2BUA（Back-to-Back User Agent）：主叫腿与被叫腿是两条独立的 SIP 对话，PBX 在中间完全掌控两侧信令与媒体。这使得以下能力都是本地操作而非协商结果：

- 转接（blind / attended）、监听、强插、代答；
- 逐腿录音、媒体桥接/拆除、codec 转码；
- 按腿改写 SIP 头（HMR 规则）、控制回铃与早期媒体。

## Dialplan（拨号计划）

路由决策的结果是一个 `Dialplan` 容器，描述这通呼叫接下来做什么。它有三种流程类型：

| 类型 | 说明 |
|---|---|
| `Targets` | 一组呼叫目标（分机 / SIP URI / 中继），按顺序或并行拨打 |
| `Queue` | 进入一个呼叫队列等待坐席 |
| `Application` | 交给一个呼叫应用（IVR、realtime AI、会议等） |

Dialplan 还携带媒体配置、录音策略、变量等。它由静态路由表（`[[proxy.routes]]`）或 [HTTP Router](/interfaces/http-router) 动态生成。

## 媒体锚定与旁路（Anchored / Bypass）

PBX 是否处在媒体路径上：

- **Anchored（锚定）**：RTP 经 PBX 中继——录音、转码、监听、AI 参与都要求锚定；
- **Bypass（旁路）**：两端直传 RTP，PBX 只走信令，节省媒体带宽；
- **Auto / Nat**：默认策略——需要时（如录像、NAT 穿透、IVR/队列流程）自动锚定，否则旁路。

配置项 `[proxy] media_proxy = "auto" | "all" | "nat" | "none" | "bypass"`，也可按中继 / 按呼叫覆盖。

## 模块链（Proxy Modules）

SIP 代理按配置的模块顺序处理每个事务：

```
acl → auth → presence → registrar → call
```

任一模块可 `Abort` 截断链条（如认证失败）。模块声明自己处理的方法集合，其并集决定 `Allow` 头。详见 [SIP 代理核心](/config/proxy-core)。

## 用户后端（User Backend）与位置服务（Locator）

- **用户后端**回答「这个用户名密码对不对」——支持 `memory`（配置内置）、`database`（分机表）、`http`（外部服务，可带一次性 Token）、`plain`（密码文件）、`extension`（分机库）多种，可链式配置依次查询；
- **位置服务（Locator）**回答「这个用户现在注册在哪」——支持 `memory` / `database` / `http` 后端。

## Trunk（SIP 中继）

Trunk 描述与外部 SIP 网关 / 上游运营商的对接参数：目的地址、认证、codec 白名单、限流（max_calls / max_cps）、负载均衡策略（random / hash / rr / weighted）、健康检查与故障转移、头改写规则（HMR）、媒体策略等。出局呼叫按路由规则选中 Trunk 后，PBX 自动应用上述所有改写。详见 [路由与中继](/config/routing)。

## RWI

**R**eal-time **W**ebSocket **I**nterface——RustPBX 的实时控制面，JSON over WebSocket。一条连接上同时承载：

- **命令**：`call.originate` / `call.transfer` / `record.start` / `queue.enqueue` / `supervisor.listen` / `conference.create` …
- **事件**：`call_created` / `call_answered` / `dtmf` / `transcript_segment` / `queue_position_changed` …

详见 [RWI 实时接口](/interfaces/rwi)。

## HTTP Router 与静态路由

入局呼叫的两种路由决策方式：

- **静态路由**：配置文件 / 控制台里的路由规则（`[[proxy.routes]]`），按优先级正则匹配；
- **HTTP Router**：把每个 INVITE POST 给你的 Webhook，由你的服务实时返回决策。

两者可共存：HTTP Router 返回 `not_handled` 且开启 `fallback_to_static` 时回落到静态路由。

## Addon（插件）

实现 `Addon` trait 的 crate，通过 Cargo feature 编译进二进制、通过配置 `[proxy] addons` 启用。插件可以贡献：初始化逻辑、HTTP 路由、控制台页面与侧栏项、数据库迁移、CDR 钩子、事件、品牌化。详见 [插件体系](/addons/overview)。

## SipFlow

统一捕获每通呼叫的 **SIP 信令 + RTP 媒体** 的子系统：本地 SQLite 或远程集群后端落盘，控制台可查看信令阶梯图、媒体质量（丢包 / jitter）、从 RTP 合成 WAV 回放。详见 [SipFlow](/operations/sipflow)。
