import App from '../App'
import { I18nProvider } from '../i18n/I18nProvider'

// Business pages do not need the store, language plugins or terminal renderer.
void import('../lib/pane-manager/pane-webgl-renderer').then((module) =>
  module.primeTerminalWebglAddon()
)

export default function PlatformWorkspaceApp(): React.JSX.Element {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  )
}
