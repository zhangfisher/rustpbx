# 版本与插件体系

RustPBX 采用「**小核心 + 可选插件（Addon）**」设计。同一个核心，通过不同的插件组合发布为四个版本：

| 版本 | 镜像 | 包含内容 |
|---|---|---|
| Community（社区版） | `ghcr.io/restsend/rustpbx:latest` | 核心 PBX + queue / archive / transcript / acme 插件 |
| Commerce（商业版） | `docker.cnb.cool/miuda.ai/rustpbx:commerce` | + 许可证平台、品牌化外发邮件 |
| Wholesale（批发版） | `docker.cnb.cool/miuda.ai/rustpbx:wholesale` | + 语音批发交易（费率、计费、中继管理） |
| Contact Center（呼叫中心版） | `docker.cnb.cool/miuda.ai/rustpbx:cc` | + 坐席、技能组、ACD、坐席大屏 |

::: tip 商业版开箱即试用
商业版默认以**试用模式**运行；在配置中提供 `[licenses]` 密钥即可激活。详见 [安全与许可证](/operations/security#许可证)。
:::

## 内置插件

| 插件 | Feature | 说明 |
|---|---|---|
| `queue` | 无（始终编译） | 队列引擎：等待音乐、坐席分配、溢出策略，控制台 `/queues` 页面 |
| `acme` | `addon-acme` | Let's Encrypt 证书申请与自动续期（HTTP-01），热重载 HTTPS 与 SIP TLS |
| `archive` | `addon-archive` | 按 `archive.toml` 定时把 CDR 归档为压缩 CSV 并从数据库删除 |
| `transcript` | `addon-transcript` | 通话录音转写（SenseVoice 离线模型），CDR 详情页注入转写面板 |
| `observability` | `addon-observability` | Prometheus `/metrics` 与存活探针 `/healthz` |

默认 feature 集合即包含全部社区插件：

```toml
# Cargo.toml
default = ["console", "addon-acme", "addon-transcript", "addon-archive", "addon-observability"]
```

所有插件都强依赖 `console` feature，以保证 `--no-default-features` 下也能编译通过。

## 插件如何生效

插件需要**同时**满足两个条件才会启用：

1. 出现在配置 `[proxy] addons` 列表中：

```toml
[proxy]
addons = ["acme", "archive", "transcript", "queue"]
```

2. （仅商业插件）许可证有效或未开启强制模式（`licenses.enforce = false`，即试用模式）。

未列入 `addons` 的插件即使编译进了二进制也不会初始化。控制台的「插件」页面（`/addons`）展示各插件状态与许可证情况。

## 编译期组合

社区二进制的入口只组装内置插件：

```rust
// src/bin/rustpbx.rs
fn main() { builder::main_with_addons(vec![]); }
```

商业发行版是独立的 crate（`rustpbx-commerce` / `rustpbx-cc` / `rustpbx-wholesale`，不在本仓库），它们实现同一个 `Addon` trait，通过 `main_with_addons()` 注入：

```rust
builder::main_with_addons(vec![
    Box::new(CommerceAddon::default()),
    Box::new(CcAddon::default()),
]);
```

商业功能在核心里以 `#[cfg(feature = "commerce")]` 门控，例如 SSO broker、集群 AMI 命令、许可证摘要等。

## 白标与品牌化

商业插件可以提供 `BrandingProvider`，实现站点名、Logo、主色、自定义 CSS、登录页背景与邮件发件人的品牌化（OEM），控制台按请求 Host 解析品牌，支持多租户各自的品牌。详见 [编写插件](/addons/development)。

## 下一步

- 了解插件 trait 与注册机制：[插件体系](/addons/overview)
- 动手写一个插件：[编写插件](/addons/development)
