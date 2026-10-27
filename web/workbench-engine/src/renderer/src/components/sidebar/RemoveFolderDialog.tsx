import React, { useCallback, useContext, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  getRepoExecutionHostId,
  isRuntimeOwnedSshTargetId,
  normalizeExecutionHostId
} from '../../../../shared/execution-host'
import { countOpenRepoTerminalTabs } from '@/store/repos/repo-removal'
import { getRecipeVmSshTargetForHost } from '@/lib/recipe-vm-managed-host'
import { RemovalUnsavedFilesNotice } from './RemovalUnsavedFilesNotice'
import { confirmUnsavedDiscard } from '@/store/slices/worktrees/teardown/removed-workspace-unsaved-files'
import { projectRemovalTargets } from './removal-unsaved-files'
import { PlatformProjectContext } from '@/web/platform-project-context'
import { archivePlatformProject } from '@/web/platform-project-actions'
import { toast } from 'sonner'
import {
  selectDetectedWorktreesByRepo,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'

// Why: interpolated into the sentence so locales control where the name sits;
// U+0000 cannot appear in a real project name, so the split is unambiguous.
const NAME_TOKEN = '\u0000'

const RemoveFolderDialog = React.memo(function RemoveFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const removeProject = useAppStore((s) => s.removeProject)
  const platformMode = useContext(PlatformProjectContext) !== undefined
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const isOpen = activeModal === 'confirm-remove-folder'
  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const displayName = typeof modalData.displayName === 'string' ? modalData.displayName : ''
  const hostId =
    typeof modalData.hostId === 'string' ? normalizeExecutionHostId(modalData.hostId) : null

  // Why: for an SSH project the files live on the remote host's disk, not the
  // user's — "still on your disk" would be misleading. Name the host (using the
  // removed-target label when it's a ghost) so the user knows where it remains
  // and that re-adding that host recovers it.
  const sshConnectionId = useAppStore(
    (s) =>
      s.repos
        .find((repo) => repo.id === repoId && (!hostId || getRepoExecutionHostId(repo) === hostId))
        ?.connectionId?.trim() ?? null
  )
  const sshHostLabel = useAppStore((s) => {
    if (!sshConnectionId) {
      return null
    }
    return (
      s.sshTargetLabels.get(sshConnectionId) ??
      s.removedSshTargetLabels.get(sshConnectionId) ??
      sshConnectionId
    )
  })

  const onRecipeVmServer = useAppStore(
    (s) =>
      getRecipeVmSshTargetForHost(s.runtimeEnvironments, hostId) !== null ||
      (selectWorktreesByRepo(s)[repoId] ?? []).some(
        (worktree) =>
          worktree.hostId === hostId && worktree.ephemeralVmCheckoutMode === 'provisioned-root'
      )
  )

  const worktreesByRepo = useAppStore((s) => selectWorktreesByRepo(s))
  const detectedWorktreesByRepo = useAppStore((s) => selectDetectedWorktreesByRepo(s))
  const unsavedTargets = useMemo(
    () =>
      projectRemovalTargets(
        { worktreesByRepo, detectedWorktreesByRepo },
        repoId ? [{ repoId, hostId }] : []
      ),
    [detectedWorktreesByRepo, hostId, repoId, worktreesByRepo]
  )

  const openTerminalCount = useAppStore((s) =>
    repoId && hostId ? countOpenRepoTerminalTabs(s, repoId, hostId) : 0
  )
  const openTerminalWarning =
    openTerminalCount === 0
      ? null
      : openTerminalCount === 1
        ? translate(
            'auto.components.sidebar.RemoveFolderDialog.openTerminalWarningOne',
            '1 open terminal in this project will be closed.'
          )
        : translate(
            'auto.components.sidebar.RemoveFolderDialog.openTerminalWarningMany',
            '{{count}} open terminals in this project will be closed.',
            { count: openTerminalCount }
          )

  // Why: fragment concatenation around the styled name cannot be reordered by
  // SOV locales (#9294). Translate one full sentence with the name as a
  // sentinel token, then split on it to re-apply the inline emphasis.
  const description =
    platformMode
      ? `归档 ${NAME_TOKEN}，从常用项目中收起；保留事项、文件、已打开的终端和草稿。`
      : onRecipeVmServer || isRuntimeOwnedSshTargetId(sshConnectionId)
      ? translate(
          'auto.components.sidebar.RemoveFolderDialog.removeDescriptionVmRecipe',
          'This removes {{name}} from Orca. Its VM recipe determines whether the environment and its files are permanently deleted.',
          { name: NAME_TOKEN }
        )
      : sshHostLabel
        ? translate(
            'auto.components.sidebar.RemoveFolderDialog.removeDescriptionSsh',
            'This only removes {{name}} from Orca. Its files stay on {{host}} — re-add that SSH host to recover it.',
            { name: NAME_TOKEN, host: sshHostLabel }
          )
        : translate(
            'auto.components.sidebar.RemoveFolderDialog.removeDescriptionLocal',
            'This only removes {{name}} from Orca. It is still on your disk.',
            { name: NAME_TOKEN }
          )
  const [descriptionBeforeName, descriptionAfterName] = description.split(NAME_TOKEN)

  const handleConfirm = useCallback(async () => {
    if (pendingRef.current) return
    if (platformMode) {
      const repo = useAppStore.getState().repos.find((entry) => entry.id === repoId && getRepoExecutionHostId(entry) === hostId)
      if (!repo) { toast.error('项目已变化，请刷新后重试。'); return }
      pendingRef.current = true
      setPending(true)
      try {
        await archivePlatformProject(repo)
        const current = useAppStore.getState()
        if (current.activeModal === 'confirm-remove-folder' && current.modalData.repoId === repoId &&
            current.modalData.hostId === hostId) closeModal()
      }
      catch (error) { toast.error(error instanceof Error ? error.message : '项目归档未确认。') }
      finally { pendingRef.current = false; setPending(false) }
      return
    }
    // Why: without the opener's host a bare id could remove another host's row (#13071).
    if (repoId && hostId) {
      void removeProject(repoId, {
        hostId,
        errorFeedback: 'toast',
        confirmedDiscards: confirmUnsavedDiscard(useAppStore.getState, unsavedTargets)
      })
    }
    closeModal()
  }, [closeModal, hostId, platformMode, removeProject, repoId, unsavedTargets])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !pendingRef.current) {
        closeModal()
      }
    },
    [closeModal]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent surface="security" className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.RemoveFolderDialog.b79b39d865', 'Remove Project')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {descriptionBeforeName}
            <span className="break-all font-medium text-foreground">{displayName}</span>
            {descriptionAfterName}
          </DialogDescription>
          {!platformMode && openTerminalWarning ? (
            <p className="text-xs font-medium text-foreground">{openTerminalWarning}</p>
          ) : null}
        </DialogHeader>
        {!platformMode ? <RemovalUnsavedFilesNotice targets={unsavedTargets} enabled={isOpen} /> : null}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>
            {translate('auto.components.sidebar.RemoveFolderDialog.d36883e046', 'Cancel')}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => void handleConfirm()}>
            {translate('auto.components.sidebar.RemoveFolderDialog.4dc5b5065b', 'Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default RemoveFolderDialog
