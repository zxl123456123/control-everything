import { createElement } from 'react'
import type { LucideProps } from 'lucide-react'
import { ListChecks } from 'lucide-react'
import logo from '../../../../../resources/logo.svg'
import { cn } from '@/lib/utils'

export function OrcaLogoSettingsIcon({ className }: LucideProps): React.JSX.Element {
  if (
    typeof window !== 'undefined' &&
    ['/studio', '/workbench/web-index.html'].includes(window.location.pathname)
  ) {
    return createElement(ListChecks, { className, 'aria-hidden': true })
  }
  return createElement('img', {
    src: logo,
    alt: '',
    'aria-hidden': true,
    className: cn('object-contain invert dark:invert-0', className)
  })
}
