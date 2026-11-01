import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unavailableSessionSearchStatus } from '../../../../shared/ai-vault-search-client'
import type { AiVaultSearchStatus } from '../../../../shared/ai-vault-search-types'
import { FEATURE_TIPS, type FeatureTip } from '../../../../shared/feature-tips'
import { SessionSearchTipDialog } from './SessionSearchTipDialog'
import type { SessionSearchTipStage } from './use-session-search-tip-setup'
import { i18n, setRendererUiLanguage } from '@/i18n/i18n'

vi.mock('./SessionSearchFeatureTipVisual', () => ({
  SessionSearchFeatureTipVisual: () => <div data-testid="session-search-visual" />
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>
}))

function getTip(): FeatureTip {
  const tip = FEATURE_TIPS.find((entry) => entry.id === 'agent-session-search')
  if (!tip) {
    throw new Error('Expected agent-session-search feature tip fixture')
  }
  return tip
}

function render(stage: SessionSearchTipStage, status: AiVaultSearchStatus | null): string {
  return renderToStaticMarkup(
    <SessionSearchTipDialog
      open
      tip={getTip()}
      primaryBusy={false}
      onOpenChange={() => {}}
      onPrimaryAction={() => {}}
      onSettingsClick={() => {}}
      stage={stage}
      status={status}
    />
  )
}

describe('SessionSearchTipDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers session search without mounting the platform demonstration', async () => {
    vi.stubGlobal('window', { location: { pathname: '/workbench/web-index.html' } })
    await setRendererUiLanguage('zh')
    const html = render('offer', null)
    expect(html).toContain('查找智能体历史会话')
    expect(html).toContain('开启会话搜索')
    expect(html).not.toContain('session-search-visual')
    expect(
      render('indexing', { ...unavailableSessionSearchStatus(), enabled: true })
    ).not.toContain('Orca')
  })
  it('offers to turn search on and links to its settings', () => {
    const html = render('offer', null)
    expect(html).toContain('Search every agent session')
    expect(html).toContain('Turn on session search')
    expect(html).toContain('Settings → Agent Session Search')
    expect(html).toContain('session-search-visual')
  })

  it('shows live progress and lets indexing continue in the background', () => {
    const html = render('indexing', {
      ...unavailableSessionSearchStatus(),
      enabled: true,
      phase: 'indexing',
      filesIndexed: 120,
      filesDue: 380,
      messagesIndexed: 5000
    })
    expect(html).toContain('Indexing your agent sessions')
    expect(html).toContain('Settings → Agent Session Search')
    expect(html).toContain('120 of 500 sessions')
    expect(html).toContain('Continue in background')
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/)
    expect(html).toContain('session-search-visual')
  })

  it('does not call a not-yet-started indexer unavailable', () => {
    const html = render('indexing', { ...unavailableSessionSearchStatus(), enabled: true })
    expect(html).toContain('Finding your sessions')
    expect(html).not.toContain('not available')
  })

  it('offers to start searching once the index is ready', () => {
    const html = render('ready', {
      ...unavailableSessionSearchStatus(),
      enabled: true,
      phase: 'current',
      filesIndexed: 500,
      lastSweepCompletedAt: 1
    })
    expect(html).toContain('Session search is ready')
    expect(html).toContain('Start searching')
    expect(html).toContain('Settings → Agent Session Search')
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/)
  })
})
