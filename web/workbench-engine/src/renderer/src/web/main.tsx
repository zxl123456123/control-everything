import '../assets/main.css'

import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import { initWebDeviceKeySupport } from './web-device-key-support'
import { translate } from '../i18n/i18n'
import { installOsFileDropCancellationGuard } from '../lib/os-file-drop-cancellation-guard'
import { installAppKeyboardRouter } from '../lib/app-keyboard-router'
import { applyDocumentTheme, type DocumentThemePreference } from '../lib/document-theme'
import { readJson, SETTINGS_STORAGE_KEY } from './preload-api/web-storage'

// Use the same saved appearance before the project runtime and App finish loading.
applyDocumentTheme(
  readJson<{ theme: DocumentThemePreference }>(SETTINGS_STORAGE_KEY, { theme: 'system' }).theme,
  { disableTransitions: false }
)

const disposeOsFileDropGuard = installOsFileDropCancellationGuard()
import.meta.hot?.dispose(disposeOsFileDropGuard)
installAppKeyboardRouter()
const StandaloneWebRoot = lazy(() => import('./standalone-web-root'))
const PlatformProjectEntry = lazy(() => import('./platform-project-entry'))
const platformMode = ['/studio', '/workbench/web-index.html'].includes(window.location.pathname)

function WebRootBoundary(): React.JSX.Element {
  useTranslation()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="web.root"
      surface="web-root"
      title={
        platformMode
          ? '项目工作区显示遇到问题'
          : translate('app.recoverableError.webTitle', 'Orca web hit a renderer error.')
      }
      description={translate(
        'app.recoverableError.webDescription',
        'Retry the web client or reconnect to the paired runtime.'
      )}
    >
      {platformMode ? (
        <Suspense fallback={<div className="min-h-dvh bg-background p-6">正在打开项目工作区…</div>}>
          <PlatformProjectEntry />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
          <StandaloneWebRoot />
        </Suspense>
      )}
    </RecoverableRenderErrorBoundary>
  )
}

// Platform startup probes after its protected bootstrap; standalone pairing probes before import.
void (platformMode ? Promise.resolve() : initWebDeviceKeySupport())
  .catch((error: unknown) => console.warn('[web] Device key probe failed', error))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<WebRootBoundary />)
  })
