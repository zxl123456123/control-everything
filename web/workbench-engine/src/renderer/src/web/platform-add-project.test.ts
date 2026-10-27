// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createUiModalActions } from '../store/slices/ui/ui-slice-modal-actions'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

it.each(['/studio', '/workbench/web-index.html'])('opens the original project dialog at %s', (url) => {
  window.history.replaceState(null, '', url)
  const set = vi.fn(),
    interaction = vi.fn(),
    dispatch = vi.spyOn(window, 'dispatchEvent')
  const actions = createUiModalActions(set, (() => ({
    modalData: {},
    recordFeatureInteraction: interaction
  })) as never)
  const data = { droppedLocalPath: '/projects/existing' }
  actions.openModal!('add-repo', data)
  expect(dispatch).not.toHaveBeenCalled()
  expect(set).toHaveBeenCalledWith({ activeModal: 'add-repo', modalData: data })
  expect(interaction).toHaveBeenCalledWith('workspace-creation')
})

it('keeps the original project dialog outside the integrated platform', () => {
  const set = vi.fn()
  const actions = createUiModalActions(set, (() => ({ modalData: {} })) as never)
  actions.openModal!('add-repo')
  expect(set).toHaveBeenCalledWith({ activeModal: 'add-repo', modalData: {} })
})
