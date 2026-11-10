// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ManagementSurfaceProvider } from '@/components/ui/management-surface'
import { SkillRow } from './SkillRow'
import type { DiscoveredSkill } from '../../../../shared/skills'

const skill: DiscoveredSkill = {
  id: 'sample',
  name: 'Review',
  description: 'Review changes',
  providers: ['codex'],
  sourceKind: 'home',
  sourceLabel: 'Home',
  rootPath: '/skills',
  directoryPath: '/skills/review',
  skillFilePath: '/skills/review/SKILL.md',
  installed: true,
  updatedAt: null
}
afterEach(cleanup)

it.each([true, false])(
  'the associated selection label changes only eligible rows (eligible=%s)',
  async (selectable) => {
    const onSelectionChange = vi.fn()
    const onOpenDetail = vi.fn()
    render(
      <TooltipProvider>
        <ManagementSurfaceProvider value={true}>
          <SkillRow
            skill={skill}
            selectionMode
            selected={false}
            selectable={selectable}
            shareable={selectable}
            deletable={false}
            deleteDisabledReason="Unavailable"
            disabledLabel="Unavailable"
            disabledReason={null}
            focusable
            onOpenDetail={onOpenDetail}
            onSelectionChange={onSelectionChange}
            onShare={vi.fn()}
            onDelete={vi.fn()}
            onReveal={vi.fn()}
            onFocus={vi.fn()}
            onKeyDown={vi.fn()}
          />
        </ManagementSurfaceProvider>
      </TooltipProvider>
    )
    const control = screen.getByRole('checkbox', { name: 'Select Review' })
    const label = control.closest('label')
    expect(label).not.toBeNull()
    await userEvent.click(label!)
    if (selectable) expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith(true, false)
    else expect(onSelectionChange).not.toHaveBeenCalled()
    expect(onOpenDetail).not.toHaveBeenCalled()
  }
)
