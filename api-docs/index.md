---
layout: home

title: RustPBX 文档
titleTemplate: 高性能软件定义 PBX 的中文手册与 API 参考

hero:
  name: RustPBX
  text: 软件定义 PBX · 指南与 API 文档
  tagline: 用 Rust 编写的高性能 PBX —— 路由、媒体、事件全部通过 HTTP / WebSocket / Webhook 可编程，无需 C 模块、无需重编译
  actions:
    - theme: brand
      text: 进入指南
      link: /guide/intro
    - theme: alt
      text: REST API 参考
      link: /api/

features:
  - title: SIP 与媒体
    details: 完整 SIP 协议栈（UDP/TCP/WS/TLS/WebRTC），RTP 转发与转码、NAT 穿透、TLS/SRTP 与 ACME 自动证书。
  - title: 路由与呼叫控制
    details: HTTP Router（Webhook 路由决策）、RWI WebSocket（实时呼叫控制）、队列 / ACD、会议。
  - title: AI 原生
    details: AI 智能体作为通话原生参与者 —— 经 WebSocket 实时听、说、打断、转接。
  - title: 录音与分析
    details: SipFlow 统一 SIP + RTP 抓取、离线转写（SenseVoice）、CDR Webhook 推送。
  - title: 运维与安全
    details: 内置 Web 控制台与 WebRTC 话机、RBAC、登录锁定、Prometheus 指标、tokio-console 支持。
  - title: 性能
    details: 约 3.8 核即可承载 5000 路并发通话（含 RTP 转发），零丢包，线性扩展。
---

## 两个入口

| 板块 | 适合谁 | 从这里开始 |
|---|---|---|
| **指南** | 想了解 RustPBX 的特性、架构与部署运维 | [简介](/guide/intro) · [快速开始](/guide/quickstart) · [系统架构](/guide/architecture) · [配置指南](/config/overview) |
| **API** | 想用 REST / AMI 把 RustPBX 接入 CRM、计费、AI 与自动化系统 | [API 快速开始](/apiguide/quick-start) · [接口分类一览](/apiguide/categories) · [REST API 总览](/api/) |

## 三分钟上手

```bash
mkdir -p rustpbx && cd rustpbx
curl -O https://raw.githubusercontent.com/restsend/rustpbx/main/config.toml.example

docker run -d --name rustpbx --net host \
  -v $(pwd)/config.toml.example:/app/config.toml \
  docker.cnb.cool/miuda.ai/rustpbx:commerce --conf /app/config.toml

# 首次创建管理员账号
docker exec rustpbx /app/rustpbx --conf /app/config.toml \
  --super-username admin --super-password changeme
```

| 入口 | 地址 |
|---|---|
| Web 控制台 | `http://localhost:8080/console/` |
| SIP Proxy | `udp://localhost:15060` |
| 测试分机 | `bob` / `alice`，密码 `123456` |

## 文档地图

| 章节 | 适合谁 |
|---|---|
| [项目概览](/guide/introduction) | 想先了解 RustPBX 是什么、能做什么 |
| [快速开始](/guide/quickstart) | 想 5 分钟跑起来一个 PBX |
| [系统架构](/guide/architecture) | 想了解进程模型、模块与代码结构 |
| [呼叫模型与路由](/guide/call-model) | 想开发呼叫应用、对接 CRM / 计费 |
| [配置指南](/config/overview) | 需要逐项查阅 `config.toml` |
| [功能特性](/features/console) | Web 控制台、队列、IVR、AI、WebRTC 等功能介绍 |
| [二次开发](/development/) | 同振 / 顺振 / 三方通话 / 录音录像 / DTMF 响应等场景实现 |
| [运维专题](/operations/observability) | 可观测性、SipFlow 抓包、安全与集群 |
| [API 快速开始](/apiguide/quick-start) | 第一次调用 RustPBX 接口 |
| [REST API 总览](/api/) | 需要逐接口查阅请求 / 响应 |
| [AMI 管理接口](/api/ami) | 健康检查、热重载、集群运维 |
