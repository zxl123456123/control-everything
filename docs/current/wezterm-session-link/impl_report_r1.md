# WezTerm 会话联动：后端实施报告 r1

## 基本信息

- feature_name：wezterm-session-link；impl_round：r1；date：2026-10-04（Asia/Shanghai）。
- lwplan_version：r2，SHA `405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0`；基线 `CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830`。
- root正式Gate-2放行后实施。本文只报告S1/S2及其S4后端验证，不代替独立S3/UI报告、root联调或fresh Review(Impl)。
- 作者不运行真实HTTP、SSH、GUI、attach/focus、旧launcher或Git。当前仅local mock/语法证据；runtime验收待root承接。

## 变更事实

| path | change_type | change_purpose / key_changes | related_tasks |
| --- | --- | --- | --- |
| session_panel/workbench.py | add | 一个固定Workbench对象；严格session/client/CIM前后普查、两GUI profile及只读external mux；固定无名attach、5/8/3预算、owned句柄回收和cleanup latch | S1 |
| session_panel/terminal.py | modify | parse_clients invalid→None与真实零分开；挂workbench、共用非阻塞action lock；保留UUID/instance/slot/pane资格、focus动作前后关联核验与5秒deadline | S2 |
| session_panel/gateway.py | modify | 固定GET workbench和严格空body connect POST；原Host/Origin/client/CSRF边界；业务409/launch或timeout503 | S2 |
| tests/test_workbench.py | add | strict profiles/unknown/零多session、stable mux、startup出生、deadline、owned回收/PID复用/间接归属/原handle精确区间负例 | S1/S4 |
| tests/test_focus.py | modify | 有效Workbench fixture；坏/零/多client动作前零调用；动作后client/pane变化仍未确认；锁与refresh list_panes不重入 | S2/S4 |
| tests/test_gateway.py | modify | 新端点临时HTTP用例由root跑；作者只跑不绑定listener的direct-handler两用例 | S2/S4 |

source/service/remote_probe/reader/MCP/图形/CSP不在作者写入范围。独立core差异 `work/wezterm-session-link-core-r1.patch`、清单 `work/wezterm-session-link-core-manifest-r1.json`；当前911新增/34删除，共945差异行，产品491新增/22删除、测试420新增/12删除。Workbench420行超过原估计330，增加的是Windows原handle/出生时间、受限startup过渡与严格失败出口；root已将S1/S2和S3/S4分别保全差异，不删安全条件凑行数。

## 目标对齐

goal_lock_check：G1独立公共状态明确后台/GUI进程/交互client/年龄，counts未知为null，watcher覆盖及GUI可见性不伪造；G2只在唯一当前server且0GUI/0client时固定启动，已连接不启动；G3 focus的原UUID复核继续存在，动作前后增加相同server/GUI/attach/clientID/mux关联核验。

anti_goal_touch_check：N1没有EXITED复活、create、命名/index启动、EnsureTabs、远端输入或D文件修改；LEGACY_GUI仅只读已存在profile。N2不改源/reader/MCP/图形/5秒与30秒，也不接收browser argv。N3无守护器/自制IPC/新依赖/通用配置/扫杀树/自动unlock，不关闭旧机器人缺证或父Q6。

authoring_ergonomics_notes：固定NEW_GUI、LEGACY_GUI与一个external mux profile直接可读，四个注入依赖runner/clock/provider/popen服务mock，不用通用进程图或策略框架。内部身份不入public payload。原list_panes保持不取action lock；refresh持service lock时调用它不会重入同锁。GUI cleanup用Popen原handle；客户端OpenProcess原handle核CIM微秒与精确GUI创建/退出区间，不依PID扫杀。

## 本轮实际impl-safe验证

evidence：`work/wezterm-session-link-core-author-verification.json`保存每次实际argv、UTC、完整stdout/stderr和exit；owner：后端impl作者；conclusion_if_missing：缺输出/exit仅未验证，不给local或runtime PASS。

命令为 `.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_workbench tests.test_focus tests.test_gateway.GatewayDispatchTests -v`，由bytes collector保存输出，末尾真实child exit传回PowerShell，无管道收尾。没有执行GatewayTests临时HTTP或fixture浏览器。

- `0f1e71`：28项，exit0，完整输出已读。
- `a7e578`：补到33项后exit1、1 failure。原server替换时 `_wait_connected`返回新server的fresh状态can_focus=true，connect最终比较原server仍拒绝，但helper口径不够明确。没有省略或删除red证据。
- `e48771`：修成原server/mux变化或GUI退出返回unknown/canfalse，33项exit0；完整输出已读。
- `3c475a`：补indirect attach不杀/不称清理，34项exit0。
- `ff980e`：补native原handle创建时间超GUI精确退出边界，即使CIM微秒仍相同也拒绝kill；35项exit0、0skip，全部输出已读。
- 同一collector用ast.parse真实解析6文件，末轮均无SyntaxError、exit0。仅语法，不宣称real CLI/GUI行为通过。

当前验证SHA `68F9CCF31269E0327EF6F01D9B3B7FB71BCBA2CD8A3A4B13E56F79D47618D272`，core差异SHA `D40E763922F8AEE45A35DE3A821C71DAAF882E4CA778BA1AD4268E8C23E36FCA`，core清单SHA `0D21973DAAC036519F2F782E851DE44C85A3574CCC64CBD44FE81DF3C741146A`。root后续若要求补实施，必须更新证据与hash，不以这里的旧hash冒充新版本。

## coordinator_handoff_verifications

| 待验收 / 移交原因 | evidence_expected | owner / 方式 | conclusion_if_missing |
| --- | --- | --- | --- |
| 原55＋新增全Python、GatewayTests实际临时HTTP | 完整stdout/stderr/exit，坏Origin/CSRF/body/query/重入全部闭环 | root自行执行 | 只作者mock，不给整套PASS |
| fixture HTTP/UI、late/unknown/aging/锁/原图形和reader | fixture报告、requests、DOM实际正负例与360px截图 | root自行执行 | 不证明浏览器行为 |
| fixed hashes与新CIM性能 | 两次完整相关Name普查、marker/server/mux稳定、最早age及deadline时间 | root自行执行 | 不能称真实操作预算可用 |
| natural GUI连接、already-connected不重复、真实UUID分页/focus | 原server/SSH/pane/tab不变、合法direct child、唯一交互client与真实焦点post | root自行执行 | GUI和成功focus缺证，整体runtime未验收 |
| Windows原语及受控post-launch观察失败/real owned回收 | 仅业务observer故障注入；真实Popen/CIM/原句柄退出、晚生child、原server/SSH/pane/mux不变 | root独立Workbench对象，自行执行 | mock不冒充Windows实际/自然平台失败；cleanup_unverified仍BLOCKED |
| final范围/diff/hash、fresh实施review | 与27before及独立UI增量统一的final manifest/patch、完整失败记录、正式review | root＋fresh reviewer | 未fresh审查不交付完成/归档 |

## contract_drift_reports 与失败保留

没有扩大G/N或新用户权限。持续“自动实施＋继续”已由root沿用，不重复技能默认阶段许可；正式Gate保留。锁边界与fixed mux delta按最终LW执行。root提醒startup前后已知GUI/child出生不能混成权限unknown，已仅允许集合单调出生且同server/mux、owned新GUI/full argv成立的8秒内部等待；public仍unknown不可动作，不接受替换/消失/坏字段。

root实际只读初版状态 `work/wezterm-session-link-root-real-observe-r1.json`（作者完整读回）elapsed4859ms、age4858ms、disconnected、can_connect=true；剩余资格仅142ms，不能声称runtime预算可用。root指令将全Win32_Process再Where过滤改为固定WQL SELECT六字段＋四个Name等式，仍完整取得全部相关名字/未知exe，不删前后检查或扩大5秒。优化后的真实耗时由root重新测；若5秒仍不足受控回方案，不调年龄冒充fresh。

root进一步真实只读WQL benchmark `work/wezterm-session-link-root-wql-benchmark-r1.json`已由作者完整读回：三次CIM分别2250/2187/2203ms、各exit0、完整相关行输出保留；完整public_status耗时5016ms、age5015ms，返回unknown/workbench_timeout/can_connect=false/can_focus=false。本轮性能风险成为实际runtime失败，不能给使用体验或真实连接PASS。root正在调研本机已有固定pwsh helper性能；路径变化需要正式窄delta及fresh Gate，作者此刻不改路径、不安装依赖、不延长年龄或预算。

此前root UTF8 text collector发生UnicodeDecodeError、child exit1且stderr丢失，原因无法诊断；成功bytes重跑55项不抹掉失败。readiness旧SHA、GBK采集失败、宽读截断、root字面标题断言失败与retry、源码PS大小写搜索截断及限定补读、纯mux窄普查/rg通配路径exit1及历史无匹配exit1均继续保留在本批输入/根证据，不作为产品成功或进程归属证明。作者预加载组合读取亦发生外层输出截断，随后实际terminal/gateway/source/service/tests和LW主链分块补读，未将被截断内容称完整。

## 未完成、风险与回滚

作者代码自证仅本地范围；真实新GUI direct-child形态、5秒focus与3秒回收预算尚未验证。CIM list-clients覆盖不是client-PID握手，watchers不可见覆盖未验，CLI没有原子expected-instance；产品不宣称这些保证。cleanup未知会latch两action，无自动reset，不能靠重启网关逃避遗留身份；重载会丢原内存index/last_evidence，root必须明确记录。

可直接回滚代码：由root核本批before差异后只撤新增模块/tests与terminal/gateway调用，并与独立UI入口同步；不得restore他人文件或D配置，不因代码回滚kill工作台/SSH/GUI。成功新GUI留用户，失败只按本请求owned身份回收。

建议英文提交信息：`feat: connect the session panel to the existing WezTerm workbench`。

无新增跨功能事实。
