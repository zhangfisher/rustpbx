# 用户 / 角色 / 部门

控制台账号体系与 RBAC 权限管理。

- 权限：部门需 `departments:read` / `departments:write`；用户与角色需 `users:manage`
- 前缀：`{api_prefix}`（默认 `/api`）

## 部门

```http
POST   {api_prefix}/settings/departments        # 查询（ListQuery）
PUT    {api_prefix}/settings/departments        # 创建
GET    {api_prefix}/settings/departments/{id}   # 详情
PATCH  {api_prefix}/settings/departments/{id}   # 修改
DELETE {api_prefix}/settings/departments/{id}   # 删除
```

**部门对象**（`DepartmentPayload`）

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `name` | string | 是 | 部门名（唯一） |
| `display_label` | string | 否 | 显示名 |
| `slug` | string | 否 | 短标识 |
| `description` | string | 否 | 描述 |
| `color` | string | 否 | 展示颜色 |
| `manager_contact` | string | 否 | 负责人联系方式 |
| `metadata` | object | 否 | 附加元数据 |

**查询过滤**：`filters: { "q": "关键字" }`

## 用户

```http
POST   {api_prefix}/settings/users        # 查询（ListQuery）
PUT    {api_prefix}/settings/users        # 创建
GET    {api_prefix}/settings/users/{id}   # 详情
PATCH  {api_prefix}/settings/users/{id}   # 修改
DELETE {api_prefix}/settings/users/{id}   # 删除
```

**用户对象**（`UserPayload`）

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `email` | string | 是 | 邮箱 |
| `username` | string | 是 | 用户名 |
| `password` | string | 创建时建议 | 初始口令 |
| `is_active` | bool | 否 | 启用账号 |
| `is_staff` | bool | 否 | 工作人员标记 |
| `is_superuser` | bool | 否 | 超级管理员（慎用） |

**查询过滤**：`filters: { "q": "关键字", "active": true }`

### 角色分配

```http
GET {api_prefix}/settings/users/{id}/roles                   # 当前角色
POST {api_prefix}/settings/users/{id}/roles                  # 分配角色
POST {api_prefix}/settings/users/{id}/mfa/reset              # 重置 MFA
```

**分配角色请求体**

```json
{ "role_ids": [1, 3] }
```

## 角色

```http
GET    {api_prefix}/settings/roles        # 列表
POST   {api_prefix}/settings/roles        # 创建
GET    {api_prefix}/settings/roles/{id}   # 详情
PATCH  {api_prefix}/settings/roles/{id}   # 修改
DELETE {api_prefix}/settings/roles/{id}   # 删除
```

**角色对象**（`RolePayload`）

```json
{
  "name": "cdr-auditor",
  "description": "通话记录审计员",
  "permissions": [
    { "resource": "cdr", "action": "read" },
    { "resource": "recording", "action": "read" }
  ]
}
```

`permissions` 为 `{ resource, action }` 数组，拼合后即 `resource:action` 权限点
（如 `cdr:read`），与 [认证与权限](/apiguide/authentication) 中的权限点一致。

## 错误响应

| 状态码 | 场景 |
| :--- | :--- |
| `401` / `403` | 未认证或缺少 `departments:*` / `users:manage` |
| `404` | 资源不存在 |
| `409` / `400` | 唯一性冲突、字段校验失败 |
| `500` | 数据库错误（`{"message":"…"}`） |

::: tip 控制台页面也走这些接口
控制台的"设置 → 用户 / 角色 / 部门"页面与本页接口共用同一套处理函数，
集成方可获得与 UI 完全一致的行为。
:::
