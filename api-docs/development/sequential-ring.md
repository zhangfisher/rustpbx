# 顺振

顺振（顺序振铃 / Sequential / Failover）：**按你给定的顺序逐个拨打，前一个失败才拨下一个**，直到有人接听或目标耗尽。典型场景：分机 → 组长 → 手机的逐级兜底、LCR 多运营商候选、坐席轮流。

## PBX 内建语义

顺序拨号的关键约定（对应仓库 `docs/trunk-retry.md`）：

| 约定 | 说明 |
|---|---|
| **候选序列一次构建** | 路由决策只做一次；拨号过程中**不会**再回调你的路由服务 |
| **每个目标一份策略** | 目标对象可带 `retry_policy`（`status_codes`，300–699），以及自己的号码改写、凭据、媒体设置、计费上下文 |
| **按码推进** | 只有失败码出现在该目标的 `retry_policy` 里才拨下一个；**空策略 = 任何失败都推进**（HTTP Router 目标默认如此；中继目标必须配策略才切换） |
| **单次尝试振铃上限** | 目标级 `max_ring_time` 到点即 `CANCEL` 该腿并按 408 失败，策略里列出 408 即推进 |
| **整通振铃上限** | 呼叫自己的 `max_ring_time` 包住**整个序列**，到点取消当前腿并直接拒绝，不再尝试后续目标 |
| **停止条件** | 有人接通、目标耗尽、主叫取消、整通振铃超时 |

### 失败轨迹（对二次开发很重要）

- CDR **只描述最后一次尝试**；
- 此前每一次失败都会在 CDR 的 `metadata.trace` 追加一条 `dial.attempt_failed`，`detail` 含**尝试序号、目标 URI、SIP status / reason、`trunk_id` / `trunk`**；
- 你的 CDR 钩子 / Webhook 可据此统计「每个候选各试了几次、什么码放弃的」，用于按运营商计费、熔断、SLA 报表——路由器本身不会被再次调用。

## 实现方式一：HTTP Router（推荐）

顺序与推进策略由你的服务决定（VIP 优先、按成本 LCR、按班组兜底）：

```json
{
  "action": "forward",
  "strategy": "sequential",
  "max_ring_time": 60,
  "targets": [
    { "uri": "sip:1001@internal",
      "retry_policy": { "status_codes": [408, 486, 503] } },
    { "uri": "sip:1002@internal",
      "retry_policy": { "status_codes": [408, 503] } },
    { "uri": "sip:+86139000000@trunk",
      "retry_policy": { "status_codes": [408, 503, 603] } }
  ],
  "record": true
}
```

- `targets` 也可以是纯字符串，此时该目标**没有策略**，任何失败都会推进；
- 单个目标的 `retry_policy` 只对本目标生效，换目标不重新走路由决策；
- 录音与媒体路径由首个目标确定，通话中途不改。

详见 [HTTP Router 动态路由](/interfaces/http-router)。

## 实现方式二：中继 failover（外呼 / 批发路由）

```toml
[proxy.trunks.carrier-a]
dest = "sip:a.example.com:5060"
max_ring_time = 20                      # 本目标最多振铃 20s（到点按 408 计）

[proxy.trunks.carrier-a.retry_policy]
status_codes = [408, 503]               # 只有这些码才切到下一候选
```

候选顺序由权重 / LCR 买价 / 路由优先级决定；健康检查失败自动切 `fallback_trunk`。详见 [路由与中继](/config/routing#失败重试与转移) 与仓库 `docs/trunk-retry.md`。

## 实现方式三：队列顺序拨坐席

```jsonc
"strategy": { "mode": "sequential", "wait_timeout_secs": 300 }
```

坐席轮流被拨打，未接可用 `queue.requeue` 重新进入轮询；配合 `queue.set_priority` 调整顺序。见 [队列接口](/api/queues)。

## 实现方式四：忙线等待（camp-on）

被叫返回 486 时把主叫停在 183 早期媒体循环音里，定时重拨直到空闲接通：

```toml
[[proxy.routes]]
name = "busy-wait-1001"
priority = 10

[proxy.routes.match]
"to.user" = "1001"

[proxy.routes.busy_wait]
enabled = true
max_wait_secs = 60
retry_interval_secs = 5
hold_audio = "sounds/phone-calling.wav"
```

## 事件与观测

| 观测点 | 说明 |
|---|---|
| `call_ringing` | 当前正在振铃的腿 |
| `call_no_answer` / `call_busy` / `call_error` | 当前腿失败（随后自动推进） |
| `call_answered` | 接通，后续不再拨新目标 |
| `call_hangup` | 通话结束 |
| `metadata.trace` 的 `dial.attempt_failed` | 每个失败候选一条：序号、URI、状态码、trunk |
| 控制台「诊断」页 | 离线评估规则与目标顺序，不发真实呼叫 |

## 常见问题

- **为什么没有切换？** 检查该目标的 `retry_policy.status_codes` 是否包含实际失败码——策略为空表示「不切换」（中继目标）或「任何失败都切换」（HTTP Router 目标），两者语义相反，别配混。
- **486 会不会切？** 取决于策略是否列出 486：列出即切，不列出即整通失败。
- **顺序拨打期间能改目标吗？** 不能，序列一次性构建；要动态调整请在下一通呼叫的路由决策里做。
