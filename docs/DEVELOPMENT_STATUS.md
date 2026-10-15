# 开发进度与当前边界

更新日期：2026-10-15（Asia/Shanghai）。本页是当前进度入口；各功能目录的方案、审查和失败记录保留其历史语义。

## 已实现的主体

| 能力 | 当前实现与证据入口 |
| --- | --- |
| 工作台 `/workspace` | 项目、待办、任务持久化、Agent 能力与会话入口、手工用量、按需 Codex 额度及固定 RSS。[工作台报告](current/agent-workbench-20261013/impl_report_r1.md) |
| 工作台 UI | 桌面与窄屏布局、文字和状态层级已做独立验收。[UI 交付](current/workspace-ui-20261014/README.md) |
| 项目进度 `/progress` | 本机项目注册、手工状态/百分比、待办及开发文档摘要；不从动画或进程推断完成。[兼容方案](current/project-progress-compat-20261014/README.md) |
| 会话与终端 `/` | 本机 Codex 身份索引、固定远端 Claude 的按需消息分页与有证据的已有终端定位；不等同全服务器覆盖。[终端批次](current/wezterm-session-link/README.md) |
| 同主会话协作 | 登记、任务、产物哈希、独立复核、验收收据和按需公开发言。[协作交付](current/subagent-garden/README.md) |
| Orca 离线预检 | 固定材料和候选参数检查；输出仍明确禁止据此启动运行。[P1-A 交付](current/orca-runtime-adoption-20261014/README.md) |

## 尚未收口

- Agent 执行闭环代码已落盘，但真实 Codex 验收与独立实施审查尚未完成；保留[暂停交接](current/agent-execution-20261013/handoff-paused.md)，本轮不恢复模型试跑。
- Orca 实际运行、Windows 完整 bundle/ABI/监听/发现与清理验证尚未通过准入，不能称为“已接入 Orca”。
- 历史终端/客户端验收限制以各批次记录为准；本轮本地测试不替代真实远端定位、客户端加载、手机远程或原生安装包验收。

## 本轮整理

先保存清理前源码基线，再独立提交展示层退役。用户已明确要求纳入 Git，覆盖旧文档中“本轮不初始化 Git”的历史范围。

清理目标是移除像素/3D 人物、巡游、场景控制及仅用于场景的依赖；保留会话列表、终端、消息和协作收据。最终清单和验收见 [展示退役](current/display-retirement-20261015/README.md)。不据此扩大到删除资讯、额度或其他尚未明确判定无用的业务能力。

## 仓库与本地数据

- Git 保存源码、测试、依赖清单、配置示例和开发文档；历史研究/失败记录不作删除清理。
- `.venv/`、`.exe/`、`work/`、本机 `.codex/config.toml`、SQLite 及手工进度数据不提交，也不从磁盘删除。历史文档引用的 `work/` 证据仅在原开发机可用，不是可克隆产物。
- 新检出请复制 `progress-registry.example.json` 为 `progress-registry.json` 并修改绝对项目路径；复制 `progress-manual.example.json` 为 `progress-manual.json`。已存在的本机文件不要覆盖。
- 代码目前仍绑定既有 Windows 路径与固定远端来源；纳入 Git 不代表已完成跨机器配置改造。测试中的 Playwright 路径也沿用原环境。
- 忽略规则采用 [Git 官方 gitignore 语义](https://git-scm.com/docs/gitignore)，先排除运行数据再暂存；远程导入参考 [GitHub 现有代码导入流程](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。不建立额外备份框架。

## 本轮核验记录

清理前全量测试与清理后验证分别记录，不能相互替代。本轮准备阶段发现：初始 Git 命令因目录尚非仓库失败；GitHub CLI 未登录；原项目缺少 `.gitignore` 和文档维护规范；宽范围搜索/读取出现截断，后续定向补读。已有 Pydantic `lifespan` 警告保留，未作为本轮顺手修复范围。
