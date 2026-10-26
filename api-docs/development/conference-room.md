# 多方会议

多方会议就是**一个「混音房间」**：三路以上的通话进到同一个房间里，房间里的人互相都能听到。两个人通话不需要房间，三个人起就必须建房间——**平时说的「三方通话」，本质上就是一个三人房间**：用实现方式二建一个三人房间、拉三个人进去，就是三方通话。

开一场会议，只有两个问题：

1. **房间怎么建？** 两种建法：让用户拨号进来时自动建（会议工厂），或你的程序调 RWI 命令建（程序化建房）；
2. **人怎么进来？** 两种进法：参会人**拨会议号**进来，或你的程序**把人呼进来**（被邀请人接电话就行）。

RustPBX 的两类房间正好对应这两种组合：

| | 房间怎么建 | 人怎么进 | 适合 |
|---|---|---|---|
| **会议工厂** | 用户拨工厂号时自动建 | 参会人拨会议号 | 普通话机开会、固定会议室 |
| **RWI 程序化房间** | 你的代码 `conference.create` | 你的程序把人呼进去 | 坐席系统、AI 参会、程序化调度 |

::: warning RWI 建的房间不接受拨号
`conference.create` 建的房间（不管你指定房间号还是用随机号）**不能拨号进入**——有人拨打这个房间号，PBX 只会当成拨打一个普通分机，绝不会进会议。房间里的人**全部由你的程序呼进来**。想让用户自己拨号进会，用会议工厂。
:::

## 实现方式一：会议工厂（用户拨会议号入会）

**RustPBX 只需一行配置**（`config.toml`，重启生效）：

```toml
[proxy]
conference_factory_uri = "sip:conference@pbx.example.com:5060"
conference_empty_timeout_secs = 60    # 所有人离开后多久销毁房间，0 = 不销毁
```

配好后，**「conference」就成了一个魔法号码**——拨打它的行为：

| 拨什么 | 发生什么 |
|---|---|
| 话机拨 **conference** | 自动**新建**一个房间，拨打者成为第一个成员，并拿到一个会议号 |
| 话机拨**已存在的会议号** | 加入该房间，听到会议混音 |
| 话机拨 `room-` 开头但**不存在的号** | 忙音（404）——不会误建房间、也不会打到别人分机上 |
| 话机拨其他任意号码 | 正常分机呼叫，与会议无关 |

**一场会议的完整流程**（谁做什么）：

1. **主持人**：话机直接拨 `conference`——房间自动建好，他第一个进会；
2. **拿到会议号**：会议号形如 `room-a3f9c2@pbx.example.com`（房间号 = `conf_id`，加上你的服务器域名）。你的程序订阅 RWI 的 `conference_created` 事件即可拿到，或在控制台「实时通话」页查看；
3. **组织者**：把会议号发给参会人（邮件、IM、日历邀请，随你的业务）；
4. **参会人**：在话机上**像拨分机一样拨打这个会议号**——通了就说明进会了；
5. **散会**：所有人挂机后，空房间按 `conference_empty_timeout_secs` 自动销毁。

普通 SIP 话机 / WebRTC 话机都能这样入会，无需装任何 App。

## 实现方式二：RWI 程序化建房（程序建房、呼人进会）

这种模式下**用户全程不用拨任何号码**：房间由你的程序建，成员由你的程序一个个呼进房间。

### 第 1 步：建房

```json
{ "action": "conference.create", "action_id": "c1",
  "params": { "conf_id": "room-sales-1023", "max_members": 8, "max_duration_secs": 7200 } }
```

PBX 回复 `command_completed`，`data` 里带回 `conf_id`：

```json
{ "type": "command_completed", "action_id": "c1", "data": { "conf_id": "room-sales-1023" } }
```

- `conf_id` 可以指定（如上例的业务房间号），也可以**省略**——PBX 自动生成一个随机号；
- `max_members` 成员上限、`max_duration_secs` 房间最长存活时间，都可省略；
- 同名房间已存在时会回复 `command_failed`。

### 第 2 步：把人呼进房间

被邀请人分两种情况：

**情况 A：他正在通话中**（比如客户刚打进来，你想拉他和其他人一起协商）——直接把这条通话拉进房间：

```json
{ "action": "conference.add", "action_id": "a1",
  "params": { "conf_id": "room-sales-1023", "call_id": "<他的 Call-ID 或 session_id>" } }
```

他**无感知**：正在说的话直接变成会议发言，对面多了几个人。

**情况 B：他没有通话**——先让 PBX 振铃他的话机，他接听后再拉进房间：

```json
{ "action": "call.originate", "action_id": "o1",
  "params": { "destination": "sip:1003@internal", "timeout_secs": 30 } }

{ "action": "conference.add", "action_id": "a2",
  "params": { "conf_id": "room-sales-1023", "call_id": "<originate 返回的通话>" } }
```

**被邀请人要做的只有一件事：接电话。** 接起来那一刻就在会议里了（不想接就是普通来电响铃，超时不接也不会进会）。

::: tip 房间不会替你呼人
`conference.add` 的 `call_id` 必须**已经存在**——要么是正在通话的人，要么是你刚 `call.originate` 呼通的腿。建房命令本身不会呼叫任何人，「呼人」和「拉进房间」永远是两步。
:::

### 三类房间的选择建议

| 你要的效果 | 做法 |
|---|---|
| 参会人自己拨号进会（像电话会议） | 会议工厂（实现方式一） |
| 程序调度、成员被动接入（坐席 / AI / 客服会商） | RWI 建房 + `conference.add`（实现方式二） |
| 指定房间号方便业务管理（如按工单号建会） | RWI 建房时指定 `conf_id`，房间号跟业务走 |

## 命令参考

| 命令 | params | 作用 |
|---|---|---|
| `conference.create` | `conf_id`、`max_members`、`host_call_id`、`max_duration_secs` | 建房，回复带回 `conf_id` |
| `conference.add` / `conference.remove` | `conf_id`、`call_id` | 把人拉进会 / 移出会议 |
| `conference.mute` / `conference.unmute` | `conf_id`、`call_id` | 静音 / 取消静音（别人听不到他，他仍能听到会议） |
| `conference.merge` | `conf_id`、`call_id`、`consultation_call_id` | 两通通话合并成三人会议 |
| `conference.seat_replace` | `conf_id`、`old_call_id`、`new_call_id` | 换人：新腿顶替旧腿，旧腿被系统挂断 |
| `conference.end` | `conf_id`、`host_call_id` | 主持人散会：移除全部成员 |
| `conference.destroy` | `conf_id` | 直接拆房 |

`end` 是「宣布散会」（成员被移出、有 `conference_ended_by_host` 事件）；`destroy` 是「直接拆房」。`conference.*` 命令里房间一律叫 `conf_id`，成员一律叫 `call_id`（Call-ID 或 `session_id` 都行）。

## 事件与观测

| 事件 | 说明 |
|---|---|
| `conference_created` / `conference_destroyed` | 房间建好 / 被拆（`conference_created` 事件里能拿到 `conf_id`） |
| `conference_ended_by_host` | 主持人散会（带 `host_call_id`、被移出的成员列表） |
| `conference_joined` / `conference_left` | 一条通话进会 / 离会 |
| `conference_member_joined` / `conference_member_left` | 成员进出 |
| `conference_member_muted` / `conference_member_unmuted` | 静音状态变化 |
| `consult_switched` | 咨询期间在客户 / 咨询对象之间切换私谈 |
| `conference_merge_requested` / `conference_merged` / `conference_merge_failed` | 三方合并的进度（失败带原因，两通电话保持原状，不会丢） |
| `conference_seat_replace_started` / `…succeeded` / `…failed` | 换人进度 |
| `conference_error` | 房间出错（命令同时回复 `command_failed`） |

控制台「实时通话」页能直接看到每个房间的成员列表与状态。全部事件见 [RWI 事件参考](/interfaces/rwi-events)。

## 能力边界

- **只混音，不混画面**：当前混音器只处理声音——**视频会议（画面合成 / 切换）暂不支持**。带视频的终端进会只取它的声音，画面不会出现在服务端合成结果里；
- **媒体必须经过 PBX**：会议成员的语音全部经混音器处理，无法旁路；
- **会议工厂是独立开关**：`conference_factory_uri` 只服务「拨号入会」，RWI 的会议命令不依赖这个配置——只用 RWI 时可以不配；
- **话单归属**：咨询腿和原通话共用同一个 `session_id`，用它把三方的 CDR 和事件串成一条线，见 [session_id 关联模型](/guide/session-id)；
- **录音**：成员就是普通通话腿，跟全局录音配置或对单腿 `record.start` 走，见 [录音录像](/development/recording)；
- **权限**：RWI token 的 `scopes` 需包含会议控制（`["*"]` 或对应范围），见 [RWI 实时接口](/interfaces/rwi#token-配置)。

## 常见问题

- **用户拨了房间号却听到「正在呼叫分机」？** 这是 RWI 建的房间——它不接受拨号。要么改用会议工厂，要么由程序 `conference.add` 把他呼进会。
- **`conference.add` 失败？** 查两件事：房间建了没有（先 `conference.create`）、这个人的通话还活着吗（挂了就先 `call.originate` 再 add）。
- **人满了再加人会怎样？** 加不进来，房间广播 `conference_error`，已在会的人不受影响。
- **合并失败了电话会掉吗？** 不会——`conference_merge_failed` 带原因，两通电话原样保留，可以重试，或改用 `call.transfer.complete` 把一方转走。
- **想让一部分人先小声商量？** 房间本身没有分组功能——建两个房间分别拉人，由你的程序桥接；或者用督导的耳语模式对单人单向说话，见 [监听与督导](/development/monitoring)。
