# 自建账号与独立设备 SSH 配置样例

这些文件只含占位值，不代表已经部署或验收。hub 只管理成员、设备和准入，不保存本机项目数据。浏览器、桌面和手机端分别使用 `workbench-web`、`workbench-desktop`、`workbench-mobile`，固定资源 audience 为 `workbench-hub`。身份来源参见 [Keycloak OIDC 官方文档](https://www.keycloak.org/securing-apps/oidc-layers)。

## 身份与 hub

1. 在专用 Keycloak realm 核对注册、密码策略、暴力尝试保护和三个客户端（web、desktop、mobile）；已有 realm 应逐项应用配置，不能整体覆盖真实用户。没有 SMTP 时不启用邮件验证或邮件找回。
2. 为浏览器 confidential client 单独设置秘密；hub 的 introspection 凭据仅在使用 introspection 或 strict 校验时才需要（见下文“身份提供方与令牌校验”）。将 hub 配置保存为仅服务账号可读的私有文件；不要提交实际配置。管理员列表必须是部署者核对过的精确 `sub`，不是用户名或首个注册者。
3. 专用系统账号 `ce-remote-hub` 运行 hub，`/var/lib/ce-remote-hub` 权限为 0700。在已安装本包的环境执行 `python tools/scripts/remote_hub_admin.py --config /etc/ce-remote-hub/config.json bootstrap-admin`。此操作仅为配置中的管理员激活成员资格。
4. `workbench-identity.hub.service.example` 安装为独立服务。hub 只监听 `127.0.0.1:18869`；oauth2-proxy 样例的身份头与 access token 仅允许在受信服务器链路流转。Caddy 必须先清除公网伪造头，再注入内部 proof，不能公开 `/internal/authorize`。
5. `static_paths` 必须由实际版本资源清单生成；空列表不豁免任何资产。业务 document 缺 hub session 时由边缘返回账号页；只有 `/remote/api/session` 会发送 session cookie。业务 API 缺 context 时拒绝。

## 在已有 realm 中补充手机端客户端

手机 App 使用公共客户端 `workbench-mobile`（授权码 + PKCE S256，无客户端秘密）。realm 已有真实用户时不要导入整份 realm JSON；用 `tools/scripts/keycloak_add_mobile_client.py` 通过 Keycloak Admin REST API 只补这一个客户端：

```bash
export KEYCLOAK_URL=https://identity.example.test   # 含 /auth 前缀的旧版部署须写进 URL
export KEYCLOAK_REALM=<目标 realm>
export KEYCLOAK_ADMIN_USER=<管理员>                  # 默认在 master realm 登录，可用 KEYCLOAK_ADMIN_REALM 改
export KEYCLOAK_ADMIN_PASSWORD=<管理员密码>           # 只从环境读取，不接受命令行参数
export CE_MOBILE_SCHEME=<App 的自定义 URL scheme，例如 com.example.workbench>
python tools/scripts/keycloak_add_mobile_client.py --dry-run   # 只读：对比服务器并列出将执行的步骤
python tools/scripts/keycloak_add_mobile_client.py             # 实际写入
```

已有管理服务账号时，用下面这组环境变量替代 `KEYCLOAK_ADMIN_USER/PASSWORD`，通过标准 `client_credentials` 认证，不需要重置管理员密码：

```bash
unset KEYCLOAK_ADMIN_USER KEYCLOAK_ADMIN_PASSWORD
export KEYCLOAK_ADMIN_CLIENT_ID=<已有管理服务客户端 ID>
export KEYCLOAK_ADMIN_CLIENT_SECRET=<该客户端秘密>       # 只从环境读取，不接受命令行参数
python tools/scripts/keycloak_add_mobile_client.py --dry-run
```

两种认证方式必须二选一且成对设置；混用或只提供一半会在联网前报错，`--dry-run` 也不例外。管理账号所属 realm 默认仍为 `master`，可用 `KEYCLOAK_ADMIN_REALM` 指定；它与 `KEYCLOAK_REALM` 目标 realm 独立。服务账号必须已有目标 realm 的相应客户端管理权限，脚本不创建管理员、不提权，也不接受外部 access token 直接注入。实际秘密应由受控环境注入，不将展开值写入命令历史或日志；服务账号机制见 [Keycloak 官方说明](https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts)。

- 只写三类对象：`workbench-mobile` 客户端本身、该客户端上的 `hub-audience` 映射器（audience 为 `workbench-hub`，只进 access token），以及该客户端的默认 `email` client scope（使 access token 与 userinfo 带邮箱）。realm 设置、用户、其它客户端一律不改；realm 只读取。
- 客户端：公共客户端，仅标准流程；关闭隐式流程、直接密码授权和 service account；PKCE 固定 S256；重定向与退出后重定向都只有 `<scheme>:/oauth/callback`。已有同名客户端时只覆盖这些受管字段（`redirectUris` 按声明式精确替换，会清除多余的地址），其它字段和属性保持原样。已有同名机密客户端默认拒绝改为公共，须显式加 `--allow-convert-confidential`。
- 幂等：再次运行没有差异就不写入任何内容。`--dry-run` 带管理员凭据时只发起读请求；未设置管理员凭据时完全不联网，只打印目标客户端与映射器。
- 刷新令牌轮换是 realm 级设置（Realm settings → Tokens → Revoke Refresh Token，Max Reuse 为 0），脚本不会改 realm，只在输出的 `warnings` 中提示未开启，须由管理员自行确认。同样会提示 realm 中缺少 `workbench-hub` 客户端。
- 管理员密码或服务账号秘密走 token 请求，因此 URL 只接受 `https`（本机回环地址除外）。输出与错误信息不含密码、客户端秘密、令牌或服务器响应体；失败仅报告请求与 HTTP 状态。
- 该脚本尚未对任何真实 Keycloak 运行；单元测试使用模拟的 Admin API。首次对生产 realm 使用前，先 `--dry-run` 核对步骤，并备份 realm。

发布新版桌面包时，须同步登记资源：普通资源取同版 `gateway.WEB_ASSETS`、`workbench.STUDIO_RESOURCES`、`news_reader.ASSETS` 中的非 HTML 项；原生资源取完整包 `workbench-build/web-assets.json` 的非 HTML `files`，路径加 `/workbench/` 前缀。只合并仍受支持版本的精确路径，保留旧版条目，不加入 HTML、API 或通配路径。更新私有配置并重启 hub 后，从远程浏览器实测项目与终端。漏登记会使初始脚本返回 `403 context_required`，出现白屏或资源加载失败；仅重新构建桌面包不能替代这一步。

## 管理员与注册成员

注册和密码由自建 Keycloak 处理。管理员使用同一 `/remote` 账号入口登录，账号与设备页显示注册成员、接入状态、角色、当前电脑及注册时间；未使用邀请码的注册者也会列出。注册成功不会自动激活接入，电脑仍须在桌面端授权并明确确认绑定。管理员身份只认私有配置中的精确 `sub`，不能因用户名相同而授予权限。

oauth2-proxy 样例使用通用的 `provider = "oidc"`，端点由 issuer 的发现文档提供。代理配置沿用样例中的 `backend_logout_url`：取发现文档里的 `end_session_endpoint`（Keycloak 为 `…/protocol/openid-connect/logout`），由代理替换 `{id_token}`。`/oauth2/sign_out` 单独使用只会清理代理 cookie，可能在下一次登录时自动回到原账号；配置后应实测“退出→再次登录”会进入登录/注册页面。无需把 ID Token 下发浏览器或增加成员管理权限。

成员目录使用单独的 confidential client `workbench-user-directory`，启用 service accounts，关闭浏览器与直接密码授权，设置 `fullScopeAllowed=false`。仅向其 service account 及 client role scope 映射 `realm-management` 的 `query-users`、`view-users`，不要授予 `manage-users`、`realm-admin` 或 `impersonation`。在原 hub 私有 JSON 增加以下可选字段，秘密仅留在服务器：

```json
"user_directory": {
  "client_id": "workbench-user-directory",
  "client_secret": "REPLACE_IN_PRIVATE_FILE"
}
```

成员目录是可选项。未配置 `user_directory` 时，管理员页只列出 hub 已有记录的成员（登录或激活过的账号），响应带 `"source": "hub_members"`，页面会提示“未配置成员目录，仅显示已在 hub 登录或激活的成员”，成员名称显示为 `sub`；从未访问过 hub 的注册者不会出现。已配置目录但身份服务读取失败时，仍报告目录不可用，不把空列表冒充全部注册者。目录为只读分页；普通成员不可读取。登录、注册与成员列表分别通过真实浏览器验证，不能只凭样例字段存在判断现场可用。客户端权限配置依据 [Keycloak 服务账号与角色范围](https://www.keycloak.org/docs/latest/server_admin/index.html#_service_accounts)。

## 身份提供方与令牌校验

默认仍是 Keycloak，但 hub 不再硬编码其端点路径：

- **端点发现**：hub 与桌面连接器只配置固定 issuer，其余地址（introspection、`jwks_uri`、`device_authorization_endpoint`、`token_endpoint`）从 `<issuer>/.well-known/openid-configuration` 读取并缓存 1 小时。文档中的 `issuer` 必须与配置完全一致；端点必须是 https、不含凭据或片段，并且默认与 issuer 同源（`jwks_uri` 除外）；不跟随重定向。发现失败时 hub 返回 503，连接器按“身份服务不可达”重试，不会退回猜测的路径。issuer 可以是任意不带结尾斜杠的 https 路径（不再限定 Keycloak 的 `/realms/<name>`）。
- **令牌校验** `token_verification`（私有 JSON 可选字段）：
  - `introspection`：逐个令牌调用 introspection（需要 `introspection_client_id`/`introspection_client_secret`，二者必须同时提供）。配置了凭据且未指定时的默认值。未命中缓存时可发现吊销；已缓存的校验结果最长仍可使用 30 秒。
  - `jwt`：用 JWKS 本地验签，校验 `iss`、`aud` 含 `workbench-hub`、`azp`（或 RFC 9068 的 `client_id`）属于该端点允许的客户端、`exp`/`nbf` 与签名算法白名单（RS/PS/ES/EdDSA，拒绝 `none` 与对称算法；算法必须与 JWK 声明一致）。没有 introspection 凭据时的默认值。**取舍**：令牌被吊销后，最长到令牌 `exp` 之前本地校验仍会通过。
  - `strict`：先本地验签，再调用 introspection 确认仍然有效且 `sub` 一致；二者都通过才放行。需要 introspection 凭据。
  - 校验结果沿用 30 秒（或到令牌过期）缓存，JWKS 遇到未知 `kid` 最多每 30 秒刷新一次。JWT 验签依赖 `pyjwt[crypto]`（已由 `mcp` 依赖间接安装；缺失时 hub 启动即报 `jwt_support_unavailable`）。
- **其他 OIDC 提供方**：只要提供标准发现文档与 JWKS，并能签发带 `azp`/`aud` 的访问令牌即可；客户端 ID 与 audience 名称仍为 `workbench-web/desktop/mobile` 与 `workbench-hub`。目前只在 Keycloak 的配置形态上验证过设计，未对其他提供方做过真实联调。
- **成员身份**：schema 3 以内部 `account_id` 为键，`(issuer, sub)` 经 `identities` 关联到内部账号；更换提供方须按下文流程显式关联身份。

## 手机端账号与 `/remote/mobile/*`

手机端与浏览器、桌面使用同一 Keycloak 身份（同一个 `sub`），只是客户端不同：

1. 在 realm 增加公开客户端 `workbench-mobile`（样例见 `workbench-identity.realm.example.json`）：只开授权码流程并强制 PKCE `S256`，关闭直接密码授权和 service account；`redirectUris` 必须写成 App 实际的 `<scheme>:/oauth/callback`（样例的 `com.example.workbench` 只是占位）；同样挂 `workbench-hub` 的 audience mapper。hub 的令牌校验要求 `azp=workbench-mobile` 且 `aud` 含 `workbench-hub`，用桌面或浏览器客户端的令牌调用手机端口一律返回 403 `identity_scope_rejected`。已有 realm 请逐项应用，不要整体覆盖。
2. `me` 返回的昵称和邮箱来自 access token 的 `name` / `email` 声明，因此客户端须申请 `profile` 与 `email` scope；缺失时对应字段为 `null`，不影响登录。
3. **Caddy 路由**：`/remote/mobile/*` 必须与 `/remote/desktop/*` 一样直接反代到 hub（`127.0.0.1:18869`），**不得**经过 oauth2-proxy 的 `forward_auth`，也不要注入 `X-CE-Route-Proof`。手机端没有浏览器 cookie，由 hub 自己用 `Authorization: Bearer` 按上述 `token_verification` 校验。写法参见 `workbench-remote.Caddyfile.example`，与 `/remote/desktop/*` 并列。不要为手机端口开放 CORS：原生 App 不需要，hub 也不会返回任何 `Access-Control-*` 头。
4. 接口（均为 JSON，`Cache-Control: no-store`，错误统一为 `{"error": "<code>"}`；POST 需 `Content-Type: application/json`）：
   - `GET /remote/mobile/me` → `{"account": {"sub", "name", "display_name", "email"}, "membership": "active|inactive|disabled", "admin": bool}`。
   - `GET /remote/mobile/devices` → `{"items": [{"device_id", "name", "state", "last_seen", "created_at", "os_name", "os_version", "app_version", "cleanup_failed"}]}`，仅限本人，最近 20 台（含已撤销）；心跳超过 45 秒的 `online` 显示为 `offline`；时间为 Unix 秒，未知为 `null`。
   - `POST /remote/mobile/activate` `{"invite": "<code>"}` → 同 `me`。被禁用成员返回 403 `member_disabled`，且不消耗邀请码。
   - `POST /remote/mobile/devices/<device_id>/revoke` `{}` → `{"device_id", "state", "cleanup_error"}`，行为与网页撤销一致：非管理员撤销他人设备返回 404（管理员可撤销任意设备）。
   - `POST /remote/mobile/logout` `{}` → `{"logged_out": true, "sessions_invalidated": n}`：使该成员所有浏览器会话失效并记录退出时间。它不会撤销 Keycloak 的 refresh token，App 仍须自行调用 Keycloak 的撤销/退出端点。
   - 限速沿用 hub 内存限速：读取 60 次/分钟，撤销和退出各 10 次/分钟，激活 10 次/分钟。
5. 数据库在首次启动时自动升级，保持表名与 API 不变：schema 1 → 2 仅新增可空列（设备 `created_at`、`os_name`、`os_version`、`app_version`，成员 `last_logout_at`）；2 → 3 见下文“内部 account_id 与身份源更换”。旧版 hub 无法打开已升级的库。`os_name`、`os_version`、`app_version` 由桌面连接器心跳的可选同名字段填充，现有连接器尚未发送，未填时为 `null`。
6. 管理员禁用成员（`set_member(..., "disabled")`）时，该成员所有浏览器会话同时失效。

这些样例同样未经真实服务器验收；`/remote/mobile/*` 的路由与令牌校验须在实际 Keycloak 与 Caddy 上联调。

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

## 内部 account_id 与身份源更换（schema 3）

hub 以内部随机 `account_id`（32 位小写十六进制，不对外返回）识别成员；表 `identities(issuer, sub, account_id)` 记录“身份源账号 → 内部账号”。成员、设备、注册挑战、浏览器会话与邀请的使用者都以 `account_id` 为键，因此更换身份源（例如把 Keycloak 换成别的 OIDC）只需新增一条 `identities` 记录，不再需要改写这些表。令牌校验、`(issuer, sub)` 查找与全部 HTTP 响应保持不变。私有配置中的 `admin_subjects` 是当前配置 `issuer` 下的精确 `sub` 列表；同一内部账号关联的身份继承该账号的管理员权限。

**升级与备份。** 首次用新版启动时，若检测到 schema 1 或 2：

1. 先用 SQLite 在线备份接口把整个库复制到同目录 `control.sqlite3.pre-account-id`（权限 600；即 `<库文件路径>.pre-account-id`）。升级期间不要手工改动该文件；它只在升级前生成，升级成功后不会再被覆盖。
2. 在单个 `BEGIN IMMEDIATE` 事务内：为每个出现过的 `(issuer, sub)` 生成 `account_id`，重建 members/devices/enrollments/browser_sessions，把邀请的 `consumed_by` 由 `[issuer, sub]` JSON 改为 `account_id`，并校验每张表的行数。任何一步出错都会整体回滚，库保持升级前的样子，下次启动可以直接重试。
3. 升级是幂等的：已是 schema 3 的库重复启动不会再改动数据，也不会重写备份。

**回滚。** 停止 hub，用旧版代码部署，并把 `control.sqlite3.pre-account-id` 复制回 `control.sqlite3`（先另存当前文件）。回滚会丢失备份之后产生的成员、设备与会话变化。已确认服务正常运行一段时间后可删除备份。

**一次性副作用。** 隔离存储范围（`X-CE-Storage-Scope`）改由 `account_id` 派生，升级后每位成员的范围值会变化一次，浏览器端按范围保存的本地数据需要重新生成；账号、设备、绑定关系与登录会话不受影响。

**更换身份源流程。**

1. 在新身份源建立用户并让其登录一次（此时没有成员资格，只会被拒绝）；记下新的 `issuer` 与 `sub`。
2. 在 hub 主机上执行（与 `bootstrap-admin` 相同的 `--config`）：

   ```
   python tools/scripts/remote_hub_admin.py list-identities --config <hub.json>
   python tools/scripts/remote_hub_admin.py link-identity --config <hub.json> \
       --from-issuer <旧 issuer> --from-sub <旧 sub> --issuer <新 issuer> --sub <新 sub>
   ```

   也可用 `--account-id <list-identities 输出的 id>` 代替 `--from-*`。命令幂等；如果新身份已经属于另一个有成员资格或设备的账号，会拒绝合并（`identity_already_linked`）；只因先登录而产生的空账号会被并入并使其会话失效。
3. 新身份继承原成员状态和设备。切换 hub 的 `issuer` 时，同时将 `admin_subjects` 更新为新身份源核验过的管理员 `sub`；不能保留旧来源的裸 `sub` 并假定管理员权限自动继承。用新身份实测成员、设备与管理员操作后，再停用旧身份源。

`list-identities` 会输出身份源的 `sub`，属个人信息，仅在 hub 主机本地使用，不要贴到工单或日志里。
