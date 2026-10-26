# 自建账号与独立设备 SSH 配置样例

这些文件只含占位值，不代表已经部署或验收。hub 只管理成员、设备和准入，不保存本机项目数据。浏览器和桌面分别使用 `workbench-web`、`workbench-desktop`，固定资源 audience 为 `workbench-hub`。身份来源参见 [Keycloak OIDC 官方文档](https://www.keycloak.org/securing-apps/oidc-layers)。

## 身份与 hub

1. 在专用 Keycloak realm 核对注册、密码策略、暴力尝试保护和两个客户端；已有 realm 应逐项应用配置，不能整体覆盖真实用户。没有 SMTP 时不启用邮件验证或邮件找回。
2. 为浏览器与 hub 两个 confidential client 单独设置秘密。将 hub 配置保存为仅服务账号可读的私有文件；不要提交实际配置。管理员列表必须是部署者核对过的精确 `sub`，不是用户名或首个注册者。
3. 专用系统账号 `ce-remote-hub` 运行 hub，`/var/lib/ce-remote-hub` 权限为 0700。在已安装本包的环境执行 `python tools/scripts/remote_hub_admin.py --config /etc/ce-remote-hub/config.json bootstrap-admin`。此操作仅为配置中的管理员激活成员资格。
4. `workbench-identity.hub.service.example` 安装为独立服务。hub 只监听 `127.0.0.1:18869`；oauth2-proxy 样例的身份头与 access token 仅允许在受信服务器链路流转。Caddy 必须先清除公网伪造头，再注入内部 proof，不能公开 `/internal/authorize`。
5. `static_paths` 必须由实际版本资源清单生成；空列表不豁免任何资产。业务 document 缺 hub session 时由边缘返回账号页；只有 `/remote/api/session` 会发送 session cookie。业务 API 缺 context 时拒绝。

## 管理员与注册成员

注册和密码由自建 Keycloak 处理。管理员使用同一 `/remote` 账号入口登录，账号与设备页显示注册成员、接入状态、角色、当前电脑及注册时间；未使用邀请码的注册者也会列出。注册成功不会自动激活接入，电脑仍须在桌面端授权并明确确认绑定。管理员身份只认私有配置中的精确 `sub`，不能因用户名相同而授予权限。

代理配置沿用样例中的 `backend_logout_url`：从固定 issuer 指向 Keycloak 退出端点，由代理替换 `{id_token}`。`/oauth2/sign_out` 单独使用只会清理代理 cookie，可能在下一次登录时自动回到原账号；配置后应实测“退出→再次登录”会进入登录/注册页面。无需把 ID Token 下发浏览器或增加成员管理权限。

成员目录使用单独的 confidential client `workbench-user-directory`，启用 service accounts，关闭浏览器与直接密码授权，设置 `fullScopeAllowed=false`。仅向其 service account 及 client role scope 映射 `realm-management` 的 `query-users`、`view-users`，不要授予 `manage-users`、`realm-admin` 或 `impersonation`。在原 hub 私有 JSON 增加以下可选字段，秘密仅留在服务器：

```json
"user_directory": {
  "client_id": "workbench-user-directory",
  "client_secret": "REPLACE_IN_PRIVATE_FILE"
}
```

未配置或身份服务读取失败时，管理员页报告目录不可用，不把空列表或仅已激活成员冒充全部注册者。目录为只读分页；普通成员不可读取。登录、注册与成员列表分别通过真实浏览器验证，不能只凭样例字段存在判断现场可用。客户端权限配置依据 [Keycloak 服务账号与角色范围](https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts)。

## 独立 SSH 实例

设备转发使用单独的 TCP 2223，不修改既有 22 端口。参数依据 [OpenSSH sshd_config](https://man.openbsd.org/sshd_config)；此专用非交互公钥转发实例使用 `UsePAM no`，避免 PAM session 将连接移入 `user.slice` 而破坏固定 service cgroup 归属；因此不会执行 PAM account/session、limits 或环境策略。不得将此配置用于依赖这些策略的普通账号。

1. 将 SSH 配置放入 `/etc/ce-device-sshd.conf`，为 `/etc/ce-device-ssh/ssh_host_ed25519_key` 单独生成并保管 host key。把核对过的公钥写入私有 hub 配置。
2. 将对应实例安装为 **`ce-device-sshd.service`**。进程检查固定其统一 cgroup v2 路径和 `/run/ce-device-sshd.pid`；不能改名后绕过归属检查。
3. 将 socket/service 样例分别安装为 **`ce-device-provisioner.socket`**、**`ce-device-provisioner.service`**。root 拥有 Unix socket，模式 0660，仅 hub 专属组可连接；服务再次通过 `SO_PEERCRED` 检查调用 uid。
4. provisioner 仅接受四种固定操作，不接收 shell、路径、UID 或 PID。它创建 `ced_<device-id>` 的独立禁交互系统账号；每把 root 控制的公钥只允许两条精确 loopback `permitlisten`。账号文件、注册记录与 key 文件不得由 hub 用户写入。
5. root 部署前分别运行 `sshd -t -f /etc/ce-device-sshd.conf` 和 `sshd -T -f /etc/ce-device-sshd.conf -C user=<已登记设备账号>,host=<实际主机>,addr=<实际客户端地址>`，确认有效 `usepam no`，且公钥独占、禁会话和转发边界保持。只对已登记设备账号核 UID/shell、shadow 字段恰为 `*` 且非 `!` 锁定前缀、账号未过期和 nologin 可执行；不得输出 shadow 值或批量解锁。通过正常入口建立两条真实公钥隧道，确认设备进程与 root monitor 完整祖先链均在固定 service cgroup，PID/start 一致，分别有可归属连接及两条精确监听；再验证 PTY、shell、本地转发、非 loopback、他人端口均拒绝。

变更现有部署前须正常断开本次 fixture 隧道并证明 2223 无任何现存连接、无未知使用者，且分配监听均已释放；不能用失真的 `connections=0` 代替清点。备份专用配置并核 hash，仅修改该文件，经候选与正式路径 `sshd -t/-T` 后只重启 `ce-device-sshd.service`，不碰公用 22、host key 或账号数据库。失败须在确认无未知连接后恢复精确备份并只重启专用 unit；恢复旧 PAM 配置不代表原归属缺陷消除，须暂停撤销验收。`UsePAM no` 的真实公钥兼容性、进程归属和恢复步骤仍须部署者在实际主机验收。

撤销先拒绝路由并失效控制 token，再禁 key、以 pidfd 结束已证明归属的连接子树。无法证明 root monitor 归属、进程身份改变或监听残留时，设备停在 `revoking`，端口保留。`reconcile` 命令和服务重启会重试清理；不杀整套 sshd，不删除其他系统账号。

## 健康与上线验收

hub 只从目录中的两个端口调用 `/__ce_remote_health`，每次独立 nonce，校验 proof、公开 Host/Origin、设备/代次/本平台安装身份、channel 与 ready。单请求绝对截止 2 秒、JSON 上限 4096 字节，不跟随重定向。公网 Caddy 必须在认证和 fallback 前拒绝该路径及子路径。

这些样例须在 HTTP 健康路由、Caddy 信任链和浏览器 context 全部接入后才能部署。必须另外记录真实双账号、双隧道、禁用失效时间、撤 A 保 B、5 秒存量断连和安装包证据；源码单测不能替代这些验收。
