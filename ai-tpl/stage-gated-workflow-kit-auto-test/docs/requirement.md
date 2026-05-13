# Todo React Native App - 需求文档

## 1. 项目概述

### 1.1 项目名称
**todo-rn-java** - React Native Todo 移动应用

### 1.2 项目类型
跨平台移动应用（iOS/Android）

### 1.3 核心功能概述
一款支持任务创建、编辑、删除、完成的 Todo 应用，任务数据通过 RESTful API 同步到 Java 后台服务进行持久化存储。

### 1.4 目标用户
- 需要移动端任务管理工具的个人用户
- 需要跨设备同步任务的用户

### 1.5 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 移动端 | React Native 0.76+ | 默认技术栈，支持 iOS/Android 双端 |
| 后端 | Java 17 + Spring Boot 3.x | RESTful API 服务 |
| 数据库 | SQLite (开发) / PostgreSQL (生产) | JPA/Hibernate ORM |
| 状态管理 | React Context + useReducer | 轻量级状态管理 |
| HTTP 客户端 | Fetch API | 与后端通信 |
| 测试 | Jest + Detox | 单元测试与 E2E 测试 |

---

## 2. 功能需求

### 2.1 核心功能列表

#### 2.1.1 任务列表
- 用户打开应用后显示所有任务列表
- 列表按创建时间倒序排列（最新在上）
- 每个任务项显示：任务标题、完成状态、创建时间
- 支持下拉刷新获取最新数据

#### 2.1.2 创建任务
- 用户点击右上角"+"按钮
- 弹出输入框，用户输入任务标题
- 点击"保存"后将任务同步到后台
- 输入框关闭，列表刷新显示新任务

#### 2.1.3 编辑任务
- 用户点击任务项进入编辑模式
- 可修改任务标题
- 点击"保存"同步到后台

#### 2.1.4 删除任务
- 用户长按任务项，显示删除确认
- 确认后从后台删除任务
- 列表刷新

#### 2.1.5 完成任务
- 用户点击任务左侧复选框
- 切换任务的完成/未完成状态
- 状态变更同步到后台
- 已完成任务显示删除线效果

### 2.2 数据模型

#### 2.2.1 Todo 任务

```json
{
  "id": "long",           // 任务唯一标识，后台生成
  "title": "string",     // 任务标题，最大 200 字符
  "completed": "boolean", // 完成状态，默认 false
  "createdAt": "datetime", // 创建时间，ISO 8601 格式
  "updatedAt": "datetime"  // 更新时间，ISO 8601 格式
}
```

### 2.3 API 设计

#### 2.3.1 获取所有任务
```
GET /api/todos
Response: { "code": 200, "data": [Todo] }
```

#### 2.3.2 创建任务
```
POST /api/todos
Body: { "title": "string" }
Response: { "code": 201, "data": Todo }
```

#### 2.3.3 更新任务
```
PUT /api/todos/{id}
Body: { "title": "string", "completed": boolean }
Response: { "code": 200, "data": Todo }
```

#### 2.3.4 删除任务
```
DELETE /api/todos/{id}
Response: { "code": 204 }
```

### 2.4 用户界面

#### 2.4.1 主页面 (TodoListScreen)
- 顶部：标题栏 "我的待办"
- 右上角：新建按钮 (+)
- 中间：任务列表（FlatList）
- 空状态：无任务时显示"暂无待办事项"

#### 2.4.2 任务项组件 (TodoItem)
- 左侧：复选框
- 中间：任务标题（完成时删除线）
- 右侧：删除按钮（垃圾桶图标）

#### 2.4.3 新建/编辑弹窗 (TodoModal)
- 标题输入框
- 取消按钮
- 保存按钮

---

## 3. 非功能需求

### 3.1 性能需求
- 应用启动时间 < 3秒
- API 请求超时时间 10秒
- 列表滑动流畅 60fps

### 3.2 离线支持
- 断网时显示提示信息
- 联网后自动同步数据

### 3.3 错误处理
- API 请求失败时显示错误提示
- 用户操作失败时提供重试选项

---

## 4. 项目结构

```
todo-rn-java/
├── src/
│   ├── app/
│   │   ├── android/          # Android 原生模块（React Native 集成）
│   │   └── ios/              # iOS 原生模块（React Native 集成）
│   ├── web/                  # Web 相关（预留）
│   ├── backend/              # Java Spring Boot 后端
│   │   ├── src/main/java/com/todo/
│   │   │   ├── TodoApplication.java
│   │   │   ├── controller/TodoController.java
│   │   │   ├── model/Todo.java
│   │   │   ├── repository/TodoRepository.java
│   │   │   └── service/TodoService.java
│   │   ├── src/main/resources/
│   │   │   └── application.properties
│   │   └── pom.xml
│   └── mobile/               # React Native 移动端
│       ├── src/
│       │   ├── screens/
│       │   │   └── TodoListScreen.js
│       │   ├── components/
│       │   │   ├── TodoItem.js
│       │   │   └── TodoModal.js
│       │   ├── context/
│       │   │   └── TodoContext.js
│       │   ├── api/
│       │   │   └── todoApi.js
│       │   └── App.js
│       ├── package.json
│       └── ios/
│       └── android/
├── tests/                    # 测试目录
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                     # 文档
│   ├── requirement.md         # 本文档
│   ├── prototype.md          # 原型文档（下一阶段）
│   ├── test-report.md        # 测试报告
│   └── code-review.md        # 代码审核
└── .workflow/
    └── state.json            # 工作流状态
```

---

## 5. 阶段计划

| 阶段 | 产物 | 说明 |
|------|------|------|
| 需求分析 | docs/requirement.md | 本文档 |
| 原型设计 | docs/prototype.md + prototype/index.html | 可交互原型 |
| 开发测试 | src/app/, src/backend/, tests/, docs/test-report.md, docs/code-review.md | 完整可运行项目 |
| 交付 | docs/delivery.md | 项目交付文档 |

---

## 6. 决策记录

### 6.1 技术选型决策
- **为什么选择 React Native？**
  - 统一代码库支持 iOS/Android 双端
  - 可接入 Detox 做 E2E 自动化测试
  - 生态成熟，社区活跃

- **为什么选择 Java Spring Boot？**
    - 用户明确要求 Java 后端
    - Spring Boot 成熟稳定，社区文档丰富
    - 易于快速构建 RESTful API

### 6.2 架构决策
- 前后端分离架构，通过 RESTful API 通信
- 移动端使用 React Context 进行状态管理（轻量级，适合 Todo 场景）
- 后端使用 JPA/Hibernate 实现数据库操作，屏蔽 SQL 细节
