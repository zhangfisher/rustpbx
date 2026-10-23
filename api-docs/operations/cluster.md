# 集群与高可用

RustPBX 支持多节点集群部署：节点间通过 **SIP + AMI 双通道**互联，共享在席状态、事件与会话注册表。

## 配置

```toml
[cluster]
peers = [
  { addr = "10.0.0.2", sip_port = 5060, ami_port = 8080 },
  { addr = "10.0.0.3", sip_port = 5060, ami_port = 8080 }
]
session_registry_backend = "database"   # 跨节点会话注册表（memory / database）
session_registry_ttl_secs = 60
session_max_age_secs = 86400
```

节点间同步内容：

- **在席状态**（presence）；
- **事件 hub**（RWI 事件跨节点扇出）；
- **userdata 复制**（呼叫变量跨节点可见）；
- **会话注册表**（session_id → owner 节点）。

## 集群中的 RWI

客户端连任一节点的 `/rwi/v1` 即可控制**整个集群**：

1. 命令命中本机会话 → 本机执行；
2. 命令命中远端会话 → 本机网关经 AMI `/cluster/session_op` 转发到 owner 节点；
3. 结果与事件回流到发起连接，客户端无感。

## 会话注册表

| 后端 | 适用 |
|---|---|
| `memory` | 单机（默认） |
| `database` | 集群（共享数据库） |

注册表带 TTL 与最大会话年龄，节点重启 / 失联后自动过期回收。

## SipFlow 集群采集

多节点 PBX 可把 SIP/RTP 流投递到 SipFlow 服务器集群（按 `call_id` 一致性哈希分布，保证同一呼叫的信令与媒体落在同一节点）：

```toml
[sipflow]
type = "remote"
nodes = [
  { udp = "192.168.1.1:3000", http = "http://192.168.1.1:3001" },
  { udp = "192.168.1.2:3000", http = "http://192.168.1.2:3001" }
]
```

## 优雅排水与滚动重启

```toml
[graceful_shutdown]
drain_timeout_secs = 300      # 0 = 无限等待
```

停机流程（SIGTERM / `docker stop` / `POST /ami/v1/shutdown`）：

1. 新呼叫 / 新注册回 **503**；
2. `OPTIONS` / health 返回 **500** → 前端负载均衡停止摘流到该节点；
3. 活跃通话正常结束；
4. 进程退出。

`enabled_at_startup = true` 可开机即进入排水态（维护模式）。配合 LB 健康检查指向 `/healthz`，即可实现**无损滚动重启**。

## 多节点日志

控制台「设置 → 日志」可查看任一节点日志（经 AMI `/cluster/logs/*` 代理转发），无需逐机 ssh。

## 商业版集群能力

`commerce` feature 提供更多集群命令（AMI `/ami/v1/cluster/*`）：集群重载、设置同步、集中管理。SSO broker 采用无状态信封设计——各节点只需相同密钥，无需共享存储。
