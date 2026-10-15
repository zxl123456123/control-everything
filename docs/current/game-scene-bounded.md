# 游戏空间与动态关联流程：本轮展示增量

2026-10-04。用户明确要求机器人有活动空间、安排位置、动态流程与光粒子，并反馈当前不像游戏、仍不丝滑。沿用“自动实施代码即可现在”的持续授权，不重复询问展示实施。与旧 WezTerm 实机 BLOCKED 分开；不修改旧冻结输入，不复活退出终端。

实际读取 robot3d/cockpit/index/style/app：现有圆盘、站立浮动、连续相机转动，缺工位和运动路径；每帧getBoundingClientRect，DPR上限2。repo当前只有固定远端Claude来源，没有读取Codex；新增Codex数据来源另走正式小增量，不用假记录掩盖覆盖缺口。

本有界范围：web/robot3d.js、cockpit.js、index.html、style.css与app.js必要流程显示（不得修改请求/消息/focus/资格逻辑）。有界验证扩展 tests/verify_robot_cockpit.cjs。已有本地Three0.186；无新依赖、CDN/素材/纹理、公开接口变化、输入注入或远端操作。

采用官方Points/BufferGeometry批量粒子与共享几何材质、基于delta的路径/步态，沿现有rAF生命周期。primary参考：https://threejs.org/docs/pages/Points.html 、https://threejs.org/docs/pages/WebGLRenderer.html 、https://threejs.org/docs/pages/InstancedMesh.html 及 game-scene-github-research.md。不整体移植React/物理/后处理框架；先让当前少量实体与光点在单一绘制循环中工作。

空间为有深度的模块工位、边界光轨、固定背景控制中心。真实UUID的角色才可选择；工位和粒子没有会话ID。增加“自由巡游/回到工位”的可访问控制，巡游与外部task busy/done无关联；位置按UUID稳定安排，metadata刷新不重置步态。不引入真假角色混合的隐式演示。

流畅度：尺寸缓存由ResizeObserver更新；DPR上限1.5；粒子单个Points、固定buffer、共享材质、每帧不重建模型/材质，不使用bloom/实时阴影。每秒采样最近可见rAF间隔，展示FPS/p95（不是GPU/全设备保证）。用户暂停、reduced motion、hidden、dispose都停止持续渲染；鼠标按下期间及所选角色冻结以稳定真实UUID raycast，普通hover继续装饰。r1实机画面显示房间占比过小，本轮按实际房间投影尺寸贴合视角，保留窄屏完整性。

流程图消费现有来源/身份/终端关联/选中UUID数据；只显示当前证据资格，不把动态连线当执行进度。无选择与离线时明确标记等待/未确认；CSS流动尊重暂停与reduced motion。

root实施前保存涉及文件的完整before/hash和差异；本轮真实浏览器验证角色水平路径与步态、工位返回、不重读API、不误点、particlebuffer持续但不增加资源、FPS采样、pause/hidden/resize/context fallback与360px；完整旧fixture及Python全量再次执行。独立fresh reviewer审最终diff、完整结果与失败，缺证不称完成。

Codex接入与游戏展示分开审查：前者不能用历史index代表运行中任务；真实WezTerm/UUID定位/owned回收缺证继续保留。scope若扩大到公开接口/关键未知，保留diff并升级正式合同，不能吞并旧BLOCKED。
