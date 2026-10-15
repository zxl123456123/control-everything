# 已有连接识别与本轮实测交付

2026-10-04。继续用户“自动实施代码即可现在”“继续优化完整”的现有范围。代码已加载到本地面板；本报告只证明下列局部实施与实际离线行为，整个 WezTerm 联动仍需运行中的终端验收。

## 对开发工作台的作用

修正 `workbench.py` 原先只认识两种启动参数的问题。新增第三种完整固定的命名 GUI/attach 组合，用于观察用户已经打开的窗口；完整 exe、参数、配置、目录、session、直接父子关系、出生时间和两侧身份仍需一致。已有唯一连接时，重复连接返回已关联、零新建，不接管该窗口的清理所有权。实际连接启动与原请求清理逻辑没有扩大。

Lua 完整 pin 更新为已逐字对比确认的当前外观版本。依然检查四个固定文件的完整 SHA，参数不符、配置再变、身份变化、超预算或清理未核验时拒绝动作。产品差异16行，新增9组行为测试153行，仅修改 `session_panel/workbench.py` 和 `tests/test_workbench.py`。root 独立核全部31个来源、完整 final patch 以及未改函数，证据 `work/wezterm-session-link-root-scope-r4.json`，1182ba/exit0；29个其它来源未改。

已交付的视觉增量本轮再次验证：默认透视3D、自动环绕、拖动和滚轮、阻尼、最近角重置、暂停与减少动画偏好、隐藏停帧、像素/文字回退。点角色仍以 UUID 选择历史。装饰动画不证明任务活动或完成；本轮没有添加假角色。

## 本轮 root 独立验证

| 实际命令或动作 | 完整证据与结果 | 适用范围 |
| --- | --- | --- |
| `.venv/Scripts/python.exe -X utf8 -B -m unittest discover -s tests -v` | `work/wezterm-session-link-root-tests-r4.json`，78b982→701eff，113 tests/0失败/exit0，11.724s；完整 stderr 已读，含既有两条 Pydantic warning | 本轮全部 Python 测试，含临时HTTP与stdio；不是实际终端成功定位 |
| `C:/nvm4w/nodejs/node.exe tests/verify_robot_cockpit.cjs --fixture` | `work/robot-motion-root-fixture-r6.json`，aff65f→459846，1256 checks/33场景/0失败/exit0；实际报告 `work/robot-cockpit-fixture-r1-2026-10-04T13-56-43-259Z.json` | 本机受控 Edge、临时 loopback；合成会话，不使用8766或私人内容 |
| 全部浏览器判定与实际资产/退出检查 | `work/robot-motion-root-audit-r4.json`，283409/exit0；全1256 verdict读取，33场景无未预期page/console errors、四语法检查0、全部8资产hash匹配、browser关闭/fixture退出0 | 本轮最终视觉字节；中位6ms/p95 6.3ms只是局部样本，不承诺所有设备FPS |
| 固定文件/native默认采集/实际API | `work/wezterm-session-link-root-live-r4.json`，6fab0f/exit0，11检查/0失败；四pins实际true，native两次140ms/93ms，完整rows=[] | 当前离线终端；不能证明运行中双采样或实际GUI回收 |
| 实际带Origin/CSRF的空 `{}` 连接请求 | 同 live-r4：409 / workbench_not_running / connected=false / launched=false / cleanup=not_needed；前后工作台EXITED、native[] | 实际安全拒绝；没有复活布局、创建SSH/Claude或清理窗口 |
| 当前用户IAB | `work/wezterm-session-link-root-ui-r4.json`；实际3D canvas、暂停true→播放false、reset、connect disabled、source0；`work/robot-motion-live-final-r5.png` | 当前页面实景为空场景，未注入假UUID；静态JS实际HTTP字节与本轮文件相同 |

最终产品 SHA：workbench `10F6445617C25432132100C6BD1F60EABE989000D55AC4BF085FB2E5621E7E89`；test_workbench `C877DF03EA825690FE9F9C689CBA1568B963A3945A64148B4B37D74019BCBCB4`。作者 before/diff/manifest及先红61/5/exit1→绿61/0/exit0见 `impl_existing_r4.md`；root没有用作者自称替代独立验证。

## 当前运行与缺证

旧面板和原终端进程本轮采样时已不存在。root先在空闲8766恢复面板，再仅停止已保存并即时确认全身份与原句柄的自建listener5588；原launcher34820随之退出。没有停止WezTerm、Zellij、SSH或外部mux。

新版当前launcher41828 / direct base listener40880；固定各自image/完整argv/ctime、root启动时间区间、唯一127.0.0.1:8766、health及前后完整身份由 `work/wezterm-session-link-root-gateway-live-r42.json`（48989f/exit0）独立确认。两个失败重载记录保留如下，没有重复重启来清除latch。当前后台 workbench-v4 及其它六条序列化会话全部 EXITED；当前远端固定来源注册0、进程0、索引0，返回 unknown/terminal_unavailable。没有将历史窗口、历史UUID或假数据呈现为当前工作。

真实唯一连接的重复零新建、UUID消息分页/显式focus前后守卫，以及自然disconnected启动/真实owned GUI和client有限回收仍缺证。因此 fresh Review(Impl) 可以 BLOCKED，业务结论留空。视觉独立PASS不关闭本批、旧机器人BLOCKED或父Q6。独立审查另见 `review_notes_impl_r4_1.md`；本报告不冒充该结论。

“恢复退出布局、旧命令保持暂停”的范围问题尚待用户回答；原 N1“不复活EXITED”的边界在 `clarifications.md`“完整实现基线 / 2. 反目标”（第36行）。没有执行 named attach、旧启动器、EnsureTabs、force-run或Enter。官方说明 plain attach可复活布局，旧命令默认等待Enter，见 [Zellij session resurrection](https://zellij.dev/documentation/session-resurrection.html)。用户授权该新增范围后才可继续该动作，不把等待时间当批准。

## 已看到的失败与边界

- 本轮首次Node调用用了不存在的 `web/test-harness.cjs`，7288ed/exit1；`work/robot-motion-root-fixture-r5.json`完整保留。随后读取实际文件清单，再运行正确固定harness，33场景0失败；不是抹掉原记录重试。
- root重载r4（775ee2/exit1）因PowerShell `ConvertFrom-Json`把UTC字符串自动转DateTime而拒绝，stopped=[]；r41按字符串读取后确认原归属并重载，但错把venv命令行当作base child应有命令而拒绝，9c47fd/exit1。新listener实际已经启动；54e156只读全字段后，r42用各自固定完整image/argv验证，未再停止/重启或处理OS conhost。原两次exit1文件没有覆盖。
- 1256判定首次提取打印帧轨迹过长，67f7a0输出截断；不能作完整读取证据。随后283409逐一扫描全部verdict并输出完整紧凑结果，未改原report。IAB失效tab/创建后绑定错误也保留在feature README。
- 先前两轮104全量测试各一例Win10053，分别是无效CSRF请求和413大请求拒绝；当前113全量绿不证明间歇断连原因已修复，未改HTTP或弱化边界。旧native unknown/Lua mismatch、OS conhost断言失败及受控helper6031ms的有限证据全部仍由恢复材料和旧原报告承载，不混作本轮实机成功。
- 独立review预读指出本交付稿把N1误指向§10；root实际全文定位到“完整实现基线 / 2. 反目标”第36行，846c7b/exit0，仅修正本稿引用，不改冻结基线或产品。

当前目录无Git repository，未初始化、提交或推送。英文提交建议：`fix(workbench): recognize existing named connections without relaunching`。
