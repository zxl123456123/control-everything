import { createContext } from 'react'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'

// Undefined is standalone; null is integrated but has no current, verified project.
export const PlatformProjectContext = createContext<PlatformProjectBootstrap | null | undefined>(
  undefined
)
