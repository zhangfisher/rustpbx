# 项目概览

RustPBX 是一个用 Rust 编写的高性能、软件定义 PBX（程控交换机）。它的核心理念是：**所有呼叫控制都外置到 HTTP / WebSocket / Webhook**，路由决策、媒体控制、事件通知都可以用任何语言编程实现，不需要写 C 模块，也不需要重新编译。

::: tip 关键入口
- 代码仓库：[github.com/restsend/rustpbx](https://github.com/restsend/rustpbx)
- 官方网站：[miuda.ai](https://miuda.ai)
- 在线探测：[probe.rustpbx.com](https://probe.rustpbx.com)
:::

## 它能做什么

| 能力域 | 说明 |
|---|---|
| **SIP 与媒体** | 完整 SIP 协议栈（UDP / TCP / WS / TLS / WebRTC）、RTP 转发与转码、NAT 穿透、TLS/SRTP 与 ACME 自动证书 |
| **路由与控制** | HTTP Router（每个入局 INVITE 调用你的 Webhook 做路由决策）、RWI WebSocket（实时呼叫控制）、队列 / ACD |
| **AI 原生** | AI 智能体作为通话的原生参与者 —— 通过 WebSocket 实时听、说、打断（barge）、转接 |
| **录音与分析** | SipFlow 统一 SIP + RTP 抓取、离线转写（SenseVoice）、CDR Webhook 推送 |
| **运维** | 内置 Web 控制台与 WebRTC 话机、RBAC 权限、Prometheus 指标、tokio-console 支持 |

性能参考：在约 3.8 个 CPU 核心上即可承载 **5000 路并发通话**（含 RTP 转发），0% 丢包，且随核心数线性扩展。详见[基准测试](https://github.com/restsend/rustpbx/blob/main/tests/bench/bench.md)。

## 版本（Editions）

RustPBX 以四个 Docker 镜像发布 —— **同一个内核**，预置的插件（addon）不同：

| 版本 | 镜像 | 包含内容 |
|---|---|---|
| Community | `ghcr.io/restsend/rustpbx:latest` | 核心 PBX + 队列 / 归档 / 转写 / ACME 插件 |
| Commerce | `docker.cnb.cool/miuda.ai/rustpbx:commerce` | + 许可证平台、品牌化外发邮件 |
| Wholesale | `docker.cnb.cool/miuda.ai/rustpbx:wholesale` | + 语音批发业务（费率、计费、中继） |
| Contact Center | `docker.cnb.cool/miuda.ai/rustpbx:cc` | + 坐席、技能组、ACD、监控墙 |

商业版本开箱即运行在**试用模式**；在配置文件的 `[licenses]` 节填入密钥即可激活。详见[插件、控制台与存储](/config/07-addons-admin-storage_zh)。

社区版二进制对应的源码入口只有一行 —— `src/bin/rustpbx.rs` 调用 `builder::main_with_addons(vec![])`，即"核心 + 空插件列表"。商业版本则通过 `main_with_addons()` 注入各自的插件集。

## 两个可编程入口

### HTTP Router（路由 Webhook）

每个入局 INVITE 都会调用你的 Webhook，返回 JSON 决定怎么处理这通呼叫：

```json
// 你的服务收到：{ "call_id": "abc-123", "from": "sip:+861390000@trunk", "to": "sip:400800" }
// 你返回：      { "action": "forward", "targets": ["sip:1001@internal"], "record": true }
```

动作有四种：`forward`（转发）· `reject`（拒绝）· `abort`（中止）· `spam`（垃圾呼叫）。完整契约见[呼叫模型与路由](/guide/call-model)。

### RWI（实时 WebSocket 接口）

基于 WebSocket 的 JSON 协议，用于通话中实时控制：`originate`、`answer`、`hangup`、`bridge`、`transfer`、`play`、`record.start`、队列 / ACD 命令、坐席监听 / 悄悄话 / 强插、会议命令等。完整协议见 [RWI WebSocket 协议](/guide/rwi)。

## 本文档的结构

- **指南**：面向理解和上手 —— 概览、快速开始、架构、呼叫模型、控制台、部署
- **配置指南**：逐项查阅 `config.toml` 的每个章节
- **API**：REST / AMI 接口的入门指南与逐接口参考

如果你是第一次接触，建议按 [快速开始](/guide/quickstart) → [系统架构](/guide/architecture) → [呼叫模型与路由](/guide/call-model) 的顺序阅读。
