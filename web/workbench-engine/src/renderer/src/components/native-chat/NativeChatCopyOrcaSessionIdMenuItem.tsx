import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

/** Copies the chat's session ID from the host: `agent_session:<root>`, which `/clear` keeps. */
export function NativeChatCopyOrcaSessionIdMenuItem({
  resolveOrcaSessionId
}: {
  resolveOrcaSessionId: () => Promise<string | null>
}): React.JSX.Element {
  const copyOrcaSessionId = async (): Promise<void> => {
    try {
      const orcaSessionId = await resolveOrcaSessionId()
      if (!orcaSessionId) {
        throw new Error('no session ID')
      }
      await window.api.ui.writeClipboardText(orcaSessionId)
      toast.success(
        translate('components.native-chat.contextMenu.orcaSessionIdCopied', 'Session ID copied')
      )
    } catch {
      toast.error(
        translate(
          'components.native-chat.contextMenu.orcaSessionIdCopyFailed',
          'Unable to copy session ID'
        )
      )
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem onSelect={() => void copyOrcaSessionId()}>
          <Copy />
          {translate('components.native-chat.contextMenu.copyOrcaSessionId', 'Copy Session ID')}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-[220px]">
        {translate(
          'components.native-chat.contextMenu.orcaSessionIdTooltip',
          "Identifies this chat to other agents; distinct from the agent CLI's session ID."
        )}
      </TooltipContent>
    </Tooltip>
  )
}
