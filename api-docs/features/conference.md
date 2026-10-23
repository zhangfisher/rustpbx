# 电话会议

RustPBX 提供基于 SIP 的电话会议能力：媒体面由独立的 MCU 混音器（`conference_mixer`）负责，与两腿通话的 `MediaBridge` 分离。

## SIP 网络会议（conference_factory_uri）

配置会议工厂 URI 后，话机可直接用标准 SIP 方式加入会议：

```toml
[proxy]
conference_factory_uri = "sip:conference@pbx.example.com:5060"
```

话机侧操作：

1. 把会议号作为用户部分发起 INVITE（如 `sip:1234@conference@pbx.example.com`）；
2. 话机收到挑战后认证；
3. PBX 把该呼叫加入对应会议，返回会议混音后的 SDP。

适用场景：多部普通 SIP 话机 / WebRTC 话机无需 App 即可开会。

## RWI 会议命令

程序化管理会议（坐席系统、AI 会议、三方转接都走这里）：

| 命令 | 说明 |
|---|---|
| `conference.create` | 创建会议 |
| `conference.add` / `conference.remove` | 加入 / 移除成员 |
| `conference.mute` / `conference.unmute` | 静音 / 取消静音 |
| `conference.merge` | 把另一通通话合并进来（三方会议） |
| `conference.seat_replace` | 席位替换 |
| `conference.destroy` / `conference.end` | 解散 / 结束 |

```json
{ "action": "conference.create",
  "params": { "name": "daily-standup", "record": true } }

{ "action": "conference.add",
  "params": { "conference_id": "...", "session_id": "01J..." } }
```

## 会议事件

| 事件 | 说明 |
|---|---|
| `conference_joined` / `conference_left` | 通话加入 / 离开会议 |
| `conference_member_joined` / `conference_member_left` | 成员进出 |
| `conference_member_muted` / `conference_member_unmuted` | 静音状态变化 |
| `conference_merge_requested` / `conference_merged` / `conference_merge_failed` | 三方合并流程 |
| `conference_auth_result` | 会议鉴权结果 |

## 会议工厂模式

配置 `conference_factory_uri` 后，特定 INVITE（指向工厂 URI）会被识别为「创建 / 加入会议」而非普通呼叫——PBX 以会议工厂角色应答并管理混音成员。控制台「实时通话」页可见会议成员与状态。

## 媒体实现

- 每个会议一个独立的混音任务（MCU），成员媒体腿接入混音器；
- 与 `MediaBridge`（两腿桥接）职责分离——混音不在桥接路径上做；
- 会议内录音直接走会议媒体管线。

## 与转接的关系

- `call.transfer.replace` 支持席位替换 / 出席转接语义；
- `conference.merge` 可以把两通独立通话合成一个会议（先 `consult` 后 `merge`）；
- 转接 / 合并失败会产生 `call_transfer_failed` / `conference_merge_failed` 事件，不会静默丢失通话。
