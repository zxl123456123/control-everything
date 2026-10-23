// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createUiModalActions } from '../store/slices/ui/ui-slice-modal-actions'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

it('uses the shared project registration flow from the integrated native add action', () => {
  window.history.replaceState(null, '', '/studio')
  const set = vi.fn(),
    interaction = vi.fn(),
    opened = vi.fn()
  window.addEventListener('platform-add-project', opened, { once: true })
  const actions = createUiModalActions(set, (() => ({
    modalData: {},
    recordFeatureInteraction: interaction
  })) as never)
  actions.openModal!('add-repo')
  expect(opened).toHaveBeenCalledOnce()
  expect(set).not.toHaveBeenCalled()
})

it('keeps the original project dialog outside the integrated platform', () => {
  const set = vi.fn()
  const actions = createUiModalActions(set, (() => ({ modalData: {} })) as never)
  actions.openModal!('add-repo')
  expect(set).toHaveBeenCalledWith({ activeModal: 'add-repo', modalData: {} })
})
