# 简介

RustPBX 是一个用 Rust 编写的高性能、软件定义的 PBX（程控交换机）。它的核心设计哲学是：**呼叫控制全部外置**——路由决策、媒体控制、事件通知都通过 HTTP / WebSocket / Webhook 完成，你可以用任何语言编写业务逻辑，无需编写 C 模块，也无需重新编译 PBX。

::: tip 项目信息
- 仓库：[https://github.com/restsend/rustpbx](https://github.com/restsend/rustpbx)
- 官网：[https://miuda.ai](https://miuda.ai)
- 协议：MIT
- 当前版本：0.5.x
:::

## 它能做什么

| 能力 | 说明 |
|---|---|
| **SIP 与媒体** | 完整 SIP 协议栈（UDP/TCP/WS/TLS/WebRTC）、RTP 中继与转码、NAT 穿透、TLS/SRTP 与 ACME 自动证书 |
| **路由与控制** | HTTP Router（Webhook 路由决策）、RWI WebSocket（实时通话控制）、队列 / ACD |
| **AI 原生** | AI 智能体作为通话的原生参与者——监听、说话、打断（barge）、转接，均通过 WebSocket 完成 |
| **录音与分析** | SipFlow 统一捕获 SIP+RTP、离线转写（SenseVoice）、CDR Webhook |
| **运维** | 内置 Web 控制台与 WebRTC 话机、RBAC、Prometheus 指标、OpenTelemetry（商业版） |

性能参考：在约 3.8 核上承载 **5000 路并发通话**（含 RTP 中继），0% 丢包，近似线性扩展。

## 两分钟理解它

对一个入局呼叫，RustPBX 的处理链是：

1. SIP INVITE 从任意传输（UDP/WS/WebRTC…）进入；
2. 经过 ACL → 认证 → 注册等模块链；
3. **你的 Webhook 被调用**（HTTP Router），返回 JSON 决定呼叫去向：转发给分机、进入队列、跑 IVR、拒绝……；
4. 呼叫建立后，**RWI WebSocket 事件流**实时推送 `call_created` / `call_answered` / `call_hangup` 等事件，你也可以随时通过 RWI 下发转接、监听、放音、录音等命令；
5. 通话结束，CDR 落库并通过 Webhook 推送给你。

一切业务逻辑（选路、IVR、AI 对话、计费、坐席调度）都在你的应用里，RustPBX 只负责稳定、高效地处理信令与媒体。

## 目录导航

- **[指南](/guide/intro)**：快速开始、系统架构、版本与插件体系、核心概念。
- **[配置](/config/overview)**：TOML 配置体系逐段详解。
- **[可编程接口](/interfaces/http-router)**：HTTP Router、RWI WebSocket（命令 / 事件参考）、Webhook、REST API 与 AMI。
- **[功能特性](/features/console)**：Web 控制台、WebRTC 话机、队列、会议、IVR、AI 语音、外呼。
- **[运维](/operations/observability)**：可观测性、SipFlow 抓包回放、安全、集群。
- **[插件开发](/addons/overview)**：Addon 机制与如何编写自己的插件。

## 下一步

- 想立刻跑起来：[快速开始](/guide/quick-start)
- 想了解整体设计：[系统架构](/guide/architecture)
- 想接入业务系统：[HTTP Router 动态路由](/interfaces/http-router)
