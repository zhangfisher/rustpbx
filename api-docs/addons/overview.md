# 插件体系

RustPBX 采用「**小核心 + 可选插件（Addon）**」架构：核心只做 SIP 信令与媒体，其余能力（证书、归档、转写、队列、可观测性、商业功能）都是插件。

## 四大组件

| 组件 | 位置 | 职责 |
|---|---|---|
| **Addon trait** | `src/addons/mod.rs` | 插件生命周期与扩展点契约 |
| **AddonRegistry** | `src/addons/registry.rs` | 注册、初始化、路由/页面/侧栏合并、启用判定 |
| **Feature flag** | `Cargo.toml [features]` | 编译期裁剪 |
| **AppBuilder** | `src/builder/mod.rs` | 组装发行版（`main_with_addons`） |

## Addon trait 扩展点

一个插件可以贡献：

| 扩展点 | 说明 |
|---|---|
| `initialize` | 启动初始化（后台任务、定时器） |
| `migrations` | 独立数据库迁移（每个插件自己的表，互不影响） |
| `router` | HTTP 路由（挂 `/api` 前缀） |
| `console_page_routes` | 控制台页面路由 |
| `sidebar_items` | 控制台侧栏项 |
| `template_dir` / `locales_dir` | 模板与翻译目录 |
| `call_record_hook` | CDR 落库前/后钩子（上传、计费、webhook） |
| `metrics_endpoint_info` | 指标端点信息 |
| `export_reload_handler` | 配置导出与热重载 |
| `branding` | 白标品牌化（商业版） |

## 注册与启用

**编译期**（feature 控制）：

```toml
[features]
addon-acme = ["console", "instant-acme"]
default = ["console", "addon-acme", "addon-transcript", "addon-archive", "addon-observability"]
```

**启动期**（内置插件在 `AddonRegistry` 按固定顺序注册；商业插件由发行版入口传入）：

```rust
// src/bin/rustpbx.rs —— 社区版入口
fn main() { builder::main_with_addons(vec![]); }

// 商业发行版入口
fn main() {
    builder::main_with_addons(vec![
        Box::new(CommerceAddon::default()),
        Box::new(CcAddon::default()),
    ]);
}
```

**运行期**（配置启用）：

```toml
[proxy]
addons = ["acme", "archive", "transcript", "queue"]
```

启用判定：出现在 `addons` 列表 **且**（非商业插件，或许可证有效 / 未开启 `enforce`）。控制台「插件」页可查看与验证许可证。

## 内置插件

| 插件 | Feature | 贡献 |
|---|---|---|
| `queue` | 无（始终编译） | 队列引擎 + `/queues` 控制台页 + API |
| `acme` | `addon-acme` | Let's Encrypt + `/acme` 页 |
| `archive` | `addon-archive` | CDR 归档 |
| `transcript` | `addon-transcript` | 录音转写 + `/transcript` 页 + CDR 详情页脚本注入 |
| `observability` | `addon-observability` | `/metrics` + `/healthz` |

## 关键实现细节

- **每个插件独立迁移表**：插拔互不影响，卸载插件不破坏其他数据；
- **模板搜索顺序**：运行目录 `templates/` → 源码树 `templates/` → 插件模板目录；
- **API 路由合并**：插件实现 `console_api_always_mounted` 可绕过启用检查常驻挂载（如队列）；
- **脚本注入**：插件可对匹配的控制台页面注入 JS（如转写插件在 CDR 详情页注入转写面板）；
- **事件通道**：`src/addons/events.rs` 提供插件事件总线。

## 完整示例

仓库 `examples/external-demo-addon/` 是一个可运行的外部插件 crate，展示 trait 实现、注册与构建的完整流程。架构总览见 `src/addons/README.md`。

下一步：[编写插件](/addons/development)
