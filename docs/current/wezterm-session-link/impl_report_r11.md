# R11 实施报告

feature_name: wezterm-session-link  
impl_round: R11  
date: 2026-10-05  
lwplan_version: §14，SHA6595b98915f5cfcba0a9e178617d97d2b17ed567e88d9dac0332b04325ddb294

本报告前半保留实施时记录，末尾追加当前封版验收，旧“待结果”仅为当时状态。浏览器、服务、真实API/IAB均由root以coordinator承接身份单独执行；缺证时分别判未验证。用户持续授权直接实施，fresh Readiness/LW后root实际Gate2为30项/0fail/exit0，`work/r11-root-gate2.json`。当前第三完整fixture已实测1403项/0fail/exit0，fresh ReviewImpl与最终root Gate待结论；不据局部绿宣称全任务完成。

## 变更事实

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| web/robot3d.js | modify | 两个局部batch数组；按原geometry/material分组；机器人代理Mesh用layer1、相机layer0、raycaster0+1；render前同帧matrixWorld上传；拓扑/材质变化重建并dispose，工位静态上传；原步态/粒子/拾取候选保留 | S1-R11 |
| web/app.js | modify | 一处来源分支解释完整原key/年龄/历史/终端条件；既有render路径更新；原生clipboard纯复制；原动作门与请求保持 | S2-R11 |
| web/index.html | modify | scene下原生dl摘要、完整key、复制与既有详情/刷新/历史/工作台锚点 | S2-R11 |
| web/style.css | modify | 局部键与dl换行、窄屏单列、链接焦点 | S2-R11 |
| tests/verify_robot_cockpit.cjs | modify | 原fixture追加实例同帧/对象/释放/三角形、来源与年龄/复制锚点症状，60秒原始间隔/首尾运动画质/轮询；manualFrames刷新用50ms polling修测试死等 | S3-R11 |

新增产品文件：无。新增work脚本/JSON/截图和本轮文档均为验证或交付材料。准确before为`work/r11-before`；产品patch和最终字节manifest为`work/r11-product.patch`/`work/r11-final-manifest.json`，最终封版后再次核对。不改backend/cockpit/vendor/Python tests。

goal_lock_check: G11.1通过批量绘制降低提交，保持真实模型与动作；G11.2根据原互斥选择解释来源和能力；G11.3真实完整新UUID映射由coordinator承接验收，当前待结果。  
anti_goal_touch_check: 无画质/人口/动画降级，无状态猜测，无新fetch/timer/POST/后台/API/锁/年龄/安全门/来源变化；静态与实际功能证据分开。  
authoring_ergonomics_notes: 原part/colored/limbs/home/slot仍可直读；文件内两数组与dirty，没有manager/pool/容量配置或第二套状态机；摘要沿现有element/reasons/事实及原门。 HTML为原生dl/锚点，长键textContent和wrap。  
回滚信息：可直接回滚本轮对应增量；必须基于准确patch只撤自己的改动，不整文件覆盖其它工作或删除红记录。无Git目录，不初始化/commit/push。

## impl-safe 实际自证

`.venv/Scripts/python.exe -X utf8 -B work/r11-impl-local-check.py`：29项/0fail/exit0，4个Node语法命令exit0；完整输出`work/r11-impl-local-check.json`。核5个授权变更、14个原guard/action函数相同、readMessages仅新增展示刷新、无新fetch/timer、原moveRobot/moveParticles/schedule及AA/DPR/192点字句相同、HTML ids唯一与引用存在。owner=root作为唯一impl。缺该证据只能判本地未验证，不能以代码阅读替代。

首次本地checker exit1：函数提取假设无缩进，scene函数match为空触发AttributeError；`work/r11-local-check-first-red.json`保留。仅窄修checker实际缩进/单行函数，没有改产品去迎合检查。

## coordinator_handoff_verifications

| 承接项 / 原因 | evidence_expected | owner | conclusion_if_missing |
| --- | --- | --- | --- |
| Edge隔离全fixture及实例/空间/实际pointer/降级/独立历史/动作守卫；需要浏览器和owned临时服务，非impl-safe | r11-full-fixture-command.json及原完整JSON，必要补用例输出 | root/coordinator | 对应功能未验 |
| 48角色同画质正常播放/轮询60秒；GPU/rAF真实环境，非impl-safe | r11-perf48-after-command.json及完整raw/首尾运动画质 | root/coordinator | 性能未验；未达原样报告 |
| 当前175 Python回归，部分stdio/HTTP测试需要owned服务，归承接层 | r11-python-tests-command.json完整stdout/stderr/exit | root/coordinator | 回归未验 |
| 真正8766新UUID/API/DOM/WebGL/ownerKey/三刷新/实际点选/授权自有两marker历史与IAB截图 | r11-live-webgl-command.json及原JSON/真实格式截图；IAB JPEG/观察记录 | root/coordinator | G11.3相应层未验 |
| 最终diff/manifest/全部红绿/报告 fresh独立审查 | review_notes_impl_r11_1.md及独立静态/复算输出 | fresh reviewer | 不放行交付 |

承接进展：新症状fixture31项/0fail/exit0，`work/r11-feature-green-command.json`；实际960个实例每个与原geometry/material/world矩阵匹配，每key15+5、正常移动、实际draw31092三角形/192点、类别/删增/排序/最终释放；完整key复制与纯锚点零额外HTTP，5–30/>30/缺注册/冲突/workbench unknown禁用。175回归exit0/OK，两条既有Pydantic lifespan warning仍在，`work/r11-python-tests-command.json`。两者均coordinator承接结果，不称impl-safe。完整fixture等其它层仍待结果。

## 已见失败、风险与契约

旧48样本35.1098FPS/p9560.9ms/慢帧19.658%/1025calls保留；本轮before10秒112.30FPS/p9515.6ms不覆盖旧红。before60秒71.805FPS/p9530.2ms/慢帧3.8069%/1025calls，独立target exit1三失败，`work/r11-baseline-target.json`。新--r11首红19项/12失败包含实例/映射候选症状及manualFrames默认rAF polling超时测试缺陷；保留`work/r11-feature-red-command.json`，helper改50ms后重新实测31绿，不把12项全部归产品缺陷。

实际IAB初载观察2FPS/p95428.9ms、随后截图97FPS/p9537.5ms，期间完整fixture并行，都是短窗DOM指标、不作连续性能证明或隐藏；`work/r11-iab-after.jpg`显示完整新key/能力说明。工作台实际出现terminal_action_busy并禁用动作；不停止用户进程、重启服务或放松门求绿。真实8766验证将保存所有观察，不能把历史R10正样本作当前保证。

本轮调研404/不存在路径rg、聚合读取截断均保留，关键输入已定向补读；Cua body Ctrl+Home因未聚焦失败，改全页截图。独立LW reviewer读取语法/首次10秒无raw KeyError与额外虚构标题checker首红42项1fail均保留，纠正检查口径后42项0fail；未改产品或报告迎合假规则。Python日志首次展示截断已补读中段和全部warnings/退出码。

contract_drift_reports: 未发现产品/基线/shared/platform/mirror漂移。唯一root直接实施是本轮用户授权覆盖默认委派选择；验证角色层分别记录。fresh reviewer已预先做只读代码准备，正式终态须本报告及全部承接证据到齐后才生成，不以准备活动替正式ReviewImpl。旧文档PID只作历史。需要审查重点核最终字节、全部失败、draw与性能参考线分判、真实UUID层、来源互斥及能力文案。

未完成与风险：本机单窗口不代表任意硬件/无限时间；尾延迟是否达标待60秒after；旧235ms根因、ready GET与POST非原子、旧owned回收/Q6、Codex正文/实时活动/真实协作继续开放。本批不得顺手修这些范围。无新增跨功能事实。

建议英文提交消息：`perf(scene): batch robot rendering and explain selected session mappings`

## 封版承接追加（2026-10-05）

产品封版只有四web与原fixture五处授权文件；最后产品修正为缺CSRF时能力说明复用原canFocus完整条件、窄屏`.facts.mapping-facts`避免被后面的`.facts`覆盖。原动作guard和动作函数未改。最终本地29项/0fail/exit0为02:15:42 UTC；manifest SHA `0323295e725dc0ef58f85b317f8bbd177183a57ccf549edcf4b95d423f5c6777`，patch SHA `c232164ffb6ddd067fcbc36789b03f8daca7362edc82478d727cf0b7adc3bc5d`，fixture SHA `21b56788cf72eee248eafbdc123bf91f080f601626827aba498003d0d1360a31`。后续专项、60秒与第三完整fixture使用此相同封版；报告raw只含8个web asset hash，fixture字节以这次local manifest及最终root再次核验绑定，不冒充raw包含该字段。

| 承接结果 | 命令证据 | 实际结论 |
| --- | --- | --- |
| 交互核心专项 | work/r11-core-repaired-command.json | 84项/0fail/exit0；明确匹配POST响应后读取最终notice，focused:false/reason=focus_sent_unverified，early/final均显示未核验；回3D实际出现原三metadata GET，无动作/正文 |
| R11新增专项 | work/r11-r11-repaired-command.json | 42项/0fail/exit0；360计算单列/1024三列无overflow、CSRF禁用一致、来源键/历史独立与实例/释放/原31092三角形192点通过 |
| 同条件48人60秒 | work/r11-perf48-after-command.json | 8项/0fail/exit0；9475原间隔59998.6ms，FPS157.920351、p958.3ms、慢帧0.0105541%、83calls；正常7次sessions GET，零正文/POST，首尾48完整身份+48工位/15+5部件、AA/粒子/playing/原速度检查true |
| 真实WebGL新UUID | work/r11-live-webgl-command.json | 整体23项22通过1失败/exit1：仅“每次工作台均正关联”被首workbench_timeout否定；G11.3原key/API/DOM/实际实例/五部件独立工位/三次刷新同home和slot/native点选/来源切换及授权两marker隔离均有当前实测 |
| 最终实际IAB与静态资源 | work/r11-iab-final-observation.json / work/r11-iab-final.jpg / work/r11-final-static-live-command.json | 真实629px窄屏单列/完整本次key/3Dplaying/正文与终端未接入文案可见；短窗165FPS/p956.2ms仅观察。8次同源静态GET exit0，最终各资源实际SHA与磁盘一致；CSS是此前真实WebGL后的唯一产品差异，另以360/1024及真实629窄屏覆盖 |
| 全fixture第三轮 | work/r11-full-fixture-repaired-command.json | 44场景1403项/0fail/exit0，raw02-19-12-702Z；4语法exit0、limitations[]、实际0/12/48短窗分别164.9934/164.9918/164.8889FPS、p956.4/6.4/6.7ms、slow均0、draw17/47/83；不将以下两次失败写成通过 |
| Python回归 | work/r11-python-tests-command.json | 原175tests/OK/exit0；两个IncompleteFieldDefinitionWarning未消除，Python/backend/tests字节未变 |
| 独立ReviewImpl | review_notes_impl_r11_1.md | 当前待终态，全输入就绪才正式放行 |

60秒原始间隔root已独立复算FPS/p95/慢帧，与raw字段相同。本次本机Edge/headless/1024×900/DPR1/rAF+WebGL draw方法与before相同，原每帧遍历观察不减负、画质/人口/播放/轮询不降级。after达标只支持这一个时段；不关闭旧低帧，不宣称任意硬件或无限时间稳定。

### 所有后续红样本保留

- 首完整fixture `r11-full-fixture-command.json`：1392项/1fail/exit1，原“模式切换零API”跨10秒三metadata轮询；测试仅允许原3条GET路径，仍拒绝POST/正文/陌生路径。该次12短窗slow2.0683%、48短窗p9520.7ms/slow1.4409%，都未达参考线。
- 第二完整fixture `r11-full-fixture-final-command.json`：1397项/2fail/exit1，第三focus用120ms settle后断言但未保存notice/响应，不能把该次失败严格断言为竞态；另一项text→3D零API再跨metadata轮询。专项改为先匹配真实fixture响应、记录early/response/final并等最终notice；保留旧红而非改产品成功定义。第二48短窗74.9011FPS/p9551.2ms/slow10.5333%/83calls，仍明确未达；不能被60秒绿覆盖。
- 缺CSRF新增症状 `r11-csrf-red-command.json`：36项/1fail/exit1，旧按钮禁用但新flow说可定位；按需求修复能力一致后42项专项通过。
- 窄屏新增症状 `r11-responsive-red-command.json`：42项/1fail/exit1，360下计算2列；一行局部CSS修正后同用例实际1列，1024保持3列。
- 真实probe首工作台unknown/workbench_timeout（年龄5156ms），随后3次unique_observed不抹去首红；native截图短窗89FPS/p9542.2ms同样不作为稳定绿。
- 上文首checker/首功能红、before60秒target三失败、独立reviewer检查器失败、两个warning及IAB初载低帧、读取/查找/键盘失败均继续保留。pending文件探测不存在亦只是探测失败，不伪造测试输出。

新增独立reviewer checker红：CSRF审计误把合法远端独立历史GET当禁止项，保留首次exit1后修检查口径，未改产品历史行为；最终独立输出由reviewer报告保存。

独立审查与最终root Gate到齐后，再将当前阶段更新为本轮有限交付；范围外235ms、ready GET/POST非原子、旧owned/Q6、Codex正文/实时活动/协作及旧独立BLOCKED仍开放。
