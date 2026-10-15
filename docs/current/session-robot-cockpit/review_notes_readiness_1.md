# Readiness 检查记录（第 1 轮）

**评审对象**：本批 `README.md`、`clarifications.md`、三份研究及实际产品代码。
**评审时间**：2026-10-04（Asia/Shanghai）
**角色**：review_plan；review_target=readiness；非递归、独立评审。
**评审结论**：PASS
**产物状态**：READY

当前基线足以进入本批唯一 `lwplan.md` 的正式规划。结论只覆盖新增批次的规划准备度；现网历史原因缺陷仍存在，产品渲染依赖尚未接入，父批保持 `impl_reviewing / USER_CONFIRMATION_NEEDED`、Q6 待答。Review(LW) 返回后执行严格的 `STOP_BEFORE_IMPL -> ManualMode`，不据本报告进入实施。

## 输入文件

完整读取全局 AGENTS、coordinator、development-workflow core、plan-review 与 verification-before-completion；长技能按连续区间读取。当前权威仅为本批 README 与 clarifications。父文档用于核对来源、旧验收边界与冻结状态。

| 输入 | 本次读取的 SHA-256 |
|---|---|
| 本批 README.md | `3D8B2CAEF261B0B3D5C703163F1B13D126F6546BE4364C25A116879A0831CE14` |
| 本批 clarifications.md | `C6B82AFB523786A1E3C1C6F16928CEB635828727A1676465E50C299B56F2FF1C` |
| 本批 research_render_dependency.md（READY 后完整复核） | `66248BAD6C01FE8C3B056109A93C16071D7752D03186763C091641CE7CFE4ACE` |
| 父 research_mapping_feedback_r3.md | `725374D57D0F2E5B6558BDFEED940AA9929671CCB9DFF495C6F2D35831B1A25B` |
| 父 research_robot_github_r3.md | `D8877C7771398F272BF3965EE72240508636C797ECBCB47AD4134854E68DFC06` |
| work/session-mapping-feedback-r3-root-verification.json 与 20261004T000653 固定副本 | 两者均 `3F7521660BC36C115874C3BA1E17E3536599E92B508BC283B0E4016C0FA6DB91` |
| work/robot-render-dependency-evidence.json | `E025B8A5B8617B79595B2E7128BCB7D7C4C5F8F4C17BD8CB1CF5657D6272B393` |
| work/robot-preview-r3-root-verification.json | `9EDDB0383950D74B42C043B39E7B0DBDDEA996DD9A727838B577FAF4BC7B3C51` |

实际完整读取 `session_panel/service.py`、`gateway.py`、`web/app.js`、`index.html`、`style.css`；另读 `terminal.py`、观察测试 fixture、21 文件 manifest、父 README、父 Q2/Q3/Q5/Q7/Q8/Q6 记录与 r2 审查确认/恢复规则。独立重算 21 产品文件及三份冻结计划/报告，均与 r2 manifest / 冻结值匹配。未改产品、父冻结报告或技能；未读取私人正文、调用真实 focus、输入、重启、修改信任或初始化 Git。

## 澄清与基线核验

### A. 澄清问题完整性

| 项目 | 结果 | 独立依据 |
|---|---|---|
| ① 本批未回答 Q&A 是否为空 | 是 | clarifications:17–19 明确本批无范围/决策未答；Q8 原文在:7–9。父 Q6 单独保留，不改成已答 |
| ② coordinator 是否漏记澄清 | PASS | 与父 Q2/Q3/Q5/Q7/Q8 的原文、共同范围及 Q6 待答记录对照，未发现影响本批准备度的漏记 |
| ③ 头脑风暴决策完整落盘 | PASS | :13–15 承载 3D 主视图、Canvas/文字回退、先修原因与分类、复用 UUID 功能及正式流程；固定库细节标作技术补证 |

本批可与父批分开规划的依据是明确的新 Q7/Q8 展示与分类范围、独立阶段台账、当前唯一基线以及原计划/报告冻结。它不替代父批客户端接入验收。后续改动实际产品后，父批旧审查也不能覆盖新版本，须本批 fresh Review(Impl)。

### B. 基线内部质量

| 项目 | 结果 | 独立依据 |
|---|---|---|
| ④ 必填章节 1–10 存在、非空、非占位 | PASS | :25–89 连续十节；本轮结构核验实际 exit0，十节正文非空 |
| ⑤ 目标锁具体可验证 | PASS | :27–29 分别要求当前/保留分类及时间原因、真实 UUID 选择与分页/定位资格、历史原因缺陷与失败文字能力；实际 service:87/96/129/141 和 app:39/95/123/138 能定位现状 |
| ⑥ 反目标具体 | PASS | :33–35 与下表逐项核对；没有把美观、动画或统计当活动/完成证明 |
| ⑦ 风险边界明确责任 | PASS | :48–53 保持认证/信任边界，事实缺口不猜配，非 impl-safe 结果由 coordinator 承接，库/生产/签名证据独立 |
| ⑧ 验证责任含产物、归属、承接顺序 | PASS | :69–71 具体区分 fixture 与真实消息/focus、两类 work JSON、实施报告及 impl → coordinator → fresh reviewer 次序；human/原 reviewer 承接父 Q6 |

#### 禁止项清单表格

这里核查基线未授权禁止方向及当前产品未被本批改变；不将静态核查写成尚未实施功能的验收。

| 禁止内容 | 可核查证据 | 结论（确认本批未授权/实施） |
|---|---|---|
| 新发送、代审批、resume/终止、Hooks | 基线:33、Q8 共同问题:7；gateway:111/141 为既有读取/定位入口；21 文件 hash 无变化 | 确认不存在新增授权或实现 |
| 外部项目、远端配置、信任/认证/MCP 变化，静默重启 | 基线:39/48；21 文件 hash 无变化，本轮只本地元数据/库核验 | 确认不存在 |
| 全主机监控、Jev 调用、C4D 流程 | 基线:33/40、README 产品边界 | 确认不存在新增范围 |
| 将动画、进程、近期消息、响应停止推作 busy/idle/审批/完成 | 基线:34；service:87/132、app:67；独立合成核验 activity/completion=unknown | 确认不存在允许此推断的基线 |
| cwd/tty/标题/旧 slot 猜 UUID 或 pane，保证三槽位常绿 | 基线:35/50/57–59；terminal:21 严格命令，service:140–157 保守拒配 | 确认不存在 |
| demo/随机统计/固定提案冒充实时、来源失败模拟在线 | 基线:35/52/59；预览固定 hash 与时间，零 API 记录只归提案 | 确认不存在此验收口径 |
| 运行时外部 CDN、宽放 CSP、默认 addon/贴图/外部模型 | 基线:42–43；gateway:63/96；补证 B/D/E 核查同源现实和模块闭包 | 确认不存在允许这些内容的默认路径 |
| 帧循环读消息、自动汇总全部对话、外发状态 | 基线:44；app:95/123/148–156 为选择/翻页/元数据事件 | 确认不存在新增授权或实现 |

### C. 基线与澄清一致性

⑨ **PASS**：Q&A 与基线映射如下。

| Q&A 条目 | 基线字段/实际条目 | 一致性 |
|---|---|---|
| Q2 日常开发效率优先 | 目标锁 1/2：理解真实会话并选中、读取、定位 | 一致；不据 Q2 自动增加 Jev |
| Q3 远端 Claude session 关联 | 范围:40/44、目标锁 2：固定来源与真实 UUID，身份/进程/位置独立 | 一致 |
| Q5 既有读取/定位授权与客户端边界 | 风险:48/53、验证:70–71：真实环境由 coordinator 承接，客户端由 human 控制 | 一致；授权不扩大到信任变更 |
| Q7 大量未映射、参考 GitHub、机器人/像素/3D且保留功能 | 目标锁 1/3、决策:13、范围:41–44：先修原因/分类，再用 renderer 复用现有功能 | 一致；未映射事实缺口不靠画面伪修 |
| Q8 原文“3D 机器人主视图＋像素/文字回退（推荐）”及共同范围 | 决策:13、目标锁 2/3、范围:41、验证:69 | 一致；不是仅像素，也无新增发送/审批/Hooks |
| 父 Q6 待观察 | :19/71/85 与 README:6；父 r2 审查仍 USER_CONFIRMATION_NEEDED | 一致；本批不回答、不关闭 |

⑩ **PASS**：README → 决策 → 基线溯源链不是只按章节名自证。

- README“调查大量未映射” → Q7 反馈、Q8“先修正未映射原因与旧记录分类” → 目标锁 1/3，当前与历史原因分开、保留记录不判已退出。
- README“增加机器人/像素/3D展示” → Q8 选 3D 主视图＋像素/文字回退 → 决策的可旋转/点选程序化角色，目标锁 2 的同一 UUID 功能与目标锁 3 的文字回退。
- README“让已有会话功能更便于日常开发” → Q2 开发效率、Q3 关联、Q5 读取与核验定位 → 范围的单来源/按需消息与验证的真实环境承接；不凭画面推工作状态。
- README“查 GitHub 成熟技术” → 参考几何/绘制、保留当前 Python/原生网页的已确认取舍 → r3 原作者研究及固定包补证进入:41–43/52/62/69；未整套移植 React/PTY/Hooks 产品。

固定版本、相对 import、MIME/CSP 和失效入口来自技术补证，属于执行事实，未被包装成用户原话或新的业务授权。

### D. 基线内部一致性

⑪ **PASS**：可点选与旋转是渲染/选择能力，和活动/完成 unknown、严格绑定资格、默认元数据并不互斥。文字回退继续使用同一 UUID 与分页/定位资格。

⑫ **PASS**：:53 禁止 impl 代判外部结果，:69 明确 fixture 不向真实服务读取或定位；:70 承接既有 Q5 授权，:71 保留父客户端责任。新鲜事实不足时“未验证”的分流与目标锁一致，没有用合成证据填真实结果。

### E. 与 research 对齐

⑬ **PASS**：关键约束均进入当前基线。

- 映射研究 F1/F2 → 目标锁 1/3、:50/55–63；独立合成当前 observed/registration_missing 仍含历史 source_unavailable，支持有待修复的问题，不能证明已修好。00:06:53 样本为 2注册/2同UID进程/7索引/2确认、5保留；和 22:51:42 提案及 23:08:56 采样分开。
- 原作者研究的几何/Canvas 与未知转 idle、Hooks、demo、素材许可陷阱 → 决策:13、反目标:33–35、风险:51；只参考几何/绘制，不复制不明许可资产或整套控制链。
- 固定 `three@0.186.0`、gitHead、module→同目录core、附 LICENSE、JS 2,120,885 B → :43/52/62；当前静态白名单和 CSP → :42/62。独立本地 size/hash/import 与 Node primitive 检查支持库闭包；具体生产路由由 LW 定义，不能照搬提案 CDN。[官方安装说明](https://threejs.org/manual/pages/installation.html)
- WebGL2 能力检查、初始化异常、运行期丢失与真实 API 故障不同 → :52/69；模块失败、拒绝/非 JSON/unknown、旧消息页和禁用定位的验证已承接。能力检测/Node 不替生产浏览器事件证据。[官方 renderer](https://threejs.org/docs/pages/WebGLRenderer.html)、[MDN context lost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)

### 澄清与基线核验结论

整体结论：**PASS**。①本批无未回答问题；其余十二项未发现当前 FAIL。初读的验证责任/落点缺口及技术补证未进入基线问题已由 coordinator 写入权威文件，本 reviewer 完整重读最终版后独立判断；不是以初版或口头答复放行。

## 独立本地验证与证据边界

所有下列命令在本轮实际执行、完整读取输出与退出码；Python 使用 `E:/project-funny/mianban-develop/.venv/Scripts/python.exe -B -c`，避免读写私人来源及生成 bytecode。内联脚本直接调用实际 `merge_observation` 与已有合成注册/pane fixture，或只读取文档/hash。Node 使用 `node --input-type=module -e`，只导入已核 work 文件，不实例化 renderer。

| 核验 | 本轮完整结果摘要 | 退出结果与结论限度 |
|---|---|---|
| 合成“正常→来源失败→恢复且无注册”及冻结版本 | 8检查/0失败：top=observed、row=registration_missing、reason_codes=[source_unavailable,registration_missing]，身份/位置/活动/完成 unknown；21 产品与3冻结值匹配 | exit0；确认现有缺陷与证据边界，无修复结论 |
| 依赖三文件 size/hash/MIT 与静态 import | module 662772B、core 1458113B、LICENSE 1081B 均匹配研究 hash；两个 module specifier 均 ./three.core.js，core 无静态 import；0失败 | exit0；只核闭包与许可通知 |
| Node ESM 与 primitive raycast | revision=186，exports=444，missing=[]，hit_count=2，network_calls=[]，renderer_instantiated=false | exit0；无浏览器 WebGL/CSP/生产回退断言 |
| 最终基线/输入结构与版本 | 12检查/0失败；连续1–10正文非空，Q8/共同范围/Q6隔离、固定依赖、CSP、失效责任与五份最终输入 hash匹配 | ASCII转义复跑 exit0；只核准备度证据，不代替13项人工判断 |
| 冻结提案 JSON/fragment hash 读回 | fragment=DF4C3D20486914F658F651032C1EC5A8DFB6D4B7675274858FDD8AD9EEBDA626；root JSON 118检查/0失败、serviceRequests=[]、三场景pageErrors=[] | 本轮读回/重算 exit0；118项浏览器执行属于 root 原记录，本 reviewer 未冒称复跑 |

## 缺失证据

- 当前生产没有机器人、像素或同源 Three 模块；四个候选模块 HTTP 路径的 404/JSON/nosniff 是已见现实。不存在最终产品浏览器 CSP/MIME/module 加载、运行期上下文、真实性能及 API 失败联动证据。研究 U1–U3 已有实施/承接责任，属于后续验核，不是本次已完成结果。
- npm ECDSA 签名密码学验证未做；现有证据仅 integrity/shasum 与固定 GitHub 字节一致及本地重算。基线明确限制，不宣称完整签名验证。
- 父 Q6 客户端可见性、实际客户端调用与原 reviewer 最终双结论未闭合；本报告没有该验收权限。

## contract drift / stale / mirror mismatch

- **初读缺口已纠偏**：初版§6只泛述“impl验证”和“coordinator适合本轮核验”，缺具体安全/外部责任与产物顺序；最终:53/69–71 已补。本批所需 module/context/API 失败入口最终:43/52/62/69 已补。评审未代写方案。
- **来源导航曾 stale**：父 clarifications:206 曾写“新批展示决策待确认”，与已答 Q8 矛盾；已回写“Q8已确认，子基线权威”。初读发现和恢复均保留，冻结原计划/实施/审查没有重写。
- **仍存在已知 shared 索引漂移**：development-workflow:363 的“Review(LW)通过进入Impl”与 coordinator:30 的严格停止条款冲突。已向 coordinator 上报，当前本批手动编排按 `STOP_BEFORE_IMPL -> ManualMode` 约束；本报告不对自动进入实施作任何放行，也不宣称 shared/mirror 已全面一致。该漂移影响后续阶段迁移，不能据旧索引走捷径。
- 未发现当前子基线、指定研究与当前产品来源/UUID/unknown口径之间的其它冲突；未做全局镜像审计。

## 已见失败与限制留痕

- 本 reviewer 首次 `rg --files session_panel/web` 猜错目录，exit1；实际目录为 `web`，随后完整读取三个文件。组合读取研究/代码曾被工具外层截断，已逐份/分段补读；未使用被截内容下结论。
- 本 reviewer 的 Three `/manual/en/installation.html` 返回404，改官方 `/manual/pages/installation.html` 后成功。一次混合 PowerShell 对象表把 hash 列隐藏，后用逐行字符串重算/完整读取；首次结构脚本中文标题输出因GBK显示乱码（exit0），改 ASCII转义重复全量核验 exit0。没有把乱码标题当正确阅读证据。
- 已读提案历史：悬空 canvas与回退、5倍裁切、历史原因措辞、小屏遮挡、三种stage高度、两处回退抢选；root缺 --force误验旧wrapper造成exit1/2问题，以及同一冻结hash屏外裸坐标24点击失败/exit1。native locator滚动后的118全绿记录不覆盖旧失败。注入renderer失败的console error与window.openai包装警告均保留。
- 已读依赖研究的初次输出截断、npm metadata web打开失败、安装页404、GBK ©输出UnicodeEncodeError/exit1、候选模块404、未核签名及未做生产浏览器测试均保留在研究 F/G 与机器证据。r186 tag=0.186.1，不能冒充所核0.186.0。
- 父 r1/r2 的竞态红控、安装/runtime/CLI/fixture/UI/端口与先前正式评审失败仍保存在父报告、审查及 work 证据。本轮只审本批准备度，没有重新验收或覆盖原批结果。

## 建议恢复动作

- **证据补强**：无需新增用户范围决定。LW 消费三份研究，明确生产路由和同源加载、UUID分类/选择、失败文字能力的实现与验核落点；后续按基线§6形成两类证据，再由 fresh reviewer 审最终diff。任何 U1–U3 未验证项保持未验证。
- **契约纠偏**：本批初读缺口已在权威文件关闭。shared里程碑漂移另按维护范围纠正；当前严格停机条款持续有效，不将技术选型当新授权，也不借本批关闭父Q6。
- 若后续出现新范围、权限决定、事实冲突或责任变动，先回写原话、重算基线再评 readiness；不得静默覆盖原冻结报告。

## 放行判断

- allow_enter_lwplan: yes
- 放行范围：`docs/current/session-robot-cockpit/lwplan.md` 的正式新增规划及独立评审。
- 原批：`impl_reviewing / USER_CONFIRMATION_NEEDED`；Q6待答、业务结论留空。
- 实施入口：Review(LW) 返回后停止并按 coordinator 合同呈递，不从 readiness 自动实施。

无新增跨功能事实。英文提交消息建议：`docs: verify robot cockpit readiness and validation boundaries`（本 reviewer 不执行 Git）。
