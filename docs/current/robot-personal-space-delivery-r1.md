# 个人空间与机器人连续动作

2026-10-05 Asia/Shanghai。依据用户继续自动实施及“动作丝滑、自己的空间、session 配合须思考好”的要求。本批为可逆展示改动，不更改会话接口、数据库、权限或终端操作。当前页面 http://127.0.0.1:8766/ 已重新加载，静态文件直接生效，无网关重启。

## 现在的行为

- 每个可见身份有独立 3.2×3.6 地面区域、工位和有限巡游路线；相邻区域留 0.2 间隙。选中角色对应区域白边高亮，点选继续使用完整来源命名键，不能按目录猜绑定。
- 巡游改为圆角闭环，按距离连续前进并消耗本帧剩余路程。起步和停步平滑，移动/归位均按最短角差转身，速度限6rad/s，避免走多圈后归位绕转整圈。身体与四肢按实际位移推进。各角色速度 0.67–0.75 unit/s、步相不同，展示动画不代表忙闲。
- 巡游时选中立即固定 X/Z，在 0.6 秒内平滑收腿站稳；同行角色继续活动。用户显式点击“回到工位”会让包括选中者在内的角色归位，沿用既有控件语义。归位途中重新巡游会走连接段。暂停、按住指针仍严格冻结；隐藏恢复不追赶。正常可见 15Hz 使用有限子步，超过 100ms 的单帧继续限幅，不能保证严重低帧率时仍按墙钟原速。
- 在场同 UUID 刷新保持工位与位置；分页或角色失效会移除模型，返回页重新安排。没有永久座位、自由拖拽地图或共享通道避障。

采用现有 Three r186 [CurvePath](https://threejs.org/docs/pages/CurvePath.html)、[EllipseCurve](https://threejs.org/docs/pages/EllipseCurve.html)、[damp](https://threejs.org/docs/pages/MathUtils.html)。参考 [AI Agent Office MovementSystem](https://github.com/yakobusdamar/ai-agent-office-simulation/blob/main/src/simulation/MovementSystem.ts) 保留帧内剩余距离；不复制原项目的预设任务状态。区域边界共用一个几何和两种材质，每个角色增加一次 LineLoop 绘制，无新依赖、模型下载或物理引擎。

## 真实验证

| 根协调者独立执行 | 新结果 | 完整记录 |
| --- | --- | --- |
| 全 Python unittest | 126 项 / 0FAIL / 0ERROR / exit0，既有 pydantic forward-reference warning 保留 | work/robot-personal-space-python-r1.json |
| 最终完整隔离 Edge fixture | 40 场景 / 1361 检查 / 0失败 / 0limitations / exit0；四个语法检查0，包含新增归位转身门 | work/robot-personal-space-browser-full-r2.json；work/robot-cockpit-fixture-r1-2026-10-04T17-28-19-760Z.json |
| 15/30/60Hz 动作与空间 | 实际浏览器回调、真实 WebGL 模型；超过两圈，完整 mesh 含选择圈不越私人区域；归位再巡游不瞬移 | 同上 motion_space_samples / selected_pose |
| 修订后实际 IAB 页面 | 8 项 / 0失败 / exit0；重新加载最终转身代码，12条真实元数据、选中本聊天完整 UUID、区域说明、归位/暂停/恢复及终端禁用 | work/robot-personal-space-iab-r2.json |
| 字节与全部断言 | 旧r2/r3分别28/30项绿色不复用为当前放行；最终r4核对final-r3、1361断言和红绿转身门 | work/robot-personal-space-root-audit-r4.json；root-audit-command-r4.json |

15/30/60Hz 各推进 12 秒，第一角色实际路程分别 8.89835、8.90425、8.90575，最大偏差约 0.0832%。稳定速度最低 0.7480 unit/s；每帧方向最大变化分别 0.2500、0.1250、0.0625 rad，无旧 90°硬拐或路点停步。15Hz 用48模型，30/60Hz用12模型；每帧检查所有角色完整几何世界包围盒与实际边框，巡游/归位/中途重启全过程0越界、个人区域0交叠。两圈后归位/重启原始yaw最大变化从失败复现的8.653rad/50ms降至0.300rad/50ms，未用2π归一化掩盖整圈旋转。此处是受控浏览器运动时钟，不作为真实性能采样。

最终原生可见 rAF 连续约10秒、1024×900/DPR1：0角色165FPS/p956.3ms；12角色165FPS/p956.4ms/慢帧0；48角色111FPS/p9512.8ms/慢帧0.090%。修订前完整r1的48角色157FPS/p958.4ms，负载波动，两轮均保留。12角色目标 p95≤20ms、>33.3ms比例<1% 达到。48角色仍有1025绘制调用/帧，在其他机器或负载下可能下降；不保证所有硬件游戏帧率。

最终实际 IAB 1280×720/DPR1.25，正常DOM近期窗口为164FPS/p956.2ms，恢复瞬间167FPS/p956.0ms不能当作稳定benchmark。截图只证明区域、角色与详情画面，不证明流畅度；实际 IAB canvas 指针 raycast 未冒称，本机隔离 Edge 原有真实指针回归继续执行。最终截图 work/robot-personal-space-iab-r2.png，SHA `60e8649ff9c41d9c7b9e6593c024d728653693692260ca7ef8ce1d7ed7f9a2b8`；修订前r1原图保留。

完整回归保留消息45边界、Codex/远端同UUID命名隔离、真实3D/像素拾取、分页与迟到/过期响应、普通hover/按住冻结/隐藏恢复/reduced motion/降级/context loss/dispose/360px/安全头等检查。运动场景只做元数据请求；唯一新选择检查显式选择合成远端UUID才按既有流程读一次消息，没有新增POST、focus或连接。未使用生产8766或真实正文作为fixture。

## Session 配合如何服务开发

这是后续接入设计，当前没有实际协作连线、发送或自动执行。用途是把“实现→审查→验证”连接到同一任务，明确交接产物、等待哪一方以及为何阻塞，帮助用户决定下一步。机器人位移不能成为协作状态源。

| 必须可核对的事实 | 在面板上的用途 |
| --- | --- |
| 任务/依赖记录与双方完整来源 session key | 确定谁实现、谁审查；同 cwd 只说明项目，不能证明合作 |
| 明确的委派或交接事件、来源与时间 | 事件出现后才能画“已交接”；用户手动安排的关系须标“计划” |
| 产物引用及版本，例如文件、提交或 PR | 点击关系直接查看交付对象，避免只传聊天结论 |
| 可核对的接收、审查或测试结果 | 显示待接收、待验证或阻塞原因；时间戳增长不能推完成 |

开发例子：实现会话交付具体提交 → 审查会话针对该提交给结果 → 验证会话对相同版本执行测试。下一步关系视图可参考 [React Flow 自定义边](https://reactflow.dev/learn/customization/custom-edges) 的标签与事件依据，但当前项目无 React 且无关系事件，本批没有引入图库。共享空间中的会面/交接动画必须由这些事件触发；真正需要跨区域走动时再引入共享通道的路径和占用预约，不能由随机靠近触发执行。

当前 Codex 只有只读身份元数据，正文、实时忙闲、完成与协作未知；本次两次实机样本分别114/116条筛选身份，仅显示当前12条，数量会变化且不是活跃总数。不将上轮113条冻结采样当作当前总数。WezTerm workbench-v4 仍EXITED、关联unknown、远端 terminal_unavailable，不能声称双端所有会话接入。旧 WezTerm Review(Impl) BLOCKED 保留；没有恢复退出布局、启动SSH命令、发送会话消息或放宽权限。

## 已见失败与审查范围

- 新 focused r1：27检查、1场景执行timeout、exit1。手动 rAF fixture 与默认 waitForFunction 的 rAF polling 相互等待，无产品page/console错误；改检查器的相关等待为50ms polling。原 work/robot-personal-space-browser-focus-r1.json 和17-04-20 fixture保留。focused r2 为48检查/0失败/exit0，此后不同巡游节奏小改，最终完整1361检查重新执行，没有把旧focused当作最终字节证据。
- 根首次审计未显式UTF-8，Windows默认GBK读UTF-8 JSON抛 UnicodeDecodeError、exit1，检查未执行；记录 work/robot-personal-space-root-audit-r1-failure.json。新的r2逐文件显式UTF-8，28检查0失败exit0。未修改产品来掩盖失败。
- 独立审计r1为41项/3失败/exit1：diff检查器没匹配实际Windows文本写入换行规则；两份fixture的“无messages”检查错把末尾显式点选一次GET当自动读取。r2按实际生成规则逐字节重建且逐请求限定恰好ids[0]的一次GET(limit20)、POST/focus/connect0，41项绿色。旧记录保留，这轮审查不作为转身修订后的最终放行。
- root在初次完整绿色后发现归位朝向仍直接将累计yaw阻尼到0。先增加全过程原始yaw步幅检查，work/robot-personal-space-turn-red-r1.json实际51项/3失败/exit1，三个Hz均8.653rad/50ms；再改最短角差与转向限幅。最终完整r2重新1361检查/0失败/exit0，独立新space-r2也51/0/exit0。原红记录不覆盖。
- 研究代理旧路径rg exit1与输出截断已按实际路径补读；一个旧Three手册URL404改读当前官方页面。历史失败与未验收边界仍见 game-scene-delivery-r1.md，本轮绿色不关闭旧远端BLOCKED。
- 本轮 git rev-parse exit1：此目录无Git仓库，未初始化、commit或push。

输入快照 work/robot-personal-space-before-r1/；初次freeze final-r1 与语义限定版 final-r2 均保留。归位转身修订后最终六文件字节、组合diff为 work/robot-personal-space-final-r3/。旧final-r2候选review已归档并标失效，不能用旧PASS；实施为root，最终独立新审查见 [review](robot-personal-space-review-r1.md)。必须由root读该报告和真实命令结果后才作最终放行，最终门记录 work/robot-personal-space-root-delivery-r1.json。自动实施授权不替代独立审查。

英文提交消息建议：`feat(cockpit): smooth robot patrols and define personal territories`。
