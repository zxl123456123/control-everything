# 个人活动空间与连续动作：独立最终审查

2026-10-05 Asia/Shanghai。reviewer：`/root/game_scene_final_review`，未参与本批产品实施；本轮重新执行验证，不沿用上一轮 game-scene 的 PASS。

**最终结论：PASS，仅覆盖 final-r3 的本批有界展示改动，无未解决的 P1/P2。** 圆角巡游、私人区域、选中收腿、归位最短转身和既有控制回归满足最终短方案；不表示 Codex 正文/实时活动、实际 session 协作或真实 WezTerm 正向关联已接入。旧 WezTerm Review(Impl) **BLOCKED 保留**。

先前 final-r2 候选未覆盖归位累计 yaw 的转身问题，已经失效，全文保留于 `E:/project-funny/mianban-develop/work/robot-personal-space-review-candidate-final-r2.md`。本最终结论另审新的产品/检查器差异、实际红绿、最终完整浏览器与重载后的 IAB，并重新运行独立 --space 与 audit-r3，未复用旧 PASS。

## 审查输入和最终版本

实际完整读取当前 renderer、index、README、短方案、交付文档，以及新旧检查器差异和相关回归实现。当前权威冻结为 `E:/project-funny/mianban-develop/work/robot-personal-space-final-r3/`，包括四个变更文件和两个本批文档。独立核对全部六份 frozen/current 原字节与 manifest；原始四份 before 快照未变。

| 最终输入 | SHA256 |
| --- | --- |
| final-r3/manifest.json | `412d5525684e54f41c49545ce9043e9c5c3a7f83481ec80f6e7cb770d90404ba` |
| final-r3/changes.diff | `5c62d6d9afaf655bcaf234b196401afefde1656ec21d759e2a5b7e6459d4c76d` |
| web/robot3d.js | `a90c81917433f818ee293e841fdbeb7fc06f0a89912862d8f06e62ae02a49853` |
| web/index.html | `bf290ab0f3ee31267b8a075fb0e4cece2f6b90a0487a37e32a2683aeb758cd81` |
| tests/verify_robot_cockpit.cjs | `67202cf34c4395a47811b8e082d4a719b9f755a20e1706db6ed6beeb4f405e87` |
| README.md | `322e7173a317a73a5b29f7496c8b2a318e176a136c6ed259d274daa2b4047118` |

本轮审查指出原文“选中立即固定水平位置”没有限定模式，而实际实现沿用“显式归位让全部角色回工位”。root 已将短方案/交付/README 限定为**巡游时**选中固定，明确归位优先级，该说明调整未改变行为。随后 root 发现并修正归位累计 yaw；renderer/harness 和两文档已更新至 final-r3，重新读取及核对冻结。

## 对需求的核对

- **连续运动**：原矩形路点与到点停步改为共享 CurvePath 的直线/圆弧闭环；连接点位置与切向相接，帧内余量继续推进。速度阻尼的积分位移与有限子步来自实际 renderer，测试没有复制运动公式代替产品执行。正常可见 15/30/60Hz 不丢墙钟时间；超过 100ms 的单帧仍限幅，不承诺严重卡顿时维持原速。
- **转身修订**：移动与归位都取 atan2(sin差角, cos差角) 的最短方向，再限制每子步至±6×delta。归位目标是0模2π，不直接把累计巡游角度阻尼回0。新增检查采集所有角色归位/重启期间的原始 yaw 差，没有用2π归一化掩盖整圈旋转；独立三个Hz的最大值均0.30000000000000426rad/50ms，满足0.300001阈值。
- **空间边界**：每个可见完整 session key 对应独立 3.2×3.6 地板与边框；X/Z 相邻工位间距3.4/3.8，留下0.2间隙。全模型世界包围盒（包括选择圈）核对实际边框，48角色巡游、归位、中途再巡游全过程0越界、区域0交叠。边框共用一个几何、两个材质；移除角色清理相应 station，销毁场景释放共享资源，没有每帧重建几何。
- **选中和控制**：巡游选中时 X/Z 立即固定，四肢与身体高度渐收至站姿；独立实际36帧/0.6秒收敛。同行角色继续走动。显式“回到工位”仍让包括选中者在内的角色归位。归位途中重启巡游先走连接段，单次50ms最大位移0.0375，没有跳到路线起点。暂停与按住指针严格冻结，普通hover继续运动；隐藏恢复重置时钟，像素/文字回退保留。
- **不同节奏与身份真值**：巡游速度0.67–0.75，步相各异。动画未写入活动/完成状态；当前在场 UUID 刷新保留工位/资源，离页移除后返回重新安排。没有永久座位、自由布局拖拽或共享通道避障。
- **功能边界**：本批只改运动、区域、说明与验证，无身份/API/权限改动。完整来源键、现有真实 raycast/像素选择与消息分页回归仍通过。个人空间测试在显式选择前各15/30/60Hz均无正文/动作请求；末尾明确选中合成远端 UUID `10000000-0000-4000-8000-000000000001` 后，每份 fixture 恰好产生既有的一次 GET messages（limit20、无offset/revision），整个场景 POST/focus/connect 为0。

独立推进实际 renderer rAF 回调、渲染真实 WebGL 几何得到如下结果；这是受控运动时钟，用于连续性和边界核验，不是原生性能测试。

| Hz / 角色 | 12秒实际路程 | 最大单帧方向变化 | 完整模型越界 / 区域交叠 |
| --- | --- | --- | --- |
| 15 / 48 | 8.898345856 | 0.250000643 rad | 0 / 0 |
| 30 / 12 | 8.904248579 | 0.125000321 rad | 0 / 0 |
| 60 / 12 | 8.905751033 | 0.062500161 rad | 0 / 0 |

等时路程最大差约0.0832%，低于2%；第一角色稳定速度最低0.7480，每个样本转向累计15.70796 rad，超过两圈，没有90°硬拐或路点停步。不同角色的巡游偏移已实际观察到差异。

## 本轮 fresh 验证

以下命令均由本 reviewer 在本轮实际执行并读取完整输出、退出码；命令通过独立采集器保留 stdout/stderr，不以管道收尾。所有独立文件使用新的 review 前缀，没有覆盖 root 或旧失败。

1. `C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture --space`：转身修订前r1与修订后r2均实际执行，**最终r2为2场景 / 51检查 / 0失败 / 0limitations / exit0**；owned临时loopback与headless Edge正常关闭，network guard 未放行生产8766、外部地址或真实正文。当前代码采用修订后r2的记录。
2. 独立审计r1：**41检查 / 3失败 / exit1**，真实原因与原记录保留如下节。语法4项及其余核对38项实际为0。
3. 独立audit-r2修正检查器后实际为41检查 / 0失败 / exit0，但只覆盖旧final-r2，后续明确失效。
4. `.venv/Scripts/python.exe -X utf8 -B work/robot-personal-space-review-audit-r3.py work/robot-personal-space-review-audit-r3.json work/robot-personal-space-final-r3`：**最终44检查 / 0失败 / exit0**。重新执行app/cockpit/harness的node --check及renderer标准输入module语法检查，4项exit0、stdout/stderr空。逐字节重建最终完整组合diff，采用实际生成器的Windows文本写入换行规则，未仅忽略任意差异。直接核对转身红/绿、当前19个Python backend/tests源字节与本轮126test版本不变、最终IAB8项及其新截图hash。

完整原始记录位于 `E:/project-funny/mianban-develop/work/`：

| 独立证据 | 内容 |
| --- | --- |
| robot-personal-space-review-browser-r2.json | 修订后独立真实命令、完整 stdout/stderr、exit0；旧browser-r1原样留存 |
| robot-cockpit-fixture-r1-2026-10-04T17-29-48-673Z.json | 修订后独立51检查、实际motion_space_samples/selected_pose/请求；SHA `4ea2e9143b2aecde5610666a43a4a5b2370aa26a715dd5ddf263ec07e8b26847` |
| robot-personal-space-review-audit-r1.json / audit-command-r1.json | 独立首轮41检查与3失败、真实exit1 |
| robot-personal-space-review-diagnose-r1.json | CRLF逐字差异与两份fixture的实际唯一messages GET/无POST |
| robot-personal-space-review-audit-r2.json / audit-command-r2.json | 旧final-r2的41检查、exit0，不作当前版本放行 |
| robot-personal-space-review-audit-r3.json / audit-command-r3.json | 当前final-r3的44检查、4个fresh语法命令、输入SHA、逐项断言与目标性能、实际转身红绿、exit0 |

本 reviewer 另直接读取并独立解析 root 的完整原始证据：本轮Python126 tests / OK / exit0（既有pydantic forward-reference warning保留，19个源字节未因前端修订改变）；最终完整浏览器40场景 / 1361个逐项断言全true / 0失败 / 0limitations / exit0；8个产品资产测试时SHA与当前原字节一致，正常清理、没有意外page/console错误。文件为同目录 `robot-personal-space-python-r1.json`、`robot-personal-space-browser-full-r2.json` 和 `robot-cockpit-fixture-r1-2026-10-04T17-28-19-760Z.json`（SHA `ecb59efb3439e45b7dd9aefb601ba10dab53a453f4d5dc83f42e0c7bdcf546f3`）。这不是仅接受 root 的成功摘要；旧full-r1也保留但不能代替最终回归。

最终原生rAF/真实WebGL约10秒连续可见采样，1024×900/DPR1/headless Edge：0角色164.992FPS/p956.3ms；12角色164.793FPS/p956.4ms/慢帧0；48角色110.504FPS/p9512.8ms/慢帧0.0905%。**12角色p95≤20ms、>33.3ms比例<1%目标达到**。旧full-r1的48角色157.159FPS/p958.4ms也保留，两轮有波动；48角色1025绘制调用/帧，负载及硬件变化仍可能下降。没有把本机headless值包装成IAB或任意设备的稳定游戏帧率保证。

修订后实际IAB证据 `E:/project-funny/mianban-develop/work/robot-personal-space-iab-r2.json` 的8项、5份新DOM样本均读取核对；截图 `robot-personal-space-iab-r2.png`（SHA `60e8649ff9c41d9c7b9e6593c024d728653693692260ca7ef8ce1d7ed7f9a2b8`）已实际视觉查看：12个真实身份机器人、独立地板、选中白边、本聊天完整UUID、元数据unknown和已退出工作台相符，当前筛选总数116仅是身份数量。近期窗口164/6.2与恢复167/6.0只是页面最近采样；静态截图不证明流畅度。旧r1原图也查看并保留。未宣称实际IAB canvas指针拾取已验收，真实pointer回归证据来自本机隔离Edge。

## 所有已见失败及处理

- **root focused r1**：27检查、1个场景执行timeout、exit1，记录 `E:/project-funny/mianban-develop/work/robot-personal-space-browser-focus-r1.json`。手动rAF fixture与默认waitForFunction的rAF轮询互等；实际page/console无产品错误。harness相关等待改50ms polling，后续r2的48检查不是最终节奏改动验收，最终完整1361及独立51另行重跑。
- **root首次审计**：未指定UTF-8而默认GBK读取JSON，UnicodeDecodeError / exit1，检查未执行。`E:/project-funny/mianban-develop/work/robot-personal-space-root-audit-r1-failure.json`原样保留；本独立三轮均显式UTF-8。root的新r2/r3/r4不替代本独立最终r3。
- **本独立audit r1**：41检查中3失败 / exit1。第一项因将LF生成的diff与Windowswrite_text输出的CRLF作错误直接比较；诊断首差位25，37284与37703bytes，内容差仅419个换行转换。另两项把每份运动场景末尾显式selectCard触发的正常messages GET纳入“全段0读取”，属于检查器断言范围错误。原代码、命令和结果未覆盖；新r2按真实生成规则重建diff逐字节相等，并逐请求只允许精确UUID的恰好一次既有GET，未放宽任何POST/focus/connect。新r2四语法与41核对实际exit0。
- **归位转身产品缺陷与旧候选失效**：root在初次完整绿色后发现归位仍直接damp累计yaw到0，本reviewer的旧候选也遗漏这项，不能继续称其完整满足连续动作。root先给实际harness增加归位/重启全过程原始角差检查，再against旧renderer执行红：`E:/project-funny/mianban-develop/work/robot-personal-space-turn-red-r1.json`，51检查/3失败/exit1，三个Hz均8.653150053rad/50ms；旧renderer SHA9183…，原fixture无意外page/console错误。随后只在moving/home转身改最短角阻尼与6rad/s限幅。最终root完整r2与独立space-r2重新执行均绿，独立audit-r3直接读原红fixture并核对三失败、旧SHA与新角差≤.300001，44检查实际exit0。原红、旧候选及旧审计全保留。
- **读取过程**：交付/r2冻结尚未生成时的文件读取/目录探测失败属于待补证据，后续已完整读取并逐字节核对；若干批量输出截断已定向补读。root调研旧路径rg exit1、旧Three手册URL404、当前目录无Git的rev-parse exit1亦在最终交付保留；没有因此修改产品或初始化Git。
- **历史范围保留**：上一批Win10053、误harness路径MODULE_NOT_FOUND、旧reload归属/时间检查失败、计数断言失败，以及control socket os10050等已在 `E:/project-funny/mianban-develop/docs/current/game-scene-delivery-r1.md` 与相应原证据记录；本批绿色不证明这些旧真实问题已解决，也不覆盖旧Wez BLOCKED。

## 放行边界

本 reviewer 只新增独立本地证据和本报告，没有修改产品、实际DB/SSH、生产8766、GUI或gateway进程，也没有递归委派。身份必须来自可核对数据；动画、目录相同或时间戳增长不能作为busy/done/合作证据。

实际session合作、关系事件、任务交接与产物版本接入属于后续独立工作，当前没有已实现协作连线、发送或自动执行。Codex仍是只读身份元数据而非正文监控；workbench-v4仍EXITED、真实远端terminal_unavailable。**可以放行本次连续运动/个人空间展示，不可以声称双端全部对话监测、真实合作或旧终端正向接入已成功。**

英文提交消息建议：`feat(cockpit): smooth robot patrols and define personal territories`。本目录无Git，未执行commit/push。
