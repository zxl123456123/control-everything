# 3D 视角与动画交付

2026-10-04。用户反馈“不是3d动图视角，也不丝滑”的有界增量已完成实际页面验证与独立审查。

默认视图使用透视相机、机器人站台和持续装饰动画。鼠标拖动可水平及垂直环绕，滚轮缩放；箭头和重置沿阻尼平滑移动。重置采用最近等价角，连续旋转多圈后不再扫回整圈。暂停按钮、减少动画偏好、页面隐藏及组件销毁可停止持续渲染，像素与文字回退继续保留。

运动只展示空间关系，不判断任务正在工作或已经完成。点选角色仍按真实 UUID 读取历史，拖动和缩放不发起消息读取或终端动作。

Root 实际完整浏览器回归：1256 项检查、33 场景、0 失败，exit0；最新完整执行与报告为 `work/robot-motion-root-fixture-r3.json`、`work/robot-cockpit-fixture-r1-2026-10-04T04-11-12-094Z.json`。23 次实际 DOM 箭头累计旋转6.90 rad，重置实际经过0.6273 rad；没有合成动画时钟。采样帧中位6.1ms、p95 6.2ms只适用于本机受控 Edge，不能承诺 IAB 或所有设备的帧率。

实际用户 IAB 已重载当前版本，3D canvas 和播放状态已核验；当前 HTTP 源字节与工作区相等，现场记录为 `work/robot-motion-root-live-r2.json`，截图为 `work/robot-motion-live-final-r2.png`。独立实施审查 `robot-motion-review.md` 为 PASS/PASS；root 完整读取后另运行 `work/robot-motion-root-delivery-gate.json`，17项、0失败、exit0。

保留的失败：初次年龄显示 fixture 1 项失败后仅修正测试时钟测量；原长角重置回归红7/13，修后绿13/13并另做真实渲染验证。脚本名猜错、已有证据写入保护、截图坐标和 DOM 选择器采集错误均在现场及独立报告保留，未覆盖原件。

本交付只关闭新增展示反馈。WezTerm 默认采集、真实连接/定位和原请求所有权回收另行实施与验收；旧机器人批与父 Q6 的冻结报告保持原状态。

英文提交建议：`feat(cockpit): add smooth perspective motion and shortest-path reset`。
