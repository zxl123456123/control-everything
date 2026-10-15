# R11 实施后独立评审（第 1 次）

review_target: impl  
impl_round: 11  
review_seq: 1  
review_date: 2026-10-05（Asia/Shanghai）  
协议结论: PASS  
业务结论: PASS  
goal_lock_alignment: aligned  
anti_goals_touched: none  
authoring_ergonomics_check: pass  
declaration_readability_check: pass  
plan_defect_checkpoint_recommended: no  
plan_defect_checkpoint_reason: 三项目标与授权范围一致，已发现问题均在既有实现点局部修复，不需改写目标、验收或回退。  
impl_safe_validation_check: pass  
coordinator_handoff_check: pass  
基线与澄清一致性复核结果: PASS  
设计味道扫描结果: PASS

本结论仅覆盖 R11 四个 web 文件、原 fixture 增量及本轮报告。未参与 research、计划或实现；先只读审查候选，等待全部承接证据及当前作者报告到齐，最后独立执行完整静态/原始证据复算命令后才形成终态。没有浏览器、HTTP、DB、SSH、进程或 Git 操作，没有递归委派、产品改动或作者报告改写。正式合同来自 development-workflow、plan-review 的 Review(Impl) 与 verification-before-completion；没有豁免审查或新增用户确认。

引用作者报告：[impl_report_r11.md](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/impl_report_r11.md)，同时复核 [交付报告](E:/project-funny/mianban-develop/docs/current/wezterm-session-link/delivery_scene_mapping_r11.md)、README 的当前 R11 段、clarifications §18、lwplan §14、恢复 source material、已审 LW/root Gate2。旧 R10 delivery/review 只用于保留旧边界，不用旧 PASS 代替当前测试。

## 当前字节与独立验证

本轮 reviewer 于 **2026-10-05 02:27:35 UTC** 实际执行：

```text
.venv/Scripts/python.exe -X utf8 -B work/r11-impl-review-checks1.py r11-impl-review-checks1-final.json
```

命令退出码 **0**，**113 项/0 失败**；完整输出已读，未截断。原始审计结果 [r11-impl-review-checks1-final.json](E:/project-funny/mianban-develop/work/r11-impl-review-checks1-final.json)，SHA256 `8ff4c76eaa461c957b5e92223b208ad3c7ac15a90fa6f50a8381940ec8e26735`；审计脚本 SHA256 `053d4441733ab4da8f4f223fb074ccfe26bafcd1b47c9563c57e29985dfa7faf`。此命令逐条解析全部本轮 command/raw 的实际退出码、失败与 limitation，独立复算帧间隔、运动速度、真实 UUID/工位/刷新/点选与历史隔离，重新比较当前磁盘、before、patch、manifest；它不宣称自己重新启动过浏览器测试。

| 绑定对象 | SHA256 |
| --- | --- |
| 当前 28 路径 manifest | `0323295e725dc0ef58f85b317f8bbd177183a57ccf549edcf4b95d423f5c6777` |
| 准确 before→当前 patch | `c232164ffb6ddd067fcbc36789b03f8daca7362edc82478d727cf0b7adc3bc5d` |
| 当前 lwplan | `6595b98915f5cfcba0a9e178617d97d2b17ed567e88d9dac0332b04325ddb294` |
| 当前 clarifications | `5b7fe04e994a55af947aa8d92ca198787f92b78a8af4b6bfe733730e089c848b` |
| 本次输入 impl_report_r11.md | `4718d32053a48cc1c22cb4f3810766f150ee618a8fe197009d0e2446f5dca81b` |
| 本次输入 delivery_scene_mapping_r11.md | `df846c20009074f35795bf555bc537d1dc8f5220b117db31af6ed8e18d901374` |

| 当前授权变更文件 | SHA256 |
| --- | --- |
| web/app.js | `225fe5df6ebc4bd5fcc503760881eef4a2b11b61c22736986e98a3571cfef18d` |
| web/index.html | `6d9e5450e9943ccd9d24bc58cdbbfe3a6af4f58cdc21e8c52999fb33d3e540e4` |
| web/robot3d.js | `4b9a159641cfe866ae294f7ddb3a66976f3260815ae0582ff1da80631be803e3` |
| web/style.css | `d05f9422a47d5ea62f07585b77cd9d900110c8bdf5ed267c21dfe572d61610d3` |
| tests/verify_robot_cockpit.cjs | `21b56788cf72eee248eafbdc123bf91f080f601626827aba498003d0d1360a31` |

28 路径全部与 manifest 相符；逐文件 before 差异严格是上述五处；patch 独立重新生成并与保存文本完全相等。backend、cockpit、vendor、Python tests 与 before 相同。root 02:15:42 UTC 的 local manifest 已包含该最终 fixture；其后核心、新增、60 秒、第三全套使用冻结字节，reviewer 当前再次核实。各 fixture raw 只保存八个 web asset 的 hash，**不声称 raw 含 fixture hash**。

真实 WebGL probe 是窄屏修正前窗口：八个 served asset 与其前后磁盘 hash 一致，其中七个仍等于当前字节，唯一不同为 CSS 的局部 `.facts.mapping-facts` 单列选择器。当前 CSS 另由 360/1024 实际 computed 专项、629px 实际 IAB 与最终八个真实静态 GET 等于当前磁盘补证；第三全套和 60 秒 raw 的八个 asset 全部与当前字节相等。因此没有把旧窗口冒充全部最终字节。

## 与正式目标、澄清及反目标对齐

澄清“未回答”列表为空；§18 持续授权范围明确。目标锁被 impl 遵守，头脑风暴已决事项未违反。来源、性能、真实 UUID 的三条证据链分别闭合；各旧阶段冻结边界保持。README 的 R11 段将当轮结果与 R10/旧独立 BLOCKED 分开，未使用旧状态推导新能力。

| 目标 / 计划锚点 | 实际实现与验证 | 结论 |
| --- | --- | --- |
| G11.1 / S1、S3：降低 48 角色绘制提交，保留原几何、材质、步态、独立空间、拾取与回退；同方法 60 秒 | robot3d.js:189–245 在原运动后上传当帧 matrixWorld，原 geometry/material 分组；真实 960 proxy/instance 同矩阵、每 key 15+5 部件、31092 triangles/192 points；类别/成员/排序/释放、空间/动作/模式/故障回退由当前 44 场景覆盖；60 秒 raw 独立复算 | PASS，支持本机当前窗口 |
| G11.2 / S2：来源一致的五节点、完整原 key、采样/年龄/独立历史/终端条件、纯复制/锚点 | app.js:228–276、449；index.html:42–53；来源互斥、同 UUID 两命名空间、5–30/>30/missing/conflict/workbench unknown、缺 CSRF、旧 reader 页、Codex 晚到隔离与零额外动作；360/1024/629 布局、原生键盘复制和锚点 | PASS |
| G11.3 / S3：本次新 UUID 的真实 API→DOM→实际 WebGL、工位、三刷新、native 点选、截图 | 真实 `codex:01a109a3-2890-7531-805b-6ed67edb5d5d` 的实际 instance 与原 proxy geometry/material/world matrix 匹配；独立 ownerKey 五部件工位；3 次正常播放刷新同 mesh UUID、slot/home；native Codex→授权 remote→Codex 隔离；最终 IAB 原完整 key | PASS；工作台持续正关联不在已证范围 |

反目标禁止项逐条核验：

| 禁止内容 | 可核查证据 | 结论 |
| --- | --- | --- |
| N11.1 暂停、降人口、降几何/材质/AA/DPR/粒子/巡游速度求性能绿 | before 对照 moveRobot/moveParticles/schedule 与 pointer 区段不变；robot3d 原 AA/DPR≤1.5/192 点；60 秒首尾各 48 完整 robot+48 station、playing、AA、15+5、原粒子尺寸/透明度，逐 key 实际 travel/秒保持原 cruise 容差；原每帧观察 traversal 未减负 | 确认未踩中 |
| N11.1 隐藏历史/本轮失败，或用截图/短窗替连续性能 | 所有 command 退出码与 raw 失败清单独立一致；旧 35.11/60.9 与 before 三参考线失败、两次全回归失败及各短窗未达均在两报告保留；9475 原始间隔独立复算 | 确认未踩中 |
| N11.2 用动画、updated_at、同 cwd 或粒子推忙闲/完成/协作/绑定 | Codex 原验证 `activity_state/task_completion=unknown` 不变；app.js:259–263 明示未知、正文/绑定未接入、不按目录猜位置、巡游不代表工作；实际来源切换/同 UUID 及晚到隔离测试 | 确认未踩中 |
| N11.3 修改 backend/API/采集/身份/锁/年龄/预算/CSP/CSRF/POST 成功定义 | backend/cockpit/vendor/Python tests hash 与 before 一致；app 的 current/eligible/terminalReady/canConnect/validWorkbench/validCodexPage/focusSession/connect 原区段不变；app.js:233 新 flow 复用原完整 canFocus 含 CSRF，334–335 原按钮门保持 | 确认未踩中；仅补齐描述 |
| N11.3 新 fetch/timer、自动点动作、重试 POST 或靠新查询刷新映射 | app fetch/query 数量不变；摘要沿既有 render 路径；原生 href/clipboard；核心切换只允许原三 metadata GET；真实 probe 所有 request GET、零 action/body 越权 | 确认未踩中 |
| N11.3 未授权正文、更多用户聊天、用户进程操作、Git 初始化 | fixture 为隔离合成数据；真实只观察固定授权 remote `0990a0a5-a375-4bef-85ef-0ae23ee5ad74` 一次必要历史，2 条/count+marker、回 Codex 清空；真实脚本无 state 注入/POST/资源替换；本轮 root/作者记录未创建更多聊天或操作用户进程，无 Git；reviewer 无此类调用 | 确认未踩中 |
| 顺手修旧后台问题或以本轮通过关闭旧边界 | 235ms 原因、ready GET/POST 非原子、旧 owned/Q6、Codex 正文/实时活动/真实协作及旧独立 BLOCKED 明列开放；真实 workbench timeout/busy 未隐藏 | 确认未踩中 |

作者体验与声明可读性均 pass：原 part/colored/limbs/home/slot 仍为读写入口，只加文件内两个 batch 数组和局部 dirty，未引入 manager、pool、容量参数或第二套状态机。摘要用原 element/facts/reasons/资格门及原生 dl/锚点，来源分支顺读可理解；测试沿原 check/scenario/requests。设计味道扫描 PASS：未发现需阻断的新抽象、重复身份系统或过度设计。

## 实际证据与责任分层

### impl-safe 已执行记录

owner 为 root/唯一 impl。`work/r11-impl-local-check.json` 实际 29 项/0fail/exit0，四个 Node syntax 子命令 exit0、stdout/stderr 空；绑定上述最终 manifest/patch。reviewer 独立核其完整结果、实际当前字节和原 guard/motion 区段，而非采信“本地绿”一句话。本地 checker 首次 AttributeError 另行保留。

### coordinator 已承接记录

owner 为 root/coordinator。浏览器、真实服务、GPU/rAF、stdio/HTTP 回归均明确属于承接层；没有将它们写成 impl-safe 已完成。作者报告对缺证责任、产物与缺证结论明确，封版追加已反映结果。

| 承接记录 | reviewer 核实的实际结果 | 证明边界 |
| --- | --- | --- |
| r11-core-repaired-command.json → raw 02-15-46-361Z | 84/0/exit0；exact POST 响应 `focused:false/reason=focus_sent_unverified`，early/final 均未核验；回 3D 捕获的三条 GET 都是原 metadata | 当前交互与动作描述；没有真实生产 POST |
| r11-r11-repaired-command.json → raw 02-17-03-763Z | 42/0/exit0；360 实际 1 列、1024 实际 3 列、均无 overflow；CSRF 描述/disabled 一致、实例/释放/完整 source key/复制锚点/独立历史 | 当前新增功能症状 |
| r11-full-fixture-repaired-command.json → raw 02-19-12-702Z | 44 场景、1403/0/exit0；4 syntax exit0、limitations[]、blocked[]、browser_closed、fixture code0；所有失败 check 与声明清单一致；8 assets 当前 hash 相同 | 当前全量隔离 fixture，包括原守卫、生命周期、全部回退、空间、实际点选、历史、Codex 分页/异常/晚到隔离 |
| r11-python-tests-command.json | 175 tests /25.790s/OK/exit0；173 inline ok+2 separate ok，2 个 IncompleteFieldDefinitionWarning，完整日志已核 | 当前不变 Python/backend 回归；warnings 没有消除 |
| r11-perf48-after-command.json → raw 02-17-45-259Z | 8/0/exit0；9475 intervals、59998.60000000149ms、7 sessions GET、零正文/POST、原画质/速度/48+48 | 同方法本机单个可见 60 秒窗口 |
| r11-live-webgl-command.json → raw 02-03-14-369Z | 23 项22通过1失败/exit1；精确 key、API/DOM/同帧 instance/5parts ownerKey/3 refresh/native pick/2-marker history 隔离成功；首 workbench_timeout age5156ms，后3 unique | G11.3 成立；持续工作台正关联未成立，整体不全绿 |
| r11-final-static-live-command.json / r11-final-static-live.json | 8 次真实同源静态 GET/200/exit0，actual/disk/current 三者 SHA 相同，原 command stdout 与保存 JSON 相同 | 最终八个资源字节 |
| r11-iab-final-observation.json / r11-iab-final.jpg | 真 IAB 629px、单列、page_width612、完整新 key、3Dplaying、能力未知文本；JPEG magic/hash 已核并目检；165FPS/p956.2ms | 最终页面展示；截图与短窗不代替行为或连续性能 |

### 性能独立复算与限制

复算采用 `FPS = intervals数量 × 1000 / sum(intervals)`、p95 排序取 `ceil(0.95N)-1`、慢帧 `interval>33.3ms` 比例；所有带 raw 的样本都复算，与原字段一致。早期 10 秒 before 没有原间隔，只作保留的报告样本，不伪称复算。

| 48 角色窗口 | FPS | p95/ms | 慢帧比例 | calls/frame | 判断 |
| --- | ---: | ---: | ---: | ---: | --- |
| 旧历史 | 35.1098 | 60.9 | 19.658% | 1025 | 历史失败保留 |
| 本轮 before 60 秒，4308 intervals | 71.805026 | 30.2 | 3.806871% | 1025 | p95/慢帧/draw 未达 |
| 首全回归 10 秒 | 104.014708 | 20.7 | 1.440922% | 83 | p95/慢帧未达 |
| 第二全回归 10 秒 | 74.901131 | 51.2 | 10.533333% | 83 | p95/慢帧未达 |
| after 60 秒，9475 intervals | 157.920351 | 8.3 | 0.01055409%（1/9475） | 83 | 此窗口 FPS≥60/p95≤20/slow<1%/draw≤128 均达 |
| 第三全回归 10 秒 | 164.888942 | 6.7 | 0% | 83 | 仅该短窗达标 |

首全回归 12 角色 slow2.068345% 未达也保留。第三全回归 0/12 的 FPS164.993400/164.991750、p95均6.4ms、slow均0、draw17/47；这些不混作 60 秒证明。before/after 都是 Edge/headless、1024×900/DPR1、真实 rAF/WebGL 调用、正常轮询，原观察 traversal 未减负。after 的逐 key travel/秒0.670062–0.750068与各自原 cruise 容差相符，首尾 backing 一致、192 点仍运动。降低 1025→83 提交成立；单个本机 60 秒达标成立；任意硬件、IAB、并行负载或无限时间稳定没有证明。native89FPS/p9542.2ms、IAB初载2FPS/p95428.9ms/后97FPS/p9537.5ms/最终165FPS/p956.2ms均为短窗，全部保留。

## 已见缺陷、修复和原始失败保全

当前没有剩余阻断 finding。审查准备期间两个可操作的局部问题已有原症状 red→修复→专项与最终全套验证，均无新决策：

1. flow-terminal 原描述漏 CSRF：按钮 disabled 但 flow 说“可定位”。`r11-csrf-red-command.json` 36/1fail/exit1。app.js:233/249 只让 flow 复用原完整 canFocus；原 action gate 未改。42 专项/1403 全套当前字节均覆盖缺凭据负例。
2. 窄屏 mapping-facts 被后续通用 facts 两列规则覆盖。`r11-responsive-red-command.json` 42/1fail/exit1，360 computed实际2列。style.css:33 只加 `.facts` 限定，提高该局部选择器优先级；42 专项和1403全套分别证明360单列/1024三列，最终真实629 IAB亦单列。

其它原失败不删、不重写成通过：

| 原记录 | 失败事实 / 后续判定 |
| --- | --- |
| r11-baseline-target.json | exit1，before 60秒 p95/慢帧/draw 三失败；原采样4/0/exit0只表示采样完成 |
| r11-feature-red-command.json | 19项12失败/exit1，含真实实例/来源摘要缺失症状及 manualFrames 下 rAF polling timeout；helper 只改50ms polling；31绿不把12项全部归产品 |
| r11-full-fixture-command.json | 1392/1fail/exit1，模式切换“零任何API”断言跨原10秒轮询；实际只有原 sessions/workbench/codex 三 GET。改为允许这三GET仍禁 POST/正文/未知API，原失败和性能limitation保留 |
| r11-full-fixture-final-command.json | 1397/2fail/exit1；未核验 focus notice 当次未存响应/notice，原因不能严格定为竞态；文字回3D“零API”另跨原轮询。当前仅修测试等待响应/最终 UI 并保存 early/response/final；动作成功定义不改。84专项及1403全套支持当前行为，不抹去旧失败 |
| r11-live-webgl-command.json | 首 workbench_timeout age5156ms 使“每样本正关联”失败，随后3 unique不覆盖；这是旧后台能力边界、非R11 G11.3必须持续正关联要求。不会扩修后台、增加预算或重跑选绿 |
| 本地/读取/键盘工具失败 | 作者 checker 缩进提取 AttributeError；调研404/不存在路径rg、读取截断后定向补读、IAB Ctrl+Home未聚焦、pending文件探测不存在；均保留，不当作产品测试通过 |
| 175 Python日志 | 两个既有 lifespan unresolved forward reference 的 IncompleteFieldDefinitionWarning；不是本轮已修复 |

reviewer 自身检查失败也保留：`r11-impl-review-checks1-tool-red.json` 首次在旧10秒缺 raw 时 KeyError；`-first.json` 的 canFocus alias 和 CRLF/warning 匹配误判；`-recheck.json` 的173 inline+2 separate ok误按174+1；`-static-perf.json` 新 CSRF 审计错误禁止合法 fixture remote 的独立历史 GET，exit1。只修 reviewer 检查口径，未要求产品禁读历史或迎合虚构规则；各中间 JSON 留存。部分聚合工具输出截断，关键事实已定向补读，最后113项完整输出无截断。旧 LW checker 的读取语法/KeyError/虚构标题失败亦由现有输入保留。

## 偏差、契约与后续动作

实现相对 lwplan 没有目标形态漂移。窄屏与 CSRF 修正处于 S2 既定验收；原时序/零API断言的窄修处于 S3 允许的 fixture 修正，严格保留失败并实际复验。角色分层明确：唯一 root 的用户授权实施与 coordinator 承接记录分开；fresh reviewer 只读当前产品与 raw、独立执行本地复算。未发现 shared runtime / 平台入口 / 基线 / 镜像的本轮 drift、stale 或 mirror mismatch；前半作者报告的“待验”已明确标成历史记录，以封版追加为当前状态。

证据不足约束仍是：真实 workbench 持续正关联不成立；旧235ms根因、ready GET与POST非原子、旧owned失败回收/Q6、Codex正文/实时活动/真实协作、旧独立BLOCKED均未完成，不能因本次PASS关闭。本轮不需要新增用户许可或专业验收转交。

允许 root 核当前报告和 manifest 后进入 **Archive/本轮有限交付**；无 Git 目录，PR/commit/push不适用。若之后产品或计划发生修改，本报告的字节绑定不能覆盖新修改，须相应重新验证与审查。建议英文提交信息（仅建议，不执行）：`perf(scene): batch robot rendering and explain selected session mappings`。无新增跨功能事实。
