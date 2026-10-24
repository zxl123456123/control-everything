import { remoteContext, assertContextActive } from './remote-context'

remoteContext()
void Promise.resolve().then(() => { assertContextActive(); return import('./web-root') }).catch(() => {
  document.getElementById('root')!.textContent = '页面连接已失效，请返回账号页面重新打开。'
})
