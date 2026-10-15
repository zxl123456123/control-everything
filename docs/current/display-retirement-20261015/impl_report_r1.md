# 展示退役实施记录 r1

受众：共享。`feature_name: display-retirement-20261015`；`impl_round: 1`；`date: 2026-10-15`；`lwplan_version: SHA256 C5B2070260440BE3772A53A144D6FCC96DABB26879B2AF9741056B59D42071B9`。

状态：本地验证通过，独立终审待报告。S1 产品退役及 S2 测试迁移已落盘，本地自证及coordinator两套浏览器回归均已执行；独立实施审查和 Git 清理提交尚待收口。此报告不代表真实远端/终端或运行中服务已验收。

## 变更事实

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| `web/cockpit.js` | delete | 删除模式管理、像素canvas、回退、图形监听与导出 | S1 |
| `web/robot3d.js` | delete | 删除Three场景、巡游、粒子、拾取、帧率和资源管理 | S1 |
| `web/vendor/three-0.186.0/three.module.js` | delete | 移除仅图形使用的固定依赖模块 | S1 |
| `web/vendor/three-0.186.0/three.core.js` | delete | 移除仅图形使用的依赖核心 | S1 |
| `web/vendor/three-0.186.0/LICENSE` | delete | 随不再分发的依赖删除本地许可证副本，历史来源不改 | S1 |
| `web/index.html` | modify | 删除图形入口/控制；证据区保留；真实协作摘要和角色按钮移入garden-panel | S1 |
| `web/app.js` | modify | 删除cockpit/selectRobot/renderCockpit调用链；身份摘要节点改名；业务选择与资格函数保留 | S1 |
| `web/garden.js` | modify | 删除onView/getView/sceneHeading和像素span；内部owns、同根隔离、收据和按需公开发言保留 | S1 |
| `web/style.css` | modify | 删除图形/人物/粒子动画；证据静态连线、焦点和响应式保留；garden信息区占首行 | S1 |
| `session_panel/gateway.py` | modify | 只删5项图形静态白名单；业务路由未改 | S1 |
| `tests/verify_robot_cockpit.cjs` → `tests/verify_session_panel.cjs` | rename + modify | 删除纯图形场景，迁移业务检查到DOM完整键/类别/aria-pressed及实际请求 | S2 |
| `tests/verify_garden.cjs` | modify | 保留独立业务场景，补完整index/app/garden挂载、两视图和4张截图，移除图形断言 | S2 |
| `tests/test_gateway.py` | modify | 保留存活静态资源字节/安全头，新增全部退役资源404及无业务调用 | S2 |
| `README.md` | modify | 当前使用说明和测试入口反映原生列表；链接当前进度及首次检出example复制说明；用现存workspace测试替换未入Git的旧work脚本；保留业务限制 | S3 |
| `docs/DEVELOPMENT_STATUS.md`、本目录 `README.md` | modify | 基线提交及本轮待验状态，不改历史feature结论 | S3 |
| 本文件 | add | 记录实施事实、证据责任与失败/限制 | S3 |

5个资产及旧harness删除前逐个验证绝对路径位于工作区且为Git已记录文件；未递归删除目录。未修改或暂存并行 `project-progress-compat-20261014` 的 README、lwplan、review。未commit/push。

## 目标与测试覆盖对应

`goal_lock_check`：G1 清理前基线 `4d32f6e` 已由coordinator提交推送，当前说明保留已实现与未验收边界；G2 5个专用资产、5条路由、所有加载/渲染/人物/粒子链移除；G3 recordView/current/eligible、消息/动作API及garden内部校验和收据状态不改。

`anti_goal_touch_check`：未新增框架、适配器、开关或数据迁移；不以隐藏冒充删除；未碰身份、CSRF、权限、后端业务协议、未指定业务或并行feature；未操作真实远端、模型或运行服务。

`authoring_ergonomics_notes`：原生button/details和稳定业务节点继续表达选择与详情；所有图形提示改为身份/证据用语。测试内 `identityView` 只读实际DOM，类别按完整ID比较，不把分组DOM顺序当原始数组顺序。

| 旧场景 | 现行对应 |
| --- | --- |
| basicBehavior、classification、epoch、apiFailures、unknownRegistrationFocus | 原名称保留，验证读取/分页、四类证据、晚响应、陈旧/未知及禁用控制；图形视图捕获改DOM |
| workbenchBehavior/Failures/Pending | 原名称保留，连接资格、重复连接、未知字段、动作锁、回收latch与晚到证据保留 |
| mappingEvidence/WithoutCsrf/Responsive | 原名称保留，完整键复制、能力边界、证据年龄、布局与链接保留 |
| codexIdentity/Failures/LateResponses | 原名称保留，图形拾取改为原生点击，命名空间/分页/过期/畸形/晚响应仍测 |
| 图形失败/模式/像素拾取/WebGL/巡游/性能/批渲染/视锥 | 随专用实现删除；增加零图形资源请求、零canvas/人物节点、退役地址404 |
| garden原17场景 | 收据、隔离、公开发言、隐藏取消、摘要折叠/公告去重、角色>4与键盘焦点保留；首屏几何改测真实角色 |
| 新完整garden首页场景 | 真实index/app/garden加载、合法bootstrap根、按需发言、两视图切换、桌面/窄屏截图 |

## 实际验证与证据

| 验证 | owner | 本轮实际结果 / evidence | conclusion_if_missing |
| --- | --- | --- | --- |
| `python -B -m unittest discover -s tests -q` | impl | 320项，41.270s，退出码0；完整输出 `work/display-retirement-unit.log` 已读，Pydantic警告保留 | 单元回归未验证 |
| `node tests/test_execution_ui.cjs` | impl | 24条纯Node契约检查，failure:null，exit_code:0；完整工具输出已读 | 执行UI契约未验证 |
| app、session harness、garden harness `node --check`；garden模块stdin `--input-type=module --check` | impl | 退出码均0，完整输出已读；未运行浏览器 | JS语法未验证 |
| 5产品面活引用与5资产缺失断言 | impl | app/garden/index/style/gateway无robot/cockpit/onView/getView/three/animation活引用，5资产不存在，退出码0 | 退役链未核清 |
| `git diff --check` | impl | 退出码0；LF/CRLF提示保留，无空白错误 | 差异格式未验证 |
| `node tests/verify_garden.cjs` | coordinator | 18场景、failures空、exit_code0；`work/garden-browser-2026-10-15T05-35-47-352Z.json`。impl另读JSON并核对4截图文件存在；coordinator已目检1280/360两视图 | 页面与布局未验证 |
| `node tests/verify_session_panel.cjs` | coordinator | 440检查/17场景、539请求、零blocked、正常cleanup、exit_code0；`work/session-panel-fixture-2026-10-15T05-35-47-384Z.json`。impl另以UTF-8读JSON核对全部checks和失败列表 | 会话回归未验证 |
| 独立全量单元与数据保全核验 | coordinator | 320项/40.897s/exit0；`work/display-retirement-root-unit.log`；本批diff检查exit0，3份本机配置/手工数据SHA与改前一致 | 独立核验/数据保全未验证 |

完整首页截图在上述JSON的 `screenshots`：`display-retirement-garden-1280`、`observations-1280`、`garden-360`、`observations-360`，共同时间戳 `2026-10-15T05-35-47-352Z.png`，均位于本机 `work/`。coordinator反馈人物消失，摘要/角色/详情保留，无明显遮挡或横向溢出；该目检归属coordinator，不算impl自行浏览器验证。

coordinator另已运行未改工作台101项和执行浏览器76项，均exit0；证据 `work/agent-execution-20261013/ui-fixture-2026-10-15T05-23-03-810Z.json`、`ui-execution-fixture-2026-10-15T05-31-49-084Z.json`。这些回归不代表真实模型执行验收。

## coordinator_handoff_verifications

- 两套浏览器验证已由coordinator承接，证据见上表；未由impl自行执行浏览器或真实环境动作。
- 独立最终审查与Git范围核验/commit/push。owner：coordinator及独立reviewer；evidence_expected：最终diff、双结论报告、明确暂存清单、origin/main..HEAD与远端HEAD；conclusion_if_missing：不能称交付完成。
- 运行服务加载、真实远端定位/模型、客户端可见性不在本轮范围，无须借本轮制造验收结果。当前旧历史限制继续成立。

## 失败、漂移与剩余风险

`contract_drift_reports: none`。Readiness/Gate-2、代码与基线一致；未发现需改方案的接口冲突。并行feature文件由其作者维护，不纳入本批。

本轮观察过的失败/限制均保留：研究/规划宽读取截断后定向补读；规划误读不存在的 `docs/DOCUMENTATION_CONVENTIONS.md`，随后找到并读取实际 `docs/Docs.Maintenance.Conventions.md`；初次展示删除脚本留下单行robot-canvas CSS，后续静态检查定位并在浏览器运行前删除（中间态遗漏，非最终失败）；coordinator首次读取session JSON省略encoding，出现GBK UnicodeDecodeError/exit1，改显式UTF-8后读取exit0；Pydantic lifespan与Git LF/CRLF提示未顺手修复。Git准备阶段初始非仓库/CLI未登录和模板提取失败见本目录README，不在此抹去。当前单元/语法及两套浏览器实际结果无产品测试失败，仍待独立审查与提交。

回滚信息：可直接以本批独立Git提交的新增revert回退源码；需由coordinator确认工作区并行改动，禁止reset/clean/强推。未部署、未改数据，无运行态迁移回滚。审查重点是DOM业务覆盖未因删除图形测试而缩水，以及完整首页两视图接线。

英文提交建议：`refactor(ui): retire decorative session rendering`。无跨功能事实。
