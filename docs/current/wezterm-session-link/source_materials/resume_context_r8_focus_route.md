# R8 精确定位路径恢复材料

source_type: resume_context  
created_at: 2026-10-05 Asia/Shanghai  
created_from: 用户持续自动实施授权、root 本轮实机验证与 R7 ReviewImpl  
related_stage: PLAN_DEFECT -> LWPlan R8  
supersedes: none；R7 材料及全部已实施支撑保留  
status: 当前 R8 输入；不是平行权威方案

用户原话：“然后就是能力方面要稳定，你可以自己去测试，比如新起一个codex对话看看是否真的机器人出来了。然后wezterm新起一个，看看是不是也能监测到。直到能力稳定”。持续原话：“a继续，怎么还有方案冲突，自动实施代码即可现在”。普通必要代码与自己测试会话的实际验证已经授权，不重复阶段许可。

R7 当前两个产品准确 SHA：terminal `B50D5C5F639B16FEB5616B18BF503D8851ADF7DF2293101CA04EF30545C534C3`、test_focus `9D7A2E50861302588FDDC31C2042A02D32F868297C78FEB691A80137EC8E45C0`。root 全量147/0、准确scope54/0成立。真正cross-1 exit0/最终client3/earliest age4375ms；next-1 exit1/4->5->2/earliest age5218ms，尚未到目标3或完整final。独立 `review_notes_impl_r7_1.md` SHA `306D6ACB7C28F699AFAB62FAF1D0D932D00A28E9499B220FBB77199A7D2E7AF3` 为 REVISE/PLAN_DEFECT。R6 PASS 已重置旧连续缺陷计数，本次为1；问题仍是按真实 UUID 找到机器人、正文与终端，无需求方向漂移。不得将局部安全拒绝与 cross 一次绿当整个能力稳定。

已读事实：`work/r8-focus-routing-research.md` SHA `F4B66121A4266CC9BBAB7BD48DCA38AB303E0A3B3763B6D886717F4F2535D1BC`；固定 Zellij0.45.1 官方 tiled/grid、screen、route、tab getters已读。普通当前清单可选矩形2=(0,1,48,40)、3=(48,1,102,18)、4=(48,19,69,22)、5=(117,19,33,22)。循环sort(y,x)，不是ID/返回顺序。方向筛紧邻边界与严格重叠，再取active_at最大；当前4/5向上只有目标3。空 `index_in_pane_group` 不证明非stack，公共清单没有stack/active_at；方向预测必须由每步实际client/完整几何及最终完整关联证明，尺寸变化/未知/错误转移拒绝。不得伪称内部模式已查明。

root only-focus `live-session-focus-cycle-r8-3.json` 真实next2->3->4->5->2与previous逆环成立；前两份diagnostic在任何action前因int时间解析、tuple/list比较错误exit1，保留。`live-session-focus-up-r8-1.json` 751bf6 exit0：4和5各一次官方move-focus up到3；完整action+clients/version/panes耗时1156/859ms，几何不变、完整关联前后同。它是候选机制证据，不是 R8 产品已完成。只省同tab goTab仍可能不足；cross保存错误pane需goTab再移动，其5000ms龄风险不能抹去。

最小收敛决策由root承接：保持原strict/nonstrict与全部身份、年龄、期限、完整后验。仅 (1) pre真实唯一client已在目标candidates时省无效goTab；(2) 原strict fingerprint加入可核验四个完整矩形字段，只有所有可选up邻居恰为目标时用一次官方move-focus up，歧义走原有next，方向结果错误/未移动停止而不随机再走；(3) Terminal只复用同一次force刷新刚消费的完整版本/清单，减少重复查询；不存跨请求inventory缓存、不拿缓存成功作当前证据，不把最後per-step清单代替final。可用SessionService私有forced返回view/inventory，原公共响应、缓存与普通调用不变；精确签名/分支由LW在两个源码与两个测试的四个文件范围内定案并审查。不上shortestprevious、一般方向寻路、并行框架、预算扩展或新status接口。

两个5000ms原起点/上限保持：远端证据age包含该force refresh真实耗时，从refresh_finished继续累计；action deadline依旧在原inventory位置之后、pins之前建立，pins/pre/每步版本/clients/完整panes/最终observe和freshpanes全部继续在原窗口内。请求总walltime不等于action窗口。所有非0exit、unknown/invalid/duplicate/empty/late/no-op/身份或几何变动都诚实未确认。

最新真实生命周期：只退出root原c930测试会话，`live-session-owned-exit-r7.json` 75f5c5 exit0、注册0/进程0/SSH dev3活着/其它pane全文逐字段不变；`live-session-owned-disappearance-r8.json` e24f4c exit0，旧c930保留 registration_missing、paneNone、bindingunknown。随后只新建root安全tool-disabled会话 `0990a0a5-a375-4bef-85ef-0ae23ee5ad74`，PID3886044、start_ticks1341437828、boot8039e11b-c803-45d1-b909-973722f040c4、slotdev、pane3。`live-session-claude-launch-r8.json` 083e46 exit1是diagnostic匹配user prompt里的marker过早退出等待、当时total1；不再启动第二个。`live-session-owned-new-identity-r8.json` 0a856c exit0/8项，新PID/UUID稳定、两条正文且assistant精确R8 marker、旧marker未混、API新confirmed与旧missing各一。真实IAB刷新看到两类记录，3D播放/自由巡游、当前14角色 rAF165FPS/p95 6.2ms仅该可见窗口；不覆盖N48压力限制。

当前自己GUI51008/父63468/birth134356101153204830；direct attach53116/父51008/birth134356101178219990；本次server14740/父53116/birth134356101181073930，全部image/argv与R7cross首完整样本相等；旧PID5612为历史，不能硬编码它是当前server。该GUI来自 `live-session-wez-launch-r5.json`。root后续对自己的新UUID实机测：same-tab错误2/4/5、other-tab保存错5和准确已在目标分别至少3轮；逐份完整final＋独立clients/age/deadline才正例，所有busy/red保留。原Codex测试ID01a10809-706b-78e3-b279-c3611cf75be0仍在真实索引，本轮要再验证其与新远端机器人独立mesh/点选/正文隔离。

仅相关产品：terminal.py、service.py、test_focus.py、test_observation.py（同一控制证据链），其它25来源及R6 native/所有UI/vendor/source/Workbench/pins/locks/latch/MCP/CSRF不改。准确R7 before与全部旧支撑保留；新增唯一LW章节加修订说明/tag，先Gate1、fresh ReviewLW/Gate2、明确放行，再Impl、root当前独立验证、fresh ReviewImpl。作者和reviewer只local/mock/静态，实际CLI/SSH/GUI/HTTP/服务仍root单独承接，无递归委派或Git/清理用户工作。

旧owned失败回收、父Q6、Codex正文/实时活动、session自动合作、48角色游戏流畅度仍独立缺证。本轮不以机器人动画表示真实工作/完成，也不把有限窗口说成永久无故障。没有未回答用户问题，失败/警告不覆盖。
