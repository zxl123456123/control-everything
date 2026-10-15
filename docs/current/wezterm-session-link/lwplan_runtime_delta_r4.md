# WezTerm 会话联动：既有命名连接只读识别 r4

2026-10-04；规划路径，T3窄修订。唯一本文覆盖 S1观察profile/配对、已研究当前Lua固定pin与S4对应测试，其余合同继续消费冻结r2＋r3.1；不改旧clarifications/research/LW/review字节。作者Gate-1 PASS（只读自证见§6），fresh Gate-2 PENDING，root独立Gate1与freshReview(LW)后才实施。用户“自动实施＋继续”的现有固定工作台绑定授权持续，无需重新问同一实施许可。

## 1. 本轮修订说明、事实与输入

[修订: PLAN_DEFECT-R4.1] root真实默认native采样109–125ms、六字段现有规范化与CIM一致；`work/wezterm-session-link-root-native-runtime-r31.json`仍**exit1**：完整观察187–203ms却unknown，两动作false，断言“all five complete observations fit original budget and are actionable”失败。实际GUI/child使用固定named attach无create/force，未命中旧两profile。采集器速度已改善不等于当前关联可用；报告第四项失败后未执行后续生命周期部分，不能拿其scope标题当已验helper超时。

| 冻结输入 | SHA-256 / 用途 |
| --- | --- |
| clarifications.md（含§11） | CBABB6F7527B7DFBBA37DEEB086841AACBDD164AE857FE5D81D1EED7535A9830；原G1/G2/G3与N1/N2/N3 |
| lwplan.md r2 | 405FDE8E546B5D516D507802832A64D23AC8854AA5D11A2EC64EC33766E7C9E0；完整主链保留 |
| lwplan_runtime_delta_r3.md r3.1 | AEB72C017FF60D4E370E00BA420DF250D3774A4C72E5627060A9025A8DAB8EFF；native/helper全部不动 |
| review_notes_lwplan_runtime_r3.md | A8C272C89BC2478482ED52D6C7F3333CECA3EBEEFD641D98071CE8B44C4F0531；只放行旧r3.1，不放行r4 |
| root-native-runtime-r31.json | 784184EABA3C866F1D10188D0219AE4DBDE0EFA5B6465FD0EA239F86DB68A171；本次实际反例（完整路径见首段） |
| research_attach.md / impl_native_r31.md | 前者冻结F4EC50D8645F75B1AFA4771C1B35047B84701DA4FDBD405683746C62D8DF501C；后者3A7976D003ACC7B3A8F07A44AA7DF7D621A5ABBF2D487A8514A96B86864D9E50，当前已实施结构与局部验证，不改 |
| work/wezterm-session-link-root-existing-gui-r4.json | 7FF2EEA0AFE59FB12C8A68EED5080131252827A0CE75ADABA4467667D4DF5577；fresh身份稳定、Lua mismatch exit1 |
| work/wezterm-session-link-root-lua-current-r4.json | 158EC33D759F8FC03FF9AC3F0BE8475F2E7EBF944D46945B454E5E7D2740A732；两侧全文/metadata/hash/diff，作者53dc69完整补读 |
| work/wezterm-session-link-root-native-helper-r33.json | 1B395366CD417994FE994C75403272A2B65A18D348F822D4465D7F1BF8294D1E；root受控helper生命周期7/7/exit0，作者700f65完整补读 |

root样本（不硬编码PID/时间作为配置）：GUI PID18696、ParentPID212724、created `2026-10-04T04:01:37.0253479Z`；Zellij child260364、direct parent18696、created `2026-10-04T04:01:38.0335151Z`。完整EXE/path/argv均由上面raw rows给出。relatedNames过滤后的rows不证明GUI父已退出，只要求其ParentPID字段完整，不要求父存活或推断其历史来源。root实际source_only CLI `1329d8/exit0`，list-clients header＋唯一CLIENT_ID1/pane terminal_16；这是root当前观察，非PID映射/永久事实。原server5612和fixed mux44644仍须每次fresh核，不按本样本永久信任。

这是原基线“仅两组既有profile、其余named拒绝”的**受控局部例外**：root根据用户绑定已有固定工作台目标明确决定仅增加下面第三组严格只读profile；原文件不静默改写。不是新增named启动权限，也不能把已有GUI视为本请求owned或可关闭。GUI已存在时不能假装disconnected、关闭用户窗口或启动第二窗口来凑验收。

contract_drift / stale / mirror mismatch：冻结CBABB决策6/§10的“两profile”文字没有第三named-only，当前确已过时；只有本文经当前双Gate后成为限定只读识别补丁权威，不宣称旧基线已有third，不更改G/N、新启动/owned权限。root新fresh样本 `work/wezterm-session-link-root-existing-gui-r4.json` / `d9747f exit1` 发现Lua实际hash从旧5F903...6A74C变为`8E045225A327BC658A59791609CCF2086A7CC5BDEA3B366C4DBB65F9966E7CC4`；EXE/KDL仍匹配，旧integrity正确拒绝该漂移。root随后完整只读当前Lua（e58578）和appearance-comfort-20261004备份（b3181f，完整hash精确旧pin）比较，确认仅line_height、窗口字号处理、背景opacity、padding/colors/tab/selection外观差异；defaultcwd/prog/keys/Yazi/format-title与本次start显式子命令保持。root据此解除事实HOLD并裁定将当前完整8E045 hash作为此次唯一固定配置基准，不接受任意hash，不改/restore D配置、不猜修改来源。作者已完整补读两侧diff/metadata与r33；真实focus还须实施后fresh integrity，当前不是业务PASS。

## 2. 核心链路总览与research映射

现状 `_rows`完整native六字段→Windows argv/微秒规范化→`_classify`仅NEW/LEGACY→named-only既有GUI异常→observe unknown；完整Lua漂移又使原integrity正确拒绝动作。落点仅精确只读GUI/ATTACH分类、observe配对expected，以及已研究当前Lua固定PINS值；原双采样full identity/fresh资格→connect已连接零Popen→原UUID/focus链继续使用。terminal/gateway/UI/source/reader/MCP/3D/CSP、D盘fixedLua字节、NEW_GUI、owned函数、native模块/helper/解释器选择均不改；理由是当前缺口只有既有profile识别和已取证固定配置基准更新。

| 事实 / 机制 | 实现锚点 | 验证与口径 |
| --- | --- | --- |
| 当前固定GUI argv是named-only；direct child同名fixedattach | S1Δ第三profile与matched expected | S4Δ完整正例/错argv父子负例；真实existing already-connected无新Popen |
| GUI ParentPID完整，child仍direct GUI且出生更晚；filtered rows不证明父退出 | S1Δ完整ParentProcessId值保留，不要求GUI父活着、不遍一般祖先 | mock absent-launcher正例/错误directparent反例；不推断GUI历史来源 |
| named attach仍可能Resurrect/前缀选中，不是only-running启动入口 | NEW_GUI与ownedcleanup不变 | 精确只读识别不执行该argv；启动仍unnamed |
| list-clients无PID/type/watch字段、采样不原子 | 原public/same_association保持 | unique_observed、watcher_count=null、gui_visibility=unverified，非client-PID握手 |
| native短耗时却业务unknown；当前用户窗口不可杀 | S1Δ分类收口；S4Δ分开既有/新启动验收 | 保留runtime exit1与新启动/ownedcleanup缺证，不给整套PASS |
| Lua实际8E045与旧5F903 pin不同；新旧仅外观差异由root完整只读取证 | S1Δ只更新PINS[WEZTERM_LUA]为单一完整已研究hash | S4Δ固定pin/mismatch拒绝mock＋root fresh实际integrity；不改D配置/不信任任意hash |

参考已读固定Zellij v0.45.1源码research与 [官方Resurrection说明](https://zellij.dev/documentation/session-resurrection)：named attach可复活，因此只读既有识别与运行权限必须分开。采用 [WezTerm start](https://wezterm.org/cli/start.html) 的固定PROG/always-new-process/cwd完整argv解释；不采用标题/cwd单字段、任意manual/named、contains或通用profile配置。不重新设计IPC/原子instance pin。

## 3. S1Δ：精确既有profile观察

#### 本轮修订说明

[修订: PLAN_DEFECT-R4.2] 目标是让当前合法既有连接可观察且零新启动；消费G1/G2/G3、N1/N2/N3。只改 `session_panel/workbench.py` 的固定constants、`_classify`、`observe::expected`与PINS[WEZTERM_LUA]唯一值（预计约16–31产品行，必须≤100产品行）；输入仍原六字段规范化rows/CLI，输出仍原public/state/association，不新增API字段或用户配置。首review落点为三组GUI→ATTACH精确配对及已研究完整Lua固定pin。

```python
PINS[WEZTERM_LUA] = "8E045225A327BC658A59791609CCF2086A7CC5BDEA3B366C4DBB65F9966E7CC4"
# Update the existing dictionary entry only; keep integrity() fresh and exact.
OBSERVED_GUI = [WEZTERM_GUI, "--config-file", WEZTERM_LUA, "start", "--always-new-process",
                "--cwd", WORKDIR, "--", ZELLIJ, "attach", ZELLIJ_SESSION]
OBSERVED_ATTACH = [ZELLIJ, "attach", ZELLIJ_SESSION]
# _classify: fixed GUI EXE + exact NEW_GUI / LEGACY_GUI / OBSERVED_GUI only.
# Fixed Zellij EXE attaches: original unnamed/legacy, plus exact OBSERVED_ATTACH.
# observe, after len(guis)==len(attaches)==len(clients)==1:
if profile(gui["argv"], NEW_GUI):
    expected = [ZELLIJ, "attach"]
elif profile(gui["argv"], OBSERVED_GUI):
    expected = OBSERVED_ATTACH
else:  # _classify has already proved the only other exact LEGACY_GUI profile.
    expected = [ZELLIJ, "attach", ZELLIJ_SESSION, "--create", "--force-run-commands"]
```

GUI Name/EXE/config/cwd/每一argv精确规范化匹配，Zellij Name/EXE同样固定；paired child ParentProcessId==GUI PID且created>=GUI created，named child只能配OBSERVED_GUI，不能借NEW/LEGACY误配。GUI自己的parent数值完整即可，不要求已经退出的启动器活着；不看标题、可见性或历史launcher，不放宽为任意祖先。坏/缺字段仍整次unknown、counts null；extra flag/另一name/path/部分argv拒绝。

执行：按两侧完整只读证据更新现有Lua pin唯一值→增加两constants→分类接受这唯一pair→observe选择三组expected→S4Δ自证。integrity()仍每次动作fresh核完整EXE/KDL/Lua；Lua不是当前精确8E045或任一其它pin不同即拒绝，绝不根据GUI argv/profile跳过hash。所有GUI/child/server/mux完整fingerprints仍前后fresh稳定，唯一active固定session/marker/server原实例、唯一interactive、最早age≤5s/no transition/no latch才unique_observed与can_focus；不能据匹配argv alone放行。connect沿原已连分支 `connected=true/launched=false/status=unique_observed/cleanup=not_needed`，零Popen、零cleanup、`_owned_gui`不变；API保持原语义。新启动始终NEW_GUI unnamed；旧LEGACY只读；OBSERVED_GUI永不传Popen。

`_wait_connected/_cleanup_owned/_terminate_client`原owned NEW_GUI/unnamed exactattach和创建退出区间完全不改，不把新named pair算owned、不杀用户窗口/子进程/server/SSH/mux/conhost/一般树。3s未知cleanup仍latch两动作，无解锁端点；observe5s/launch后8s/focus pre-action-post5s/UUID30s、共享action_lock/原list_panes不重拿锁均保持。

验收：正例唯一观察＋重复connect zero-launch/cleanup；所有错pair/未知/替换/额外client均false，完整Lua mismatch拒绝，NEW_GUI/owned函数字节无差异。回滚仅撤这第三profile、新增测例与本次Lua pin更新（旧pin恢复将对当前Lua拒绝动作，是明确降级）；不回滚native或他人产品，不改D配置/关闭既有GUI来恢复零状态。依赖冻结r2/r3.1及本r4双Gate。作者体验：单一pin、两固定list和三分支，没有registry/通用parser/新抽象；保持原注入fixture。

| 验证层 | evidence / owner / conclusion_if_missing |
| --- | --- |
| impl-safe | 新WorkBench mock＋原native/后端回归、两文件diff/manifest/完整stdout-stderr-exit；impl作者；缺则局部未验证，不报PASS |
| coordinator | fresh默认完整观察、既有connect重复零新进程/零cleanup/同用户GUI-child-server-mux身份；root；缺则只mock，已有绑定未验收 |
| 非impl-safe | 实际HTTP/UI/UUID分页与focus前后client/pane/server核；root；作者不得GUI/SSH/HTTP/focus，缺則主链待证 |

## 4. S4Δ：测试与实际验收边界

#### 本轮修订说明

[修订: PLAN_DEFECT-R4.3] 目标是识别准确且不扩大启动/清理权限；消费G1/G2/G3、N1/N2/N3。只增 `tests/test_workbench.py`（现有process()/attach fixture旁独立named fixture与用例），不改其它tests/native/terminal/UI。输入完整mockrows/clienttext/clock，输出原state/connect与动作调用记录；步骤为正例→错pair/未知/变化负例→原全native/后端回归→root实机。

正例含GUI父不在mock census但数值完整、named-only direct child出生更晚、同原server/mux/唯一client，observe can_focus/unique_observed，connect与重复connect都零Popen/零cleanup/owned不变。负例含fixedEXE/config/cwd/another session/extra flag/partial argv、任意manual不完整GUI、wrong direct parent/child早出生、NEW_GUI＋named child或OBSERVED_GUI＋unnamed/legacy child、GUI/client/server/mux PID或ctime前后变化、零/多/坏client、超龄/lock/latch，全部不得用新profile绕过原守卫。Lua pin常量精确8E045并以现有integrity哈希注入验证完整匹配/任意mismatch拒绝，不做真实D写入；旧5F903仍仅历史/回滚基准。mock owned清理有新增named pair时不调用其TerminateClient、不修改其GUI；若named child冒充owned NEW_GUI子则原exactunnamed检查拒绝kill并保留unverified。原NEW/LEGACY正例、disconnected启动及精确原handle cleanup测例全部保留。

impl命令：`.venv/Scripts/python.exe -X utf8 -B -m unittest tests.test_native_processes tests.test_workbench tests.test_focus tests.test_gateway.GatewayDispatchTests -v`；真实bytes stdout/stderr/exit、AST与两文件diff，不管道截尾。mock不是实际GUI/cleanup验收。回滚仅新增测例/第三profile；依赖S1Δ。作者体验是利用原fixture并按行为分组，不为完整argv每个字段添加生产抽象或镜像测试。

| acceptance / evidence_expected | owner | conclusion_if_missing |
| --- | --- | --- |
| 完整local命令/AST、exact NEW/owned方法不改、两文件diff/manifest | impl作者 | 不给局部PASS或扩大profile权限 |
| 默认native两次普查＋list-clients当前唯一关联与预算；真实connect重复两次前后同GUI18696/child260364/server/mux（当次重新取identity，非固定PID配置）、新GUI计数差为0、零ownedcleanup | root | 既有连接/性能尚未验收；不拿原runtime exit1当PASS |
| 真实HTTP/UI控制与UUID消息分页/focus pre-action-post、client目标pane和原server/SSH/mux保持；GUI可见性仍unverified、仅Zellij pane定位 | root | 主链待证，不声称桌面激活或精确client-PID握手 |
| base helper受控长阻塞与实际退出、single actualbase/无额外Pythonredirector；可选精确OSconhost的EXE/ParentPID/created只读记录与after全无残留，完整全Python/临时HTTP/UI回归与freshReview(Impl)/finalhash | root＋fresh reviewer | r32整体exit1不冒充全绿，不被r4profile正例替代；不人工Terminate conhost或遍一般树 |
| 新自然disconnected launch＋8s后验、post-launch观察故障＋真实3s ownedGUI/client回收 | root | 当前用户GUI存在，无法无损触发；保留缺证，不关闭/杀窗口、不虚构disconnected、不改旧feature/Q6结论，不报整个连接/回收PASS |

## 5. Required Set、风险与双Gate

私有接口/状态矩阵仍原rows→classifier→observe→Terminal/gateway/UI；只有第三profile观察集合与已研究Lua单一pin变化。无持久迁移/新依赖/用户配置/D盘配置改动；native/helper已实施保持原字节。回滚/受控网关重载由root负责，不能以重启清latch/index/last_evidence逃避遗留。CLI无原子instance pin、hidden watcher不可见、GUI进程不证可见性继续保留；仅当前实测fixedargv观察，不扩大named启动权限。

[修订: PLAN_DEFECT-R4.4] root r32实际生命周期报告完整补读，SHA `4F0C20D6877E042D6744E5A4352931EF08291AACCD6992C0915DF35AC3B3EF15`：默认30ms timeout实际47ms退出、afterCIM[]；root-owned direct realbase sleep20/timeout6实际6015ms退出、afterCIM[]，但beforeCIM有Windows/system32/conhost.exe directchild，故“only one actual direct base process and no child”**exit1**。helper模块无子进程代码成立，Windows可创建Console Host；修正验收口径而非native产品。只允许root按精确OSconhost完整identity/出生/直接parent只读记录，等待OS自动退出、独立after普查无残留；不杀conhost、不扫杀树，不放行未知/其它Python后代。

root r33实际69cee3→e17b2b exit0：原handle核basePID12596 created134355645079311048/exited134355645139544459，受控timeout6实际6031ms；before CIM六字段包含唯一actualbase与精确System32conhost244280/parent12596/出生更晚，afterCIM[]，没有人工终止child；7/7true。作者700f65完整补读退出码/输出，支持受控真实base helper可超时退出及OSchild自动消失；不证明自然sampler卡住、任何平台都无OSchild、真实GUIcleanup或整个功能PASS。原r32失败保留。该115行root-owned诊断仅同base/shellFalse/CREATE_NO_WINDOW，argv为sleep而非生产模块，诊断6秒不是产品预算，5/8/3不变；native产品不改。

RequiredSet采用T3，缺任一失败；不能拿任务数/检查数当门槛：

| 必填 | 锚点 |
| --- | --- |
| T1.1 目标/反目标/不影响项 | §1–3；两包G1–G3/N1–N3与不改层 |
| T1.2 文件/首落点 | S1constants/classify/expected；S4fixture/tests |
| T1.3 步骤/验收/回滚/依赖/形态 | S1/S4正文与代码片段 |
| T1.4 每包G/N | 两包首段 |
| T1.5 分层三元组 | S1验证表、S4五项交接 |
| T1.6 作者体验 | 每包末段少量直线声明 |
| T1.7 主链总览 | §2现状/落点/不改层/理由 |
| T1.8 research映射 | §2五行事实/实现/验证 |
| T1.9 片段闭环 | classifier三profile→expected→原unique→connect零Popen→S4权限负例 |
| T1.10 Gate1四字段/复杂项 | 下述作者实际自证，121/0/exit0后判作者PASS |
| T1.11 双Gate | 作者当前Gate1→root独立核→freshGate2→root放行；失败回作者只修本文重Gate |
| T1.12 澄清/模板/批量 | 下述P0/P1/P2与DELEGATE模板 |
| T1.13 风险/降级/Gate2 | §5风险及下述十字段复核，未知丢资格/缺证不关闭 |
| T2 输入输出/边界/测试 | S1原六字段/原state、S4mock及root层 |
| T3 依赖/状态/兼容迁移/停机 | 本节不改接口/不迁移/重载风险与局部观察例外 |

| fresh Gate-2十必填字段 | 当前 / 独立复核对象 |
| --- | --- |
| Required Set复核结果 | PENDING；T3全部项 |
| 目标锁/反目标复核结果 | PENDING；每包G/N、新启动与owned无变 |
| 关键实现锚点复核结果 | PENDING；fixed第三profile/expected/新tests |
| 代码片段充分性复核结果 | PENDING；配对→资格→connect零动作 |
| 作者体验门复核结果 | PENDING；小list/三branch，无新配置框架 |
| 人工review对齐复核结果 | PENDING；主链顺读/映射/跨包无脑补 |
| P1-P9协议合规核验表 | PENDING；下述逐项 |
| 基线与澄清一致性复核结果 | PENDING；冻结旧字节＋root当前受控局部例外 |
| 设计味道扫描结果 | PENDING；≤100产品行、无采样器/图形重构 |
| Gate-2 | PENDING；不消费r3.1旧PASS |

P1不以任务数门禁；P2/P3 Required缺项硬失败；P4 T3消费T1/T2；P5关键目标/权限不唯一才DELEGATE_QUESTION，技术事实DELEGATE_ACTION；P6新风险/假设/阶段事件即记录本文/后续impl/README与root证据；P7无问题数量上下限；P8按P0权限/回收、P1实际关联/预算、P2展示，批量给事实/推荐选项/代价/影响阶段；P9当前作者Gate1→root→freshGate2，禁止作者自放行实施。模板：`【DELEGATE_QUESTION】priority=...; 已取事实/原因=...; 影响G/N/阶段=...; 选项(推荐)/代价=...; 必须由用户确定边界=...`。本轮无新用户问题，root已依据当前明确目标裁定只读profile。实际shape/预算/归属不符则unknown回root取证，不静默放宽；技能STOP_BEFORE_IMPL与持续授权差异沿用历史，不改技能。

作者Gate1：目标锁/反目标映射完成（S1/S4各G/N）、验证责任分层已落盘（S1三层＋S4root动作分流）、证据产物/责任归属/证据不足约束已落盘（两表三元组）、作者体验门证据已提供（pin/list/三分支与原fixture）。主链总览/research映射/片段闭环见§2–4。329660实际核12冻结输入、31当前产品未提前改、RequiredSet/字段/协议、AST实际锚点及有限证据：121checks/0fail/exit0，已读完整stdout/exit；判作者Gate1 PASS。最终尾后实际复核仍须同项全量与currenthash，非产品业务验收或作者实施放行。

## 6. 失败与未完成保留

root native runtime-r31/r32 **exit1**、Lua新hashfresh检查exit1、旧WQL5016ms、研究500ms自定失败、venv反证、旧Gate/collector/单测red均保留。root全suite104首轮旧CSRF临时HTTP Win10053（root-tests-r31.json），retry1又在bigbody413例Win10053（root-tests-r31-retry1.json），两者均exit1；定向同例 `e16164/exit0`（root-csrf-recheck-r31.json、1项）不能称104全通过，后续全量待root。当前existing自然连接在integrity新事实收口后可验证；新启动/真实ownedcleanup仍缺证，不能关闭旧机器人BLOCKED/父Q6。

作者本轮读取错误路径 `review_notes_lwplan_runtime_3.md`失败，PowerShell后续读取继续故wrapper exit0，不能把此当读成功；按inventory纠正为实际 `review_notes_lwplan_runtime_r3.md`并完整补读。research宽rg出现截断，随后只把已见事实与官方定界条文作依据；不称本轮全文重读research。无产品/GUI/SSH/HTTP/attach/focus/install/Git动作，仅本文。当前31产品字节快照工具5155c1已完整读，包含native/testnative，不再沿用旧“尚未实施”断言。

合并r32与三份test stderr读取外层截断，后`39a8dc`单独完整读r32/exit与SHA，`a8722f`明确读取三份test的exit_code/完整error_tail；不称本轮独立执行或全文审查104项。root解除Lua事实HOLD并裁定精确新pin，两侧diff/metadata与r33已由53dc69/700f65完整补读，按该有限证据收口；最终Gate1须实际核，freshGate2与业务仍不提前放行。

本次作者Gate1完整输出、exit与最终SHA由尾后工具交付（current_products有31paths完整SHA快照；未额外写自证文件，保持唯一本文产物）；freshGate2和真实业务仍待root。建议英文提交信息：`fix: recognize the existing named workbench connection without relaunching it`。

作者首检d0ddad：121checks/1fail/exit1，仅literal检查要求“不接受任意hash”而正文写“非接受任意hash”；完整pin/权限语义不变，正文收窄到前者再核，首红保留。所有12冻结输入hash、31当前产品hash、RequiredSet/各锚点及已读有限r33证据检查均true；不能把该首检称PASS。

无新增跨功能事实。
