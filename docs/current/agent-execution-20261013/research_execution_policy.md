# Codex 执行策略补充调研

日期：2026-10-13（Asia/Shanghai）。受众：共享。角色：repo_researcher / supplemental-research。

## A. 结论与边界

本机 `codex-cli 0.162.0-alpha.17.2` 有按进程覆盖配置的正式入口，可以显式关闭 hooks、plugins/apps、多 Agent 和自动 goal 延续，并显式设置本次运行的沙箱参数。**这些参数不能共同证明“所有继承 MCP、系统配置及其副作用已完全隔离”。** 当前没有查到一个已证实的全局 `disable_all_mcp` 参数；`mcp_servers={}` 不是可靠清空方式。

生产路径可在产品明确告知继承本机 Codex 设置的前提下，使用现有账号与具体协议审批。对 smoke，独立工作目录、固定 prompt、明确权限和己方进程回收可以分别核验；不能将 cwd 或 prompt 当作外部 MCP 的 OS 沙箱。若 smoke 要求完全不继承任何外部能力，受控 CODEX_HOME 是候选，但它不自动复用已有登录，也不消除 system/managed 配置。本报告不自行选择降低权限。

本次只读本 feature 文档、生成 schema、官方文档/源码和固定 exe 的 `app-server --help`；未读私人配置或凭证，未启动 app-server 服务，未创建 thread/turn，未修改产品。

## B. 证据优先级

1. 本机协议文件：`work/agent-execution-20261013/research-schema/v2/{ThreadStartParams,ThreadStartResponse,TurnStartParams,ConfigReadParams,ConfigReadResponse,ConfigRequirementsReadResponse}.json`。字段结论以这些文件为准。
2. 本机 `app-server --help` 当轮运行两次，退出码均 0；已存 `work/agent-execution-20261013/policy-source/local-app-server-help.txt`。实际固定 exe 见本 feature `research.md`。
3. root 在 fresh 自有 CODEX_HOME 执行 `features list` 的观察记录为 `work/agent-execution-20261013/feature-probe-observation.json`；hooks/apps/plugins/multi_agent/goals 存在。此事实只证明名称，不证明关闭参数和运行时效果。
4. 官方文档已打开：[Config Reference](https://learn.chatgpt.com/docs/config-file/config-reference)、[Hooks](https://learn.chatgpt.com/docs/hooks)。官方源码读取自 openai/codex 的 **main 当日快照**，并非已确认与本机 alpha 二进制同一提交；缓存及 SHA256 在 `work/agent-execution-20261013/policy-source/`，`source-hashes.json` 可核对内容。

## C. 可实施的进程覆盖参数

本机 help 明确：`-c key=value` 使用 TOML 值覆盖；`--disable NAME` 等价于 `-c features.NAME=false`；`--strict-config` 在本版不认识配置字段时返回错误。参数必须作为独立 argv 传给固定 exe，不经 shell 拼接。以下是已知语义的候选启动参数，由 root/LW 选择符合产品范围的一组并实测：

```text
app-server --listen stdio:// --strict-config
--disable hooks
--disable plugins
--disable apps
--disable multi_agent
--disable goals
-c notify=[]
-c web_search="disabled"
-c sandbox_workspace_write.writable_roots=[]
-c sandbox_workspace_write.network_access=false
-c sandbox_workspace_write.exclude_tmpdir_env_var=true
-c sandbox_workspace_write.exclude_slash_tmp=true
```

这不是已通过真实 turn 验证的启动配置。`--strict-config` 若拒绝既有未知字段，应显示配置不兼容，不移除校验后偷偷重试；managed requirements 若与请求冲突，也应保留失败。

| 项目 | 已证实语义与限制 |
|---|---|
| hooks | 官方 Hooks 文档给出 `features.hooks=false`，`codex_hooks` 是旧别名。应在进程启动时设定，不能等 SessionStart 之后才关。 |
| notify | 官方参考列为外部通知命令数组。[merge.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/merge.rs#L139) 对数组采用替换；[hooks registry](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/registry.rs#L125) 过滤空 argv。因此 `notify=[]` 有明确关闭遗留命令的源码依据，不能只关闭 hooks 就假定 notify 同时关闭。 |
| plugins/apps | 当日官方 [config schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json) 和 [features 注册](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs) 有两者布尔 feature；本机 feature probe 亦有名称。禁用 plugins/apps 不等于禁用独立 `mcp_servers`。 |
| multi_agent/goals | 官方参考分别表示协作工具和持久目标自动延续。关闭这些功能不等于阻止普通 shell 命令自行启动子进程；进程归属和 OS 权限仍由其他边界承担。 |
| web_search | 官方参考与本机 Config schema 有 `disabled/cached/live`；disabled 关闭 Web Search 能力，不等于所有工具没有网络。sandboxPolicy.networkAccess=false 则是沙箱网络约束，两项不能互替。 |
| browser/computer | 当日官方 schema 存在 `features.browser_use` / `features.computer_use`；本次未对本机名及有效配置做独立验证。若 smoke 要求关闭，先由本机 strict-config/feature 证据确认，不直接宣称已覆盖。 |

不需要把全部 feature flags 穷举成新安全框架。上述几个开关约束已知额外能力；生产页面仍须如实说明本机配置继承范围。

## D. MCP、合并和查询的真实边界

### 空表不会删除继承项

[官方 merge.rs](https://github.com/openai/codex/blob/main/codex-rs/config/src/merge.rs#L100) 在 table/table 时逐 key 递归覆盖；空 overlay 没有 key，不清除 base；非 table（包括数组）整体替换。因此：

- `-c mcp_servers={}` 不能作为关闭所有继承 MCP 的契约。
- `-c plugins={}`、`-c apps={}` 同理不是全禁用。
- `plugins._default.enabled=false` 也不可靠覆盖每个显式启用项；官方 schema 描述单插件显式设置优先于默认设置。
- 官方已公开的 MCP 关闭方法是 `mcp_servers.<已知ID>.enabled=false`。不知道全部有效 server ID 时，这不能提供完全关闭证明；插件 MCP 和 host-owned apps 还有独立来源。
- `turn/start.disabledPluginIds=[]` **清除禁用名单**；省略/null 保持原名单。它不是禁用全部插件，且不能在已经创建线程后消除之前的启动副作用。

### config/read 可以读，但不可无筛选输出

本机 `ConfigReadParams` 支持 `cwd` 与 `includeLayers`。cwd 用于按该目录解析项目配置。`ConfigReadResponse.Config` 的显式 properties 未列 features/MCP/hooks/plugins，但 **additionalProperties=true**；layers.config 同样任意。因此 schema 不能证明这些值一定存在或一定缺席。`includeLayers=true` 会扩大返回内容，不能把完整结果写日志或发前端，其中可能带 env/header/命令等私人值。

若主任务需要核查已生效策略，可在自有进程内请求 `config/read`，只在内存中判断允许的一小组布尔、枚举及写根集合，输出“键存在/值是否符合预期/来源类型”的清洗摘要；不输出原配置、环境变量值、HTTP header 或插件/MCP 凭证。此为执行建议，不是本次已做操作。

`configRequirements/read` 已在本机 ClientRequest 中存在，返回 requirements 或 null；可有 allowedApprovalPolicies、allowedSandboxModes、allowedWebSearchModes、allowedWindowsSandboxImplementations、featureRequirements、allowManagedHooksOnly 等。它是约束来源，不是全部有效配置；null 只表示没有该类 requirements，不表示用户设置为空。

[官方 loader](https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs#L423) 把 session flags 作为配置层加入；还可能有 legacy managed config 层。不要由传入参数推断它一定是最终有效策略。首次创建线程后，应核对实际 ThreadStartResponse；每次 turn 覆盖后仍需核验错误/通知，不能把“JSON 合法”当沙箱已生效。

## E. 本机 ThreadStart / TurnStart 沙箱字段

### 创建线程

本机 `ThreadStartParams` 使用如下字段，不接受 `sandboxPolicy`：

```json
{
  "cwd": "<已登记并解析的项目绝对路径>",
  "sandbox": "workspace-write",
  "approvalPolicy": "on-request",
  "approvalsReviewer": "user",
  "config": {
    "sandbox_workspace_write": {
      "writable_roots": [],
      "network_access": false,
      "exclude_tmpdir_env_var": true,
      "exclude_slash_tmp": true
    }
  }
}
```

只读模式使用 `sandbox:"read-only"`。此示例展示字段形状；审批策略选择由 LW 决策，不把 on-request 等同每条命令都需用户批准。ThreadStartResponse required 包括 approvalPolicy、approvalsReviewer、cwd、model、modelProvider、sandbox、thread；必须对照返回的有效值。ThreadStart.config 是任意映射，配置 key 的语义还须由实际二进制校验。

### 发起 turn

本机 `TurnStartParams.sandboxPolicy` 支持完整对象：

```json
{
  "type": "workspaceWrite",
  "writableRoots": [],
  "networkAccess": false,
  "excludeTmpdirEnvVar": true,
  "excludeSlashTmp": true
}
```

或：

```json
{ "type": "readOnly", "networkAccess": false }
```

`writableRoots:[]` 清空**额外写根**，不表示 workspaceWrite 的 cwd 不可写；两个 exclude 字段取消额外临时目录默认放行，不能声称把系统所有路径变成沙箱。对只读对象没有 writableRoots 字段，不应塞入 workspaceWrite 专有字段。

`TurnStartParams` 也有 cwd、approvalPolicy、approvalsReviewer；会覆盖本 turn 及后续 turns。前端不能接收任意 cwd/写根；应由服务端按登记项目与运行所有权构造。`dangerFullAccess`、`externalSandbox` 虽在 schema 中存在，不是本 feature 可默认选择的替代模式。

## F. 受控 CODEX_HOME 与认证替代

当日官方 [auth/storage.rs](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs#L162) 证实文件认证路径是 `<CODEX_HOME>/auth.json`；[keyring store key](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs#L245) 由该 home 的规范化路径 SHA256 派生。换一个 home 不会自然选中旧 home 的相同 keyring 条目。

没有找到官方“新 home 仅只读复用旧 auth.json”的简单配置契约。不能用 symlink/hardlink 冒称只读：同一源码的 save 会 truncate/write/create auth 文件，认证刷新可能写到链接目标。也不能自动复制 token、建立新凭证库或从私人文件抽取 token 作为研究捷径。

由此得到的最小替代边界：

1. **无认证隔离测试**：新自有 home + 自有 cwd，可验证 CLI 配置解析、stdio 生命周期、错误与回收，不能当真实推理通过。
2. **已有账号集成测试**：保留原账号 home，用已验证的最小 overrides、受控 cwd 和固定 prompt；明确仍可能继承独立 MCP/managed 配置，不宣称全隔离。是否满足本 feature smoke 目标由 root 收敛。
3. 若必须同时满足“全新 home”与“真实账号推理”，需要单独支持的认证方式与授权流程；当前不自动登录、不复制凭证、不改全局配置，因此留作缺口，不强行绕过。

## G. 未确认点与失败记录

- U1：本机进程覆盖的实际有效值尚未独立探测；feature 名存在、参数被 parser 接受，都不等于真实运行限制已测通。
- U2：全部有效 MCP 来源及系统/managed 层未读取，本报告不声称完全禁用；生产模式应如实展示继承，或根据收敛后的 smoke 目标停止在缺证据状态。
- U3：Windows 沙箱可用性与 Job 回收由 root 独立补证；本报告没有运行模型 turn。
- U4：官方 main 与本机 alpha 的源码精确对应未确认；因此本机生成 schema、help、strict-config 与实际运行证据优先。
- 调研失败：GitHub tree API 限流，未取得 main commit SHA；改用必要 raw 文件并记录本地 hash。若干旧源码路径返回 404（旧 config_loader、features、auth/storage、hooks 路径），后按模块 imports 找到新位置。官方 config-basics 页面工具返回 Internal Error；后只使用实际打开的 Config Reference/Hooks。一次 web find 连接失败，结论未依赖该失败输出。初次文档/文件列表输出被截断，随后精确读取 clarifications 与所需 schema。

## H. 给 LW/reviewer 的最小证据

- 请求 enum 与对象命名：本机 `ThreadStartParams.json#/definitions/SandboxMode`、`TurnStartParams.json#/definitions/SandboxPolicy`。
- 写根/网络/temp 精确字段：同一 SandboxPolicy 的 workspaceWrite/readOnly 分支。
- 插件名单语义：`TurnStartParams.json#/properties/disabledPluginIds`。
- 查询隐私边界：`ConfigReadResponse.json#/definitions/Config/additionalProperties`、`ConfigLayer.properties.config`。
- 进程开关：本机 help、root feature probe；运行时有效值尚待 root 验证。
- 空表/数组合并、notify 空数组、home 绑定 auth：policy-source 内对应官方源码和 `source-hashes.json`。

无新的跨功能事实；上述边界已与前一里程碑的能力分层事实一致。
