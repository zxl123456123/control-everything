# 兼容项目与进度的官方做法

日期：2026-10-14。受众：共享。coordinator 已在本轮打开下列官方资料；本文件记录适用事实与取舍输入，不等同于已实现能力。

| 官方资料 | 已核实做法 | 本批采纳方向与限制 |
|---|---|---|
| [VS Code 多根工作区](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) | 工作区显式登记多个文件夹，文件夹可单独命名，配置支持绝对或相对路径。 | 采用显式目录绑定，避免猜测目录就是项目身份；不搬入 IDE 工作区运行时。 |
| [Git worktree](https://git-scm.com/docs/git-worktree) | `git worktree list --porcelain -z` 提供适合机器处理的工作树元数据。 | 当前所有项目不强制使用 Git；显式目录绑定先覆盖 worktree，同仓库不自动合并为一个项目。Git 自动发现属于后续可选来源。 |
| [platformdirs](https://platformdirs.readthedocs.io/en/latest/) | 按宿主区分用户配置、数据、缓存等目录，支持 Windows AppData 等平台位置。 | 采纳每个用户的数据与共享源码分离这一模式；是否需要新增依赖由架构选择，不能把本机用户名写入产品配置。 |
| [Python 3.12 sqlite3](https://docs.python.org/3.12/library/sqlite3.html) | SQLite 支持事务和数据库备份接口。 | 兼容写入必须有界、原子、保留来源；不能把展示用 LIMIT 查询当全量迁移，也不直接复制活跃 WAL 主文件冒充一致快照。具体导入边界由架构/LW 明确。 |

本批不采用任意可执行插件：用户当前要求是兼容不同项目和工作流，明确的几类只读来源足以覆盖人工管理与文档观察。官方做法提供目录/数据分离与结构化观察原则，不提供本面板真实项目完成事实；完成仍由人工记录或既有任务状态表达。
