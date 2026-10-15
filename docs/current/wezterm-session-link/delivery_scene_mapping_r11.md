# R11 场景性能与选中来源映射

日期：2026-10-05。本轮场景与选中来源增量已有限交付：fresh ReviewImpl协议/业务PASS/PASS，root最终124项/0fail/exit0。以下结论按证据层限定，不将工作台持续正关联或范围外事项写成已完成。

机器人和工位改用相同geometry/material的实例绘制，保留原模型、材质、光照、抗锯齿、DPR、192粒子、步态、巡游、归位、选中与原拾取。场景下新增选中来源说明：完整原样key、来源采样/年龄、身份、历史能力、终端与工作台条件及原页面入口。Codex只描述身份元数据、未知活动和未接入正文/绑定；远端历史保持按需独立读取。缺注册、冲突、过期、未知与缺凭据继续禁用，原后台/动作/API/轮询均不变。

产品范围为`web/robot3d.js`、`web/app.js`、`web/index.html`、`web/style.css`及原`tests/verify_robot_cockpit.cjs`。无新增产品框架或配置。目录没有Git，不初始化或提交。建议英文提交信息：`perf(scene): batch robot rendering and explain selected session mappings`。

## 当前验证

| 层次 | 证据 | 结论 |
| --- | --- | --- |
| 本地语法/范围/守卫/画质字句 | work/r11-impl-local-check.json | 29项/0fail/exit0；原14个guard/action与moveRobot/moveParticles/schedule相同 |
| 实例与能力/来源键/窄屏症状 | work/r11-r11-repaired-command.json | 42项/0fail/exit0；960实例与原geometry/material/world矩阵一一匹配、每key15机器人+5工位部件；实际31092三角形/192点；类别/删除/重排/释放无幽灵 |
| 旧交互与定位声明/回退 | work/r11-core-repaired-command.json | 84项/0fail/exit0；matching POST response与最终notice确认未核验不冒充成功，原三metadata GET轮询无正文/动作 |
| Python当前回归 | work/r11-python-tests-command.json | 175tests/OK/exit0，两个既有Pydantic IncompleteFieldDefinitionWarning保留 |
| 全量浏览器回归 | work/r11-full-fixture-repaired-command.json | 第三轮44场景1403项/0fail/exit0、4语法exit0、limitations[]；前两轮分别1392/1fail、1397/2fail/exit1，不称此前全绿 |
| 48连续性能 | work/r11-perf48-after-command.json | 60秒8项/0fail/exit0；仅本机单窗口达本轮参考线 |
| 真实8766/API/DOM/WebGL/native | work/r11-live-webgl-command.json | 23项22通过1失败/exit1；G11.3身份层已实测，工作台每样本正关联不成立 |
| 最终真实IAB/资源 | work/r11-iab-final-observation.json / work/r11-iab-final.jpg / work/r11-final-static-live-command.json | 629px计算单列、完整key与能力可见，正常3D播放；8个静态GET的实际SHA与当前磁盘相同 |
| 独立ReviewImpl/root Gate | review_notes_impl_r11_1.md / work/r11-root-final-gate.json | 正式PASS/PASS；独立审计113/0与报告绑定12/0均exit0；root实际最终124/0/exit0，限定R11增量，whole_workbench_continuous_association_pass=false |

## 48人性能的比较条件与限度

| 样本 | FPS | p95 | >33.3ms慢帧 | draws/frame | 判断 |
| --- | ---: | ---: | ---: | ---: | --- |
| 旧48人历史 | 35.1098 | 60.9ms | 19.658% | 1025 | 历史失败保留 |
| 本轮before同方法60秒 | 71.8050 | 30.2ms | 3.8069% | 1025 | p95/慢帧/draw参考线未达 |
| 本轮after同方法60秒 | 157.9204 | 8.3ms | 0.0105541% | 83 | 此本机窗口四参考线均达 |

before raw为`work/robot-cockpit-fixture-r1-2026-10-05T01-25-27-865Z.json`；after raw为`work/robot-cockpit-fixture-r1-2026-10-05T02-17-45-259Z.json`。after有9475原间隔59998.6ms，root独立复算与原字段相同。正常7次sessions GET，零正文/POST。首尾48机器人/48工位，每key15+5部件，playing、抗锯齿、192点/原尺寸透明度和实际巡游速度检查为true。测试都是Edge/headless/1024×900/DPR1、原每帧遍历与真实rAF/WebGL调用；不减人口、暂停、降低画质/CPU观察开销或延长轮询制造对比。FPS≥60、p95≤20ms、慢帧<1%、draw≤128分开判定。

这一个达标窗口不保证任意硬件、IAB、并行负载或无限时长。首完整fixture的48短窗104.0147FPS/p9520.7ms/slow1.4409%，第二完整fixture的48短窗74.9011FPS/p9551.2ms/slow10.5333%仍未达；12人首完整短窗slow2.0683%也未达。第三完整fixture短窗0/12/48为164.9934/164.9918/164.8889FPS、p956.4/6.4/6.7ms、slow均0、draw17/47/83，仅是该次短窗。真实native短窗89FPS/p9542.2ms、IAB初载2FPS/p95428.9ms/后续截图97FPS/p9537.5ms与最终165FPS/p956.2ms均只是不同短窗观察，不合并成连续绿。不能归因所有改善或所有卡顿于draw次数。

## 本次真实身份与工位

唯一目标为`codex:01a109a3-2890-7531-805b-6ed67edb5d5d`。真实API索引、DOM原完整key、WebGL实例与原代理同变换、独立ownerKey五部件工位、正常动画下三次refresh仍同slot/home，以及native pointer的Codex→授权自有远端→Codex均实测。远端仅固定`0990a0a5-a375-4bef-85ef-0ae23ee5ad74`两marker必要历史观察；保存布尔/count，不落其它正文或CSRF。没有POST、focus、connect、资源替换或应用状态注入。

真实probe整体exit1来自首workbench_timeout，随后3次unique_observed不能证明每次正关联。此轮不扩大后台修复或新增定位实测要求；unknown诚实显示，不停止/重启/kill用户终端求绿。真实probe后唯一产品变化是一行窄屏CSS，其前后web/app.js、robot3d.js和其它六asset字节相同；最终360/1024 fixture与真实629px单列、8资源GET字节另行验证当前CSS。

![最终实际页面](E:/project-funny/mianban-develop/work/r11-iab-final.jpg)

## 失败保全与修正

| 已见失败 | 保留证据 | 后续处理与结论 |
| --- | --- | --- |
| before60秒target三失败 | work/r11-baseline-target.json | 原采样命令exit0只证明采样；目标checker exit1，不互相覆盖 |
| 首功能19项12失败 | work/r11-feature-red-command.json | 实例/映射未实现的症状与manualFrames下rAF polling死等并存；只改测试刷新50ms polling后31项绿 |
| 本地checker提取函数AttributeError | work/r11-local-check-first-red.json | 修实际缩进/单行函数提取，不为checker改产品；后29项绿 |
| 首全fixture1392/1fail | work/r11-full-fixture-command.json | 零API模式断言跨原10秒metadata轮询，仅允许原三GET路径，POST/正文/未知路径仍拒绝 |
| 第二全fixture1397/2fail | work/r11-full-fixture-final-command.json | unverified断言当次未存notice/响应，不能严格判断成竞态；另一回3D零API跨原轮询。先匹配响应再捕获early/final notice、正常metadata GET清单，84专项绿；第三全套1403/0验证当前字节，不改旧红 |
| 新摘要缺CSRF错误说可定位 | work/r11-csrf-red-command.json | 36/1fail，局部复用原完整canFocus后缺凭据描述与disabled一致，无动作门修改 |
| 窄屏摘要被通用facts覆盖两列 | work/r11-responsive-red-command.json | 42/1fail；一行CSS优先级修正，360实际1列/1024三列42专项绿 |
| 真实工作台首超时 | work/r11-live-webgl-command.json | 23/1fail/exit1保留，G11.3当前身份层成立；工作台持续正关联未证 |
| 旧warnings/读查失败 | impl_report_r11.md及各原JSON | 两Pydantic warnings、调研404/rg不存在/输出截断补读、Cua Ctrl+Home未聚焦、reviewer读取语法/KeyError/虚构标题checker首红/误把合法历史GET视为CSRF越权、pending文件不存在均保留 |

旧235ms未知根因、ready GET与POST非原子、旧owned回收/Q6、Codex正文/实时活动/真实协作以及旧独立BLOCKED均继续开放。本轮仅交付授权场景与选中来源增量，不能把旧R10有限成功或此60秒绿扩成全部系统完成。

## 输入与最终字节

plan §14 SHA `6595b98915f5cfcba0a9e178617d97d2b17ed567e88d9dac0332b04325ddb294`；root Gate2实际30/0。最终28路径manifest SHA `0323295e725dc0ef58f85b317f8bbd177183a57ccf549edcf4b95d423f5c6777`、patch SHA `c232164ffb6ddd067fcbc36789b03f8daca7362edc82478d727cf0b7adc3bc5d`。`tests/verify_robot_cockpit.cjs` SHA `21b56788cf72eee248eafbdc123bf91f080f601626827aba498003d0d1360a31`在02:15:42封版manifest后未再改，核心专项/R11专项/60秒/第三全套使用此fixture；原raw仅含8个web asset hash，未伪称有fixture hash。最终root Gate再核当前文件与各层证据。

回滚只撤本轮patch的本人增量，保留其它工作和全部原失败；无Git命令或原进程回收。

## root 最终交付记录

root全文读取独立报告和113/12原始审计，实际执行`.venv/Scripts/python.exe -X utf8 -B work/r11-root-final-gate.py`，2026-10-05 02:34:20 UTC，124项全真/exit0，完整stdout/stderr及退出码在`work/r11-root-final-gate-command.json`。Gate原JSON SHA `f83f82b38389faee078453f72f053f306d07d167329fe93cb90e2c6901019a00`；ReviewImpl SHA `d50808891315b8011b97be56a04439fd3729e9d89bbf681d09c6033b57702ae3`。根验收重新核全部28产品、准确patch、4个fresh Node语法、实际fixture/175回归/连续raw复算/原画质与速度、真实身份层/最终资源和IAB、独立审查及全部失败保全，`release_authorized_scope=true`。

审查输入的impl_report保持封版原文；其中待审查/Gate是作者提交时状态，本节为后续交付终态。审查时impl/delivery/README完整副本与SHA保存在`work/r11-reviewed-inputs/manifest.json`，包括交付报告当时SHA `df846c20009074f35795bf555bc537d1dc8f5220b117db31af6ed8e18d901374`。此后仅coordinator按正式状态维护合同更新README与本报告的交付字段，不改产品、fixture、plan、clarifications或审查输入的作者报告，不把审查时快照冒充后续状态文本。未新增跨功能事实；旧开放事项继续保留，整份feature未迁移或覆盖。
