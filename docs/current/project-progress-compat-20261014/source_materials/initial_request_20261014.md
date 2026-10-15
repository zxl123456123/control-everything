source_type: initial_request
created_at: 2026-10-14 Asia/Shanghai
created_from: current chat
related_stage: Research / Architecture / LW / Impl
supersedes: none
status: active reference; decisions remain in clarifications.md

## 用户原话

“下一步呢，另外还有这个用来识别项目的方式是不是硬编码的，如果其他人也用了我这个，工作流用的不是我的工作流，硬编码是不是无效，好好分析这个怎么解决”。

“这种如何统一管理确实才是最难的，以及他后面的开发进度。这个你来想一个编码形式或者通过什么架构来完成这个兼容性，然后把方案改了开始实施完成”。

## 上轮事实与候选方向（不是已实现）

实际阅读progress.py/workspace.py/codex_index.py/launchers.py及测试，发现个人路径登记、固定docs/current中文状态规则、Codex本机用户名、cwd前缀而非项目身份；启动器/终端来源也有个人环境参数。临时目录复现：无文档和其他英文工作流都能登记，线索分别None/[]；本工作流产生一条线索；“方案评审PASS，等待开始实施”被closed判True；同级worktree不满足inside_project。

候选方案是稳定Project ID与目录分开，用户明确添加项目，工作流读取按项目选择；人工基础、现有预设及受限通用输入先落地，不造任意插件。个人设置/数据与源码分开，保留旧id/任务/人工/运行账本。数据/API/UI细节需根据真实研究定稿，不能由此摘要假设已经确定。

官方参考：VS Code显式多目录工作区 https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces；Git worktree结构化输出 https://git-scm.com/docs/git-worktree；用户数据目录成熟做法 https://platformdirs.readthedocs.io/en/latest/。这些是可借鉴的事实，不表示必须增加某个库或接入IDE。

目录无Git且禁止初始化。已保存74文件before快照。原Orca与UI对象保留；旧M3费用暂停、P1-B U1–U5开放，像素延期。只当前兼容功能连续实施，不用新授权恢复模型试跑或账号/私人正文读取。
