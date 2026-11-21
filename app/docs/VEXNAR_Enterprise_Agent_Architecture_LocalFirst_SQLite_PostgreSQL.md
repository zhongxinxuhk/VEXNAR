# VEXNAR 企业级渗透测试 Agent：源码级二次开发与迁移实施蓝图

> 版本：1.0\
> 架构状态：已锁定\
> 项目：VEXNAR\
> 主仓库：https://github.com/zhongxinxuhk/VEXNAR\
> 参考项目：ZCode、DeepSeek Harness（DSH）\
> 文档用途：Codex / Claude Code 源码级实施依据

------------------------------------------------------------------------

## 0. 架构决策基线

  --------------------------------------------------------------------------
  维度                                已锁定方案
  ----------------------------------- --------------------------------------
  架构路线                            C：ZCode + DSH 混合架构

  Runtime                             Hybrid Runtime

  开发语言                            TypeScript 全栈

  桌面框架                            Electron

  前端                                React + TypeScript

  包管理                              pnpm Workspace

  Multi-Agent                         中心调度 + 分布式 Worker

  部署                                Local-first

  本地数据库                          SQLite，作为默认、开箱即用的主数据库

  外接数据库                          PostgreSQL，作为可选的外部数据库后端

  缓存与协调                          Redis 可选；本地单机模式允许无 Redis
                                      运行

  向量检索                            本地 SQLite
                                      向量扩展/独立向量适配器，外接
                                      PostgreSQL 时可使用 pgvector

  模型                                Dynamic Multi-Provider

  执行环境                            独立 Worker + Sandbox

  UI                                  允许整体替换

  主仓库                              VEXNAR
  --------------------------------------------------------------------------

### 0.1 数据库决策的准确含义

VEXNAR 采用 **Local-first Database Architecture**：

1.  默认安装后即可使用本地 SQLite，不要求用户先安装 PostgreSQL、Redis
    或其他数据库服务。
2.  本地 SQLite
    是单机桌面部署的默认持久化数据库，保存项目、会话、Agent、任务、事件、记忆索引、工具执行记录、审批和安全资产数据。
3.  同时提供 PostgreSQL Adapter，允许用户将数据库切换到外接 PostgreSQL。
4.  SQLite 与 PostgreSQL 共享同一套领域模型、Repository 接口、Migration
    版本和数据语义；不得在业务层写两套互不兼容的逻辑。
5.  数据库选择属于部署配置，不能在应用运行中无保护地热切换。切换必须经过备份、迁移、校验和显式确认。
6.  Redis 不是数据库必选项。单机模式优先使用 SQLite 持久化任务队列、事件
    Outbox 和进程内通知；多 Worker / 远程 Worker 场景可启用 Redis
    做实时协调和通知，但 Redis 不作为事实来源。
7.  不将"本地 SQLite"误解为只保存缓存。它是本地部署的权威持久化数据库。
8.  不将"外接 PostgreSQL"误解为 SQLite 的只读镜像。启用 PostgreSQL
    后，PostgreSQL 是该 Runtime 实例的权威数据库。

### 0.2 迁移原则

当前 VEXNAR README 和代码可能存在 PostgreSQL、SQLite
使用情况不完全一致的问题。实施前必须检查真实代码、数据库初始化和数据访问路径，确认当前数据源与
Schema。不能根据 README 或启动注释推断所有数据都位于某一种数据库。

本次迁移是 Go → TypeScript 的核心架构迁移，不是简单 UI 改造。旧 Go
后端必须作为行为基线保留，直到 TypeScript Runtime 通过兼容性和回归测试。

------------------------------------------------------------------------

## 1. 项目目标与上游分工

### 1.1 最终产品目标

VEXNAR 应成为拥有独立 Agent Runtime、Scheduler、Security Engine、Plugin
SDK 和 Desktop Workspace 的完整本地优先安全 Agent 平台，而不是 ZCode 与
DSH 的简单拼接。

### 1.2 上游职责

  -----------------------------------------------------------------------------------------------------------
  项目                    参考范围                                                    使用原则
  ----------------------- ----------------------------------------------------------- -----------------------
  ZCode                   Electron、桌面生命周期、Chat、Project、Workspace、UI、RPC   选择性移植与适配

  DSH                     Agent Loop、Session Event、Subagent、Team、Workflow、Plugin 参考架构并建立 VEXNAR
                          思想                                                        Adapter

  VEXNAR                  安全领域模型、自主探索、双图、工具执行策略、证据和报告      保留业务所有权
  -----------------------------------------------------------------------------------------------------------

参考仓库：

-   ZCode：https://github.com/zai-org/ZCode
-   DSH：https://github.com/DeepSeek-ai/deepseek-harness
-   VEXNAR：https://github.com/zhongxinxuhk/VEXNAR

上游仓库的目录、API 和版本可能变化。正式移植时必须锁定 Commit
SHA，检查实际源码与许可证，不得仅凭文档中的路径推断实现。

### 1.3 核心原则

1.  只保留一个权威 Agent Runtime。
2.  ZCode Runtime 与 DSH Runtime 不得同时成为执行内核。
3.  DSH 的通用 Agent 协作能力与 VEXNAR 的 Planner / Worker
    自主探索闭环必须融合。
4.  所有跨模块通信通过版本化接口和事件协议。
5.  UI 不直接访问数据库或执行安全工具。
6.  所有工具执行必须通过 Policy Engine。
7.  本地部署不得强制依赖外接 PostgreSQL、Redis 或远程服务。
8.  任务、事件、审批、证据必须可持久化和恢复。

------------------------------------------------------------------------

## 2. 目标仓库结构

``` text
VEXNAR/
├── apps/
│   ├── desktop/
│   │   ├── src/main/
│   │   ├── src/preload/
│   │   └── src/renderer/
│   ├── coordinator/
│   │   └── src/
│   ├── runtime/
│   │   └── src/
│   ├── worker/
│   │   └── src/
│   └── cli/
│       └── src/
├── packages/
│   ├── contracts/
│   ├── config/
│   ├── logger/
│   ├── database/
│   ├── database-sqlite/
│   ├── database-postgres/
│   ├── migration/
│   ├── repository/
│   ├── event-store/
│   ├── event-bus/
│   ├── protocol/
│   ├── agent-kernel/
│   ├── agent-loop/
│   ├── agent-registry/
│   ├── agent-context/
│   ├── agent-memory/
│   ├── orchestration/
│   ├── scheduler/
│   ├── task-graph/
│   ├── model-router/
│   ├── tool-registry/
│   ├── tool-executor/
│   ├── execution-policy/
│   ├── sandbox/
│   ├── plugin-sdk/
│   ├── plugin-runtime/
│   ├── security-core/
│   ├── security-graph/
│   ├── security-evidence/
│   ├── security-workflow/
│   ├── mcp-gateway/
│   ├── observability/
│   ├── shared/
│   └── ui/
├── plugins/
│   ├── agents/
│   ├── tools/
│   ├── skills/
│   ├── integrations/
│   └── workflows/
├── migrations/
│   ├── common/
│   ├── sqlite/
│   └── postgres/
├── legacy/
│   └── go-backend/
├── deploy/
│   ├── compose/
│   ├── docker/
│   └── systemd/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── migration/
│   ├── api/
│   └── development/
├── scripts/
├── tests/
├── AGENTS.md
├── pnpm-workspace.yaml
├── package.json
├── pnpm-lock.yaml
├── tsconfig.base.json
├── vitest.config.ts
└── biome.json
```

### 2.1 Package 职责

  Package               职责
  --------------------- -----------------------------------------
  `database`            数据库抽象、连接管理、健康检查
  `database-sqlite`     SQLite Driver、SQLite 特性和连接配置
  `database-postgres`   PostgreSQL Driver、连接池和 pgvector
  `migration`           迁移版本管理、校验和执行
  `repository`          领域 Repository 接口及实现装配
  `event-store`         持久化事件、回放、检查点
  `scheduler`           中心调度、租约、重试、恢复
  `agent-kernel`        Agent 生命周期与统一运行接口
  `orchestration`       Planner、Team、Subagent、Workflow
  `security-core`       安全领域模型
  `security-graph`      Asset Graph、Exploration Graph、Anchors
  `execution-policy`    Scope、权限、审批和风险策略
  `tool-executor`       工具执行网关
  `sandbox`             隔离执行环境

------------------------------------------------------------------------

## 3. Package 依赖图

``` mermaid
flowchart TB
    Contracts[contracts / shared]
    Config[config / logger]
    DB[database]
    SQLite[database-sqlite]
    PG[database-postgres]
    Migration[migration]
    Repo[repository]
    Events[event-store / event-bus]
    Protocol[protocol]
    Kernel[agent-kernel / agent-loop]
    Context[agent-context / memory]
    Models[model-router]
    Tools[tool-registry / tool-executor]
    Policy[execution-policy / sandbox]
    Orchestration[orchestration / task-graph]
    Scheduler[scheduler]
    Security[security-core / security-graph / evidence]
    Plugins[plugin-sdk / plugin-runtime]
    Worker[apps/worker]
    Coordinator[apps/coordinator]
    Runtime[apps/runtime]
    Desktop[apps/desktop]

    Contracts --> Config
    Contracts --> DB
    DB --> SQLite
    DB --> PG
    DB --> Migration
    DB --> Repo
    Repo --> Events
    Events --> Kernel
    Kernel --> Context
    Kernel --> Models
    Kernel --> Tools
    Tools --> Policy
    Kernel --> Orchestration
    Orchestration --> Scheduler
    Security --> Tools
    Security --> Orchestration
    Plugins --> Kernel
    Plugins --> Tools
    Worker --> Kernel
    Worker --> Security
    Worker --> Policy
    Coordinator --> Scheduler
    Coordinator --> Events
    Runtime --> Coordinator
    Runtime --> Worker
    Desktop --> Protocol
    Desktop --> Contracts
```

依赖约束：

-   `contracts` 不得依赖任何业务包。
-   `database-sqlite` 和 `database-postgres` 实现同一数据库端口。
-   业务包不得直接导入 SQLite 或 PostgreSQL Driver。
-   `repository` 只依赖数据库抽象，不依赖具体 Driver。
-   `apps/*` 负责装配依赖，底层 Package 不得反向依赖应用。
-   UI 不得直接调用数据库。
-   Worker 不得自行创建全局 Scheduler。
-   Agent 不得绕过 Policy Engine 执行工具。
-   插件通过 SDK 暴露能力，不得直接访问其他插件内部实现。

------------------------------------------------------------------------

## 4. 数据库架构：SQLite Local-first + PostgreSQL Optional

### 4.1 逻辑架构

``` mermaid
flowchart TB
    Desktop[Electron Desktop]
    Runtime[Runtime / Coordinator]
    Repository[Domain Repository Interfaces]
    DBFactory[Database Factory]
    SQLite[(Local SQLite)]
    PostgreSQL[(External PostgreSQL)]
    Redis[(Optional Redis)]
    Worker[Local / Remote Workers]

    Desktop --> Runtime
    Runtime --> Repository
    Repository --> DBFactory
    DBFactory -->|default| SQLite
    DBFactory -->|configured| PostgreSQL
    Runtime -. optional coordination .-> Redis
    Runtime --> Worker
    Worker --> Repository
```

应用只面向统一 Repository 和 Unit-of-Work 接口。数据库 Provider 在
Runtime 启动时根据配置装配。

### 4.2 数据库模式

#### 模式 A：Local SQLite（默认）

适用：

-   单机桌面用户。
-   开箱即用安装。
-   离线或弱网络环境。
-   本地单用户项目。
-   本地 Agent 和本地 Worker。

特点：

-   无需安装数据库服务。
-   数据保存在用户数据目录。
-   SQLite WAL 模式。
-   外键约束开启。
-   合理设置 busy_timeout。
-   使用单写者/受控写入队列，避免高并发写冲突。
-   Worker 可以并发执行，但写入必须经过 Repository 事务边界。
-   不依赖 Redis。
-   事件、任务、租约、审批、证据都保存在 SQLite。

推荐目录：

``` text
<userData>/
└── VEXNAR/
    ├── data/
    │   ├── vexnar.db
    │   ├── vexnar.db-wal
    │   └── vexnar.db-shm
    ├── backups/
    ├── artifacts/
    ├── logs/
    ├── cache/
    ├── plugins/
    └── config/
        └── runtime.json
```

数据库文件不得放在应用安装目录、只读目录或临时目录。Electron 必须使用
`app.getPath("userData")` 确定数据目录。

#### 模式 B：External PostgreSQL（可选）

适用：

-   多用户共享数据。
-   多台设备接入同一数据源。
-   大规模任务与事件记录。
-   远程 Worker。
-   企业统一备份和数据库运维。
-   需要 pgvector 的部署。

特点：

-   PostgreSQL 是权威持久化数据库。
-   通过连接池管理连接。
-   使用 TLS/证书验证（按部署环境配置）。
-   支持连接健康检查和断线重连。
-   支持 pgvector 扩展（可选）。
-   Redis 可选启用，用于多 Worker 实时协调。
-   数据库凭证不得明文写入仓库或日志。

#### 模式 C：Local SQLite + 外接服务

SQLite 仍是默认持久化数据库，外接模型 API、MCP Server、远程 Worker
或其他服务不改变本地数据库事实来源。

注意：不要同时让 SQLite 和 PostgreSQL
对同一业务实体进行双主写入。若用户选择 PostgreSQL，必须明确切换为
PostgreSQL
权威模式；若需要跨库同步，必须单独设计单向复制、冲突处理和一致性协议。

### 4.3 数据库配置

建议配置文件：

``` json
{
  "database": {
    "provider": "sqlite",
    "sqlite": {
      "path": "${VEXNAR_DATA_DIR}/data/vexnar.db",
      "journalMode": "WAL",
      "foreignKeys": true,
      "busyTimeoutMs": 5000
    },
    "postgres": {
      "connectionString": "",
      "pool": {
        "min": 1,
        "max": 10,
        "idleTimeoutMs": 30000,
        "connectionTimeoutMs": 10000
      },
      "ssl": {
        "enabled": false,
        "rejectUnauthorized": true
      }
    }
  },
  "redis": {
    "enabled": false,
    "url": ""
  }
}
```

配置要求：

-   默认 `provider=sqlite`。
-   PostgreSQL 未配置时不得阻止应用启动。
-   `connectionString`
    必须从系统密钥存储或安全环境变量读取，配置文件只保留引用。
-   日志不得打印完整连接串、密码、Token 或证书私钥。
-   数据库 Provider 只能在 Runtime 启动阶段确定。
-   数据库切换必须通过设置页面或 CLI 的显式迁移命令完成。

### 4.4 数据库抽象接口

``` typescript
export type DatabaseProvider = "sqlite" | "postgres";

export interface DatabaseHealth {
  provider: DatabaseProvider;
  connected: boolean;
  version: string;
  latencyMs?: number;
  lastError?: string;
}

export interface TransactionContext {
  // Driver-specific transaction handle remains private
}

export interface DatabaseAdapter {
  readonly provider: DatabaseProvider;

  connect(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<DatabaseHealth>;

  transaction<T>(
    callback: (tx: TransactionContext) => Promise<T>
  ): Promise<T>;
}

export interface DatabaseFactory {
  create(config: DatabaseConfig): Promise<DatabaseAdapter>;
}
```

Repository 接口示例：

``` typescript
export interface TaskRepository {
  create(input: CreateTaskInput): Promise<Task>;
  getById(id: string): Promise<Task | null>;
  claimNext(input: ClaimTaskInput): Promise<TaskLease | null>;
  renewLease(input: RenewLeaseInput): Promise<void>;
  complete(input: CompleteTaskInput): Promise<void>;
  fail(input: FailTaskInput): Promise<void>;
}

export interface EventRepository {
  append(event: DomainEvent): Promise<void>;
  readAfter(input: ReadEventsInput): Promise<DomainEvent[]>;
  getCheckpoint(consumerId: string): Promise<number>;
  saveCheckpoint(consumerId: string, sequence: number): Promise<void>;
}
```

注意：SQLite 和 PostgreSQL
对并发领取、锁、JSON、时间、UUID、索引和向量查询的实现不同。统一的是领域接口和语义，不是强行要求两种数据库使用完全相同的
SQL。

### 4.5 SQLite 与 PostgreSQL 兼容要求

  -----------------------------------------------------------------------------
  能力                    SQLite                     PostgreSQL
  ----------------------- -------------------------- --------------------------
  主键                    TEXT UUID                  UUID

  时间                    UTC ISO-8601 TEXT          TIMESTAMPTZ
                          或整数时间戳，统一规范     

  JSON                    TEXT + JSON 函数           JSONB

  外键                    PRAGMA 开启                原生约束

  事务                    SQLite Transaction         PostgreSQL Transaction

  并发任务领取            原子更新/短事务/写入队列   `FOR UPDATE SKIP LOCKED`
                                                     等

  事件序列                应用生成或事务序列表       Sequence/事务序列表

  全文检索                FTS5（可选）               tsvector（可选）

  向量检索                独立 Vector Adapter 或     pgvector（可选）
                          SQLite 扩展                

  JSON 索引               表达式索引                 GIN

  多 Worker               本地进程受控并发           多实例并发
  -----------------------------------------------------------------------------

跨数据库兼容规则：

1.  领域主键统一使用 UUID 字符串表达。
2.  所有时间统一 UTC。
3.  不依赖 SQLite ROWID 作为领域标识。
4.  避免在业务代码中使用数据库专属 JSON 运算符。
5.  复杂查询封装到 Repository，不允许 UI 或 Agent 直接写 SQL。
6.  对 SQLite 和 PostgreSQL 分别实现并运行 Integration Tests。
7.  同一 Migration 版本必须具有 SQLite 与 PostgreSQL 对应实现。
8.  数据库专属优化作为 Provider 内部实现，不改变业务语义。
9.  不假设两种数据库的事务隔离、锁行为和并发能力完全相同。

### 4.6 SQLite 写入并发设计

SQLite 适合本地优先应用，但它是单写者模型。VEXNAR 的多 Agent
并发执行不能直接转化为大量 Worker 同时持有长事务写入数据库。

必须实施：

-   任务执行与数据库事务分离。
-   禁止在模型调用或工具执行期间保持数据库事务。
-   写事务保持短小。
-   对 SQLITE_BUSY 设置有界重试和退避。
-   对高频事件采用批量写入，但保证关键事件及时持久化。
-   本地 Scheduler 通过数据库原子状态转换领取任务。
-   使用 WAL 和合理 checkpoint 策略。
-   监控写入等待时间、锁冲突和 WAL 文件大小。
-   任务结果提交使用幂等键。
-   不允许以 Redis 代替 SQLite 的持久化任务状态。

如果本地并发写入成为瓶颈，应先优化事务和写入队列，再评估切换
PostgreSQL。

### 4.7 Redis 使用边界

Redis 为可选组件：

SQLite 单机模式： - 进程内 Event Dispatcher。 - SQLite Outbox。 - SQLite
Task Queue / Lease。 - 不要求 Redis。

PostgreSQL 多 Worker 模式： - Redis Pub/Sub 或 Streams 用于实时通知。 -
Redis 用于短期缓存、限流和协调。 - PostgreSQL 保存权威任务状态和事件。 -
Redis 故障时应能从 PostgreSQL Outbox 恢复通知。

不得只将任务写入 Redis 后就认为任务已持久化。

------------------------------------------------------------------------

## 5. Agent Runtime 与核心接口

### 5.1 Agent Definition

``` typescript
export type AgentRole =
  | "orchestrator"
  | "planner"
  | "worker"
  | "recon"
  | "scanner"
  | "analyst"
  | "validator"
  | "reporter";

export interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  role: AgentRole;
  capabilities: string[];
  modelPolicy: ModelPolicy;
  toolPolicy: ToolPolicy;
  maxConcurrentTasks: number;
}

export interface AgentInstance {
  id: string;
  definitionId: string;
  projectId: string;
  sessionId: string;
  parentAgentId?: string;
  workerId?: string;
  status: AgentStatus;
  createdAt: string;
}

export interface AgentRuntime {
  create(input: CreateAgentInput): Promise<AgentInstance>;
  start(agentId: string): Promise<void>;
  interrupt(agentId: string): Promise<void>;
  resume(agentId: string): Promise<void>;
  terminate(agentId: string): Promise<void>;
  get(agentId: string): Promise<AgentInstance>;
}
```

Agent Lifecycle 与 Task Lifecycle 必须分离。Agent 可以长期
READY，任务可以独立排队、运行、阻塞或终止。

### 5.2 Task Scheduler

``` typescript
export interface TaskDefinition {
  id: string;
  projectId: string;
  sessionId: string;
  parentTaskId?: string;
  agentId?: string;
  type: string;
  priority: number;
  dependencies: string[];
  payload: Record<string, unknown>;
  timeoutMs: number;
  maxAttempts: number;
}

export interface TaskLease {
  taskId: string;
  workerId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  attempt: number;
}

export interface Scheduler {
  submit(task: TaskDefinition): Promise<string>;
  claim(input: {
    workerId: string;
    capabilities: string[];
    leaseDurationMs: number;
  }): Promise<TaskLease | null>;
  heartbeat(lease: TaskLease): Promise<void>;
  complete(lease: TaskLease, result: TaskResult): Promise<void>;
  fail(lease: TaskLease, error: TaskError): Promise<void>;
  cancel(taskId: string): Promise<void>;
}
```

租约要求：

-   任务领取必须原子化。
-   结果提交必须验证 Lease Token。
-   过期租约不得提交成功。
-   Worker 崩溃后任务可以回收。
-   外部副作用必须使用幂等键。
-   租约过期不代表工具调用未发生，必须核验执行状态。
-   重试策略按任务类型和副作用等级配置。

### 5.3 Worker Contract

``` typescript
export interface WorkerRegistration {
  workerId: string;
  runtimeVersion: string;
  capabilities: string[];
  resourceCapacity: {
    maxTasks: number;
    cpuSlots: number;
    memoryMb: number;
  };
}

export interface WorkerRuntime {
  register(input: WorkerRegistration): Promise<void>;
  run(lease: TaskLease): Promise<void>;
  heartbeat(): Promise<void>;
  drain(): Promise<void>;
  shutdown(): Promise<void>;
}
```

Worker 可以是本地子进程，也可以是经过认证的远程进程。远程 Worker
不得直接访问桌面 IPC 或本地用户密钥。

### 5.4 Domain Event

``` typescript
export interface DomainEvent<T = unknown> {
  id: string;
  eventType: string;
  schemaVersion: number;
  projectId: string;
  sessionId?: string;
  aggregateType: string;
  aggregateId: string;
  sequence: number;
  correlationId: string;
  causationId?: string;
  producerId: string;
  occurredAt: string;
  payload: T;
}
```

使用 Transactional
Outbox。事件持久化与业务状态更新必须处于同一数据库事务。消费者必须支持重复投递检测、重试、死信和检查点。

------------------------------------------------------------------------

## 6. Hybrid Runtime 进程架构

``` mermaid
flowchart TB
    UI[Electron Renderer]
    Main[Electron Main / Preload]
    Coordinator[Coordinator]
    SQLite[(SQLite - default)]
    PG[(External PostgreSQL - optional)]
    Redis[(Redis - optional)]
    W1[Local Worker 01]
    W2[Local Worker 02]
    W3[Local Worker 03]
    Remote[Remote Worker - optional]
    Sandbox[Sandbox / Tool Executor]

    UI --> Main
    Main -->|typed IPC| Coordinator
    Coordinator -->|Database Adapter| SQLite
    Coordinator -. configured provider .-> PG
    Coordinator -. optional .-> Redis
    Coordinator --> W1
    Coordinator --> W2
    Coordinator --> W3
    Coordinator -. authenticated RPC .-> Remote
    W1 --> Sandbox
    W2 --> Sandbox
    W3 --> Sandbox
    Remote --> Sandbox
```

### 6.1 进程职责

  进程            职责
  --------------- -------------------------------------------
  Electron Main   窗口、系统集成、IPC、安全边界
  Coordinator     API、Scheduler、Worker Registry、事件管理
  Runtime         依赖装配、启动、生命周期管理
  Worker          任务执行、Agent Loop、工具调用
  SQLite          默认本地权威数据存储
  PostgreSQL      可选外接权威数据存储
  Redis           可选缓存、通知和多 Worker 协调
  Sandbox         受控工具执行

### 6.2 退出与后台策略

Electron 关闭窗口不应无条件终止任务。提供明确策略：

-   `stop_on_app_exit`：关闭应用时优雅停止 Worker。
-   `continue_in_background`：关闭窗口后 Coordinator 继续运行。
-   `ask_on_running_tasks`：存在任务时询问用户。

所有退出都必须先停止领取新任务，再处理运行中任务，最后关闭数据库连接。不能强制终止
SQLite 写事务。

------------------------------------------------------------------------

## 7. 数据库 Schema 设计

### 7.1 公共领域表

以下为逻辑表清单。实际字段应在审计现有 Schema
后确定，禁止未经核实直接重建或删除旧表。

  表                       作用
  ------------------------ ----------------
  `projects`               项目
  `sessions`               会话
  `agents`                 Agent 定义
  `agent_instances`        Agent 运行实例
  `agent_teams`            Agent 团队
  `agent_team_members`     团队成员
  `agent_tasks`            任务
  `task_dependencies`      DAG 依赖
  `task_runs`              任务执行历史
  `workers`                Worker 注册
  `worker_leases`          Worker 租约
  `runtime_events`         持久化事件
  `outbox_events`          事务 Outbox
  `consumer_checkpoints`   消费检查点
  `agent_contexts`         当前上下文
  `context_snapshots`      上下文快照
  `context_items`          上下文条目
  `agent_memories`         长期记忆
  `memory_embeddings`      向量索引
  `tool_definitions`       工具定义
  `tool_executions`        工具执行
  `execution_attempts`     执行尝试
  `execution_approvals`    审批
  `execution_artifacts`    执行产物
  `execution_audit_logs`   审计
  `scope_policies`         目标范围策略
  `policy_decisions`       策略决策
  `security_assets`        资产
  `security_findings`      漏洞发现
  `security_evidence`      证据

### 7.2 SQLite / PostgreSQL DDL 规范

公共 Schema 应尽量使用两种数据库共同支持的基础类型和语义：

-   UUID 以规范字符串形式作为应用层 ID。
-   时间统一 UTC；SQLite 使用规范 ISO-8601 TEXT，PostgreSQL 使用
    TIMESTAMPTZ。
-   JSON 在 SQLite 使用 TEXT，在 PostgreSQL 使用 JSONB，由 Repository
    负责序列化。
-   大型原始输出、PCAP、附件和报告文件不直接塞入数据库，使用 Artifact
    Store，数据库保存元数据、哈希和位置。
-   外键和唯一约束必须在两个 Provider 中等价实现。
-   重要状态字段使用明确枚举值和迁移策略。
-   所有项目数据必须具有 project_id 或可追溯的项目归属。
-   多租户或多项目查询必须在 Repository 层强制隔离。

### 7.3 Migration 目录

``` text
migrations/
├── manifest.json
├── common/
│   ├── 0001_runtime_foundation/
│   ├── 0002_agent_sessions/
│   ├── 0003_multi_agent_tasks/
│   ├── 0004_event_store/
│   ├── 0005_context_memory/
│   ├── 0006_execution_policy/
│   ├── 0007_security_graph/
│   └── 0008_legacy_compatibility/
├── sqlite/
│   └── ...
└── postgres/
    └── ...
```

每个版本应有 SQLite 和 PostgreSQL 对应实现。`common`
目录保存版本说明、数据语义和跨 Provider
校验，不强迫两个数据库执行完全相同的 SQL。

### 7.4 迁移管理表

`schema_migrations` 至少记录：

-   version
-   description
-   checksum
-   applied_at
-   execution_time_ms
-   provider
-   success

同一数据库 Provider 内 Migration 必须有序执行。Checksum
不匹配时停止并报告，不得静默覆盖。

### 7.5 数据库切换流程

提供 CLI 和 UI 两种入口：

``` bash
vexnar db status
vexnar db backup
vexnar db validate
vexnar db migrate --to postgres
vexnar db verify
vexnar db switch --provider postgres
vexnar db rollback-switch
```

切换流程：

1.  停止接收新任务。
2.  等待可安全结束的任务完成，或将任务保存为可恢复状态。
3.  备份当前 SQLite 数据库（包括一致性处理 WAL）。
4.  创建 PostgreSQL Schema 并运行 Migration。
5.  分批导入数据。
6.  核对表记录数、主外键关系、事件序列、内容哈希和领域统计。
7.  执行 Repository 一致性测试。
8.  用户明确确认切换。
9.  更新 Provider 配置并重启 Runtime。
10. 保留原 SQLite 备份，不自动删除。

回滚切换必须恢复到切换前的一致性快照。切换后若 PostgreSQL
已产生新写入，不能直接把旧 SQLite
文件切回作为无损回滚；必须明确说明数据回迁或恢复点要求。

### 7.6 SQLite → PostgreSQL 数据映射

  逻辑类型   SQLite                       PostgreSQL
  ---------- ---------------------------- -------------------
  ID         TEXT UUID                    UUID 或 TEXT UUID
  时间       TEXT UTC                     TIMESTAMPTZ
  JSON       TEXT                         JSONB
  布尔       INTEGER 0/1                  BOOLEAN
  二进制     BLOB（仅小对象）             BYTEA（仅小对象）
  向量       Adapter/扩展                 pgvector
  自增序列   应用生成 UUID / 事务序列表   UUID / Sequence

数据迁移必须通过领域导出/导入或明确的数据迁移层，不能依赖简单复制 SQLite
文件到 PostgreSQL。

------------------------------------------------------------------------

## 8. VEXNAR 原有能力迁移映射

  现有能力            目标模块                         迁移要求
  ------------------- -------------------------------- -------------------
  Goals               `orchestration/goals`            保留目标分解
  Planner             `orchestration/planner`          保留规划语义
  Worker              `apps/worker`                    独立进程执行
  MainAgent           `agent-kernel/interaction`       保留人工介入
  Todolist            `orchestration/planning-state`   跨轮持久化
  Worker Trace        `agent-context/trace-store`      跨 Worker 查询
  Exploration Graph   `security-graph/exploration`     保留血缘
  Asset Graph         `security-graph/assets`          保留资产真值
  Anchors             `security-graph/anchors`         保留双图连接
  OAST                `security-workflow/oast`         保留 Token 与回调
  MITM Proxy          `security-workflow/traffic`      独立执行服务
  Guard / Intercept   `execution-policy`               保留审批拦截
  MCP                 `mcp-gateway`                    统一协议
  Skills              `plugins/skills`                 兼容原有 Skill
  Norma Memory        `agent-memory`                   迁移检索语义
  Retester            `agents/validator`               独立验证 Agent

必须重点保护：

1.  Planner 负责规划与生成意图，Worker 执行具体意图。
2.  Worker Trace 能被同项目其他 Worker 检索。
3.  Todolist 跨多轮持久化。
4.  Asset Graph 与 Exploration Graph 保持原有关系和数据语义。
5.  审批和执行记录保持可追溯。
6.  漏洞发现与证据分离存储。
7.  迁移期间不能丢失现有用户数据。

------------------------------------------------------------------------

## 9. Tool Execution 与安全边界

``` mermaid
flowchart TB
    Agent[Agent]
    Registry[Tool Registry]
    Policy[Policy Engine]
    Scope[Target Scope Validation]
    Approval[Human Approval]
    Gateway[Execution Gateway]
    Sandbox[Sandbox]
    Evidence[Evidence Store]

    Agent --> Registry
    Registry --> Policy
    Policy --> Scope
    Scope --> Approval
    Approval --> Gateway
    Gateway --> Sandbox
    Sandbox --> Evidence
```

要求：

-   目标资产必须在明确授权范围内。
-   工具级权限和 Agent 级权限分别校验。
-   高风险操作必须审批。
-   审批绑定具体请求摘要、参数和目标范围。
-   容器限制 CPU、内存、进程、文件和网络访问。
-   记录请求、审批、执行、输出和证据。
-   不确定状态不得盲目重试。
-   插件不默认拥有宿主进程权限。
-   开发和测试只使用本地隔离靶场或模拟数据。

------------------------------------------------------------------------

## 10. Plugin System

``` typescript
export interface VexnarPlugin {
  id: string;
  version: string;
  dependencies?: string[];
  permissions: string[];
  setup(context: PluginContext): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  dispose(): Promise<void>;
}
```

插件类别：

  类型           示例                        运行方式
  -------------- --------------------------- ---------------------
  内置核心插件   Session、Model、Scheduler   Runtime 内部
  官方能力插件   Recon、Analysis、Report     受控 Plugin Runtime
  第三方插件     MCP、CLI、API Tool          独立权限域

插件必须具备 Manifest、API
版本、依赖、权限声明、来源校验、签名策略、生命周期和审计日志。

------------------------------------------------------------------------

## 11. Desktop UI 结构

主导航：

-   Chat
-   Projects
-   Sessions
-   Workspace
-   Agents
-   Teams
-   Tasks
-   Tools
-   Findings
-   Evidence
-   Reports
-   Settings

CHAT 模式：

-   自然语言交互
-   Session 管理
-   项目上下文
-   Agent 调用
-   工具调用
-   文件和代码分析

WORK 模式：

-   安全任务规划
-   Multi-Agent 编排
-   实时 Task Graph
-   Agent Monitor
-   Worker Monitor
-   工具执行监控
-   人工审批
-   证据管理
-   漏洞验证
-   报告生成

WORK 必须是完整 Runtime 控制台，不是简单增加一个 Chat Tab。

Electron Main、Preload、Renderer 通过严格类型化 IPC 通信。Renderer
不直接访问数据库、Node.js 文件系统或系统执行能力。

------------------------------------------------------------------------

## 12. API 与实时事件

建议 API：

``` text
POST /api/v1/projects
GET  /api/v1/projects

POST /api/v1/sessions
GET  /api/v1/sessions/:id

POST /api/v1/agents
GET  /api/v1/agents
POST /api/v1/agents/:id/interrupt
POST /api/v1/agents/:id/resume

POST /api/v1/tasks
GET  /api/v1/tasks/:id
POST /api/v1/tasks/:id/cancel

GET  /api/v1/workers
GET  /api/v1/runtime/status

GET  /api/v1/events/stream

GET  /api/v1/security/assets
GET  /api/v1/security/findings
GET  /api/v1/security/evidence

GET  /api/v1/approvals
POST /api/v1/approvals/:id/decision

GET  /api/v1/database/status
POST /api/v1/database/backup
POST /api/v1/database/validate
POST /api/v1/database/migration
```

实时事件必须支持：

-   Event Envelope
-   Schema Version
-   Sequence
-   Correlation ID
-   断线重连
-   事件补拉
-   重复事件检测
-   消费检查点

------------------------------------------------------------------------

## 13. 开发阶段与任务清单

### P0：源码审计

  --------------------------------------------------------------------------------
  ID                      任务                    交付物
  ----------------------- ----------------------- --------------------------------
  P0-01                   扫描 Go 后端            `LEGACY_CODE_MAP.md`

  P0-02                   扫描前端                `FRONTEND_CODE_MAP.md`

  P0-03                   提取 Norma 调用链       `AGENT_BEHAVIOR_SPEC.md`

  P0-04                   提取全部数据库 Schema   `LEGACY_DATABASE_SCHEMA.md`

  P0-05                   核实 SQLite /           `DATABASE_SOURCE_OF_TRUTH.md`
                          PostgreSQL 使用         

  P0-06                   提取 Planner / Worker   `ORCHESTRATION_SPEC.md`
                          状态机                  

  P0-07                   审计 ZCode / DSH        `UPSTREAM_SOURCE_MAP.md`

  P0-08                   许可证审计              `THIRD_PARTY_AUDIT.md`

  P0-09                   制定数据库双 Provider   `DATABASE_PORTABILITY_SPEC.md`
                          兼容方案                
  --------------------------------------------------------------------------------

P0 未完成前，不得删除旧 Go 代码或执行破坏性 Migration。

### P1：Monorepo 与数据库底座

-   pnpm Workspace
-   TypeScript strict
-   Contracts
-   Logger
-   Database Adapter
-   SQLite Provider
-   PostgreSQL Provider
-   Repository
-   Migration Engine
-   Backup / Restore
-   Database Health Check
-   Provider Configuration
-   Event Store
-   Outbox
-   Redis Optional Adapter
-   Runtime Bootstrap

验收：默认 SQLite 无需外部数据库即可启动；配置 PostgreSQL 后可运行同一套
Repository 集成测试。

### P2：Agent Runtime

-   Agent Registry
-   Lifecycle
-   Agent Loop
-   Session
-   Context
-   Memory
-   Model Router
-   Tool Registry
-   Plugin Runtime

验收：Agent 可创建、执行、中断、恢复和终止，状态持久化。

### P3：Coordinator + Scheduler + Worker

-   Coordinator
-   Task Graph
-   Scheduler
-   Worker Registry
-   Lease Manager
-   Worker Executor
-   Retry Manager
-   Recovery Engine
-   Agent Team
-   Parallel Execution
-   Resource Quota

验收：多个 Worker 并发执行、故障恢复、任务不重复领取。

### P4：Security Runtime

-   Goals Adapter
-   Planner Adapter
-   Worker Adapter
-   Todolist Store
-   Trace Store
-   Asset Graph
-   Exploration Graph
-   Anchor Service
-   Evidence Service
-   Retester
-   Approval Engine
-   Tool Sandbox

验收：原有自主探索与安全业务闭环保持。

### P5：Desktop 重构

-   Electron Shell
-   IPC Contracts
-   Chat
-   Sessions
-   Projects
-   Workspace
-   Agent Monitor
-   Team Monitor
-   Task Graph
-   Tool Execution
-   Findings
-   Reports
-   Database Settings
-   Worker Settings

验收：桌面端可以完整控制和观察 Runtime。

### P6：稳定性和发行

-   SQLite 压力测试
-   PostgreSQL 集成测试
-   双 Provider Repository 一致性测试
-   Migration 测试
-   Worker 故障恢复
-   Coordinator 故障恢复
-   权限边界测试
-   Electron E2E
-   macOS / Windows 打包
-   安装升级
-   SBOM
-   许可证审计

------------------------------------------------------------------------

## 14. 强制验收测试

1.  默认配置下不安装 PostgreSQL 和 Redis，VEXNAR 能完整启动。
2.  SQLite 数据库重启后项目、会话、任务、事件和证据完整。
3.  SQLite WAL 模式正常，外键约束开启。
4.  SQLite 写入竞争发生时有界退避，不丢失任务状态。
5.  PostgreSQL Provider 能运行相同领域 Repository 测试。
6.  从 SQLite 导出并导入 PostgreSQL 后，记录数、关系和内容哈希一致。
7.  PostgreSQL 连接失败时不得悄悄回退到 SQLite，避免产生两个权威数据源。
8.  Redis 未启用时本地单机模式正常。
9.  Redis 故障后可从持久化 Outbox 恢复通知。
10. 多 Worker 不能同时获得同一有效租约。
11. Worker 崩溃后任务进入可核验的恢复流程。
12. Coordinator 重启后恢复未完成任务。
13. Planner Todolist 跨轮持久化。
14. Worker Trace 能跨 Worker 检索。
15. Asset Graph 和 Exploration Graph 关系保持。
16. Agent Context 不发生跨项目泄漏。
17. 未授权工具请求在执行前被拦截。
18. 审批不能被其他参数不同的请求复用。
19. Migration 重复执行不产生额外副作用。
20. Electron 退出遵循后台任务生命周期策略。

------------------------------------------------------------------------

## 15. Git 与许可证管理

当前 VEXNAR 使用 AGPL-3.0。实施前必须核对当前仓库 LICENSE
和上游实际许可证文件。

必须：

-   保留 VEXNAR 原有 LICENSE 和版权信息。
-   记录 ZCode Apache-2.0 来源及 NOTICE。
-   记录 DSH MIT 来源。
-   检查字体、图标、模型、示例和第三方依赖的独立许可证。
-   生成第三方依赖许可证清单和 SBOM。
-   记录上游 Commit SHA。
-   记录移植文件来源和修改内容。
-   不擅自改变项目许可证。

建议分支：

``` bash
git checkout -b refactor/typescript-hybrid-runtime
```

每个阶段独立提交，禁止一次性提交全部重构。

------------------------------------------------------------------------

## 16. 交给 Codex / Claude Code 的执行总提示词

你现在是 VEXNAR 项目的首席架构师和主程。请直接在当前仓库执行源码级重构。

目标是建立独立的 TypeScript Hybrid Runtime、中心调度器、分布式
Worker、SQLite Local-first 数据层、可选 PostgreSQL Provider、Security
Engine、Plugin SDK 和 Electron Desktop。

架构参数已经锁定，不得自行改变：

-   TypeScript 全栈
-   Electron + React
-   pnpm Monorepo
-   Hybrid Runtime
-   Central Scheduler + Distributed Workers
-   默认 SQLite
-   可选外接 PostgreSQL
-   Redis 可选
-   Dynamic Multi-Provider
-   Local-first
-   ZCode 作为桌面架构参考
-   DSH 作为 Agent Runtime 和协作机制参考

### 立即执行：只做 P0 源码审计

1.  检查 Git 状态和分支。
2.  扫描完整仓库目录。
3.  阅读全部 Go 后端和 Agent 核心代码。
4.  阅读前端 Chat、Session、Project、Workspace。
5.  提取 Norma SDK 的实际调用链。
6.  提取 Planner、Worker、MainAgent、Todolist 和 Trace 的真实行为。
7.  提取 Asset Graph、Exploration Graph、Anchors 的全部 Schema 和关系。
8.  核实 SQLite、PostgreSQL 的真实使用路径和数据来源。
9.  审计 ZCode 和 DSH 的实际源码、依赖、API 和许可证。
10. 生成逐文件迁移映射。
11. 生成 SQLite / PostgreSQL 双 Provider 设计。
12. 生成数据库迁移和数据校验计划。
13. 生成最终 Package 依赖图。

输出文档：

-   `docs/migration/LEGACY_CODE_MAP.md`
-   `docs/migration/FRONTEND_CODE_MAP.md`
-   `docs/migration/LEGACY_DATABASE_SCHEMA.md`
-   `docs/migration/DATABASE_SOURCE_OF_TRUTH.md`
-   `docs/migration/DATABASE_PORTABILITY_SPEC.md`
-   `docs/migration/AGENT_BEHAVIOR_SPEC.md`
-   `docs/migration/ORCHESTRATION_SPEC.md`
-   `docs/migration/UPSTREAM_SOURCE_MAP.md`
-   `docs/migration/THIRD_PARTY_AUDIT.md`
-   `docs/architecture/FINAL_ARCHITECTURE.md`

### 数据库特别约束

SQLite 是默认且权威的本地数据库。用户没有配置 PostgreSQL
时，应用必须完整运行，不得要求用户安装数据库服务。

PostgreSQL 是可选的外接权威数据库 Provider。用户显式切换后，PostgreSQL
才成为该 Runtime 的权威数据源。

不允许 SQLite 和 PostgreSQL 双主写入。

所有业务模块必须使用 Repository 接口，不得直接依赖具体 Driver。

SQLite 和 PostgreSQL 必须分别有 Migration 和 Integration Tests。

Redis 可选，不得成为任务和事件的唯一持久化来源。

数据库切换必须具备备份、导入、校验、确认和恢复点设计。

### 执行边界

P0 完成前：

-   不删除 Go 代码。
-   不删除旧数据库表。
-   不执行破坏性 Migration。
-   不覆盖用户数据。
-   不宣称尚未测试的功能已经完成。
-   不以创建空目录代替真实实施。

P0 完成后，输出真实文件级审计结果和 P1
任务计划，等待确认再开始大规模迁移。

所有后续阶段必须遵循：

读取源码 → 设计 → 修改 → 类型检查 → 单元测试 → 集成测试 → 文档更新 →
输出变更清单。

最终交付必须可以实际构建、运行和测试，而不是只有架构文档和静态 UI。

------------------------------------------------------------------------

## 17. 最终架构结论

VEXNAR 的最终数据库与 Runtime 关系：

-   **SQLite：默认本地权威数据库，保证开箱即用和离线可用。**
-   **PostgreSQL：可选外接权威数据库，支持更大规模部署和远程 Worker。**
-   **Redis：可选协调与通知组件，不承担唯一持久化职责。**
-   **Coordinator：唯一中心调度权威。**
-   **Worker：独立执行进程，可本地或远程部署。**
-   **Agent Runtime：VEXNAR 自主控制，吸收 DSH
    的机制而不依赖其内部实现。**
-   **Desktop：参考 ZCode，独立控制和观察 Runtime。**
-   **Security Engine：保留 VEXNAR
    的自主探索、双图、证据和授权执行语义。**

最终目标是一个默认本地运行、可选连接企业 PostgreSQL、支持多 Agent
协作和分布式执行、具有完整安全审计和数据迁移能力的 VEXNAR 企业级安全
Agent 平台。
