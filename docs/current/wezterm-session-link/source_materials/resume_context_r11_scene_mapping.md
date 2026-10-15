# 下一轮场景与功能映射：跨会话交接

创建：2026-10-05，Asia/Shanghai。无需切换目录：`E:/project-funny/mianban-develop`。当前目录不是 Git checkout，未执行 Git 操作，不初始化仓库或 worktree。

## 用户授权与目标

用户最新原话：“那下一轮继续？可以新建一个session来继续优化场景和功能映射这个开发，你来控制session”。新 Codex 会话承担本轮实现，原会话协调范围、读取进度及独立核验，不同时编辑产品。用户先前已明确“自动实施代码即可现在”，不重复询问同一实施许可；确有新的必需信息再提问。

持续目标是日常项目开发效率优先，3D 辅助理解和决策。用户要求机器人有自己的空间、动作丝滑、场景更像游戏、动态流程和光粒子有实际用途，并实测新 Codex/WezTerm 会话能否出现和正确关联。不能只交一份新方案，也不能用装饰动画表达未经证实的工作或合作状态。

## 首先恢复的权威资料

加载项目适用 AGENTS/CLAUDE、coordinator 和恢复所需 runtime；读取：

- `docs/current/wezterm-session-link/README.md`
- `docs/current/wezterm-session-link/delivery_live_r10.md`
- `docs/current/wezterm-session-link/review_notes_impl_r10_1.md`
- `docs/current/game-scene-delivery-r1.md`
- `docs/current/robot-personal-space-delivery-r1.md`
- `docs/current/game-scene-github-research.md`

R10 为 §13/S1、S2 的有限集成交付，独立 PASS/PASS、RELEASED；该结论不能迁移为新修改的放行。更早视觉文档的运行事实是历史，尤其其 EXITED/旧 PID 不能覆盖 R10 当前记录。读取真实代码后再设计，至少覆盖 `web/robot3d.js`、`web/cockpit.js`、`web/app.js` 与映射 API 实际实现。修改前查官方文档和 GitHub 一手项目，复用适合当前 Three r186/原生 JS 的技术，不盲目增加引擎或依赖。

## 本轮优先交付

1. 连续性能：先复现多角色瓶颈，再优化绘制/资源复用和场景呈现。48角色最新连续样本 35.11 FPS、p95 60.9ms，目标未达；当前13角色短窗口163–165 FPS不能替代该结果。必须保留真实可见 rAF 的连续样本、原失败和相同场景/画质/负载条件，不能暂停动画或静默降级后宣称达标。保留各机器人独立区域、平滑步态、归位、选择、环绕、像素/文字回退。
2. 功能映射：明确完整来源 session key、映射链、证据时间、unknown/旧记录/过期/未映射原因，以及用户此刻可执行的查看或定位操作。点选身份、按需历史、终端定位必须继续正确隔离。先从实际代码与样本确定一项可交付的映射改进，不另造一套猜测规则。新开发会话自身应实测进入 Codex 身份列表和3D机器人；通过完整 UUID 验证，不能仅凭标题。

恢复后形成一个小而明确的本轮实现范围，按适用流程取得新技术审查并自主实施。展示与后端如果可独立，分开变更、验证与报告。不要扩成所有监控、Cinema4D 或 Jev 的同时重做；它们仍是后续方向。

## 当前可依赖的能力与限制

- Codex 是本机只读身份元数据索引，`codex:UUID`；正文、实时忙闲、完成状态与真实合作均未知。updated_at 或机器人走动不能推导活动状态。
- 远端固定授权来源为 `ubuntu@175.24.135.125:/home/ubuntu/.claude`；不是所有用户、所有SSH会话普查。
- R10 新测试 Codex：`01a10809-706b-78e3-b279-c3611cf75be0`；远端自有 Claude：`0990a0a5-a375-4bef-85ef-0ae23ee5ad74`，dev/terminal_3，仅两条授权 marker 历史。
- 面板入口 `http://127.0.0.1:8766/`。R10 已部署 H1 gateway；历史 launcher26552/listener14488、Wez GUI51008/attach53116/server14740 仅作归属线索，所有实际操作前重新核实进程出生时间、父子、镜像、命令和当前实例，不能盲用历史 PID。
- R10 已有175回归、69拒绝响应、15实际定位、native22、API3/IAB3证据；新修改需要本轮新验证。详情与原输出链接均见当前交付，不重复制造“历史全部已修复”的结论。
- 235ms unknown 的历史根因尚未证明；busy读资格与后续POST并不原子。真实合作、旧owned失败回收、父Q6原生三工具缺证仍开放。两项 Pydantic 警告保留。

## 操作与验收边界

保留完整 UUID/实例核验、CSRF/CSP、锁、原时间预算、全量 final 和 fail-closed。不通过省核验、增加预算、清 latch、重发 POST 或隐藏失败实现“稳定”。不重放 held 命令、不执行原 force-run 启动脚本、不操作其它用户的进程，不读取未授权对话正文。

对既有自有样本的只读观察优先。需要新的最小自有测试时，沿用用户已授权测试范围，明确所有权、原始记录和清理；不能把它扩大到其它会话。新聊天不需要再创建一批用户可见聊天，独立研究/审查使用 collaboration 子代理。

产物须是具体代码、适当新验证、实际页面截图及当前限制。功能点选测试与持续性能测试分别报告；真实用户页面正常播放/轮询下验证，保存全部已见失败。截图后缀按实际格式保存。独立审查后只报告其覆盖范围，附英文 conventional commit 建议；当前无Git，不做commit/push。

每次有实质发现及时用简体中文更新本会话。协调者通过 read_thread/wait_threads 读取，不要求实现会话主动向其它聊天发送消息。
