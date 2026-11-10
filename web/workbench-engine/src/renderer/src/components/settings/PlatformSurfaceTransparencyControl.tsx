import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_WORKBENCH_SURFACE_OPACITY,
  normalizeWorkbenchSurfaceOpacity
} from '../../../../shared/workbench-appearance'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { Slider } from '../ui/slider'
import { Button } from '../ui/button'
import { SettingsRow } from './SettingsFormControls'

type PlatformSurfaceTransparencyControlProps = {
  opacity: number | undefined
}

export function PlatformSurfaceTransparencyControl({
  opacity
}: PlatformSurfaceTransparencyControlProps): React.JSX.Element {
  const savedOpacity = normalizeWorkbenchSurfaceOpacity(opacity)
  const latestSaved = useRef(savedOpacity)
  latestSaved.current = savedOpacity
  const [draft, setDraft] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const value = draft ?? Math.round((1 - savedOpacity) * 100)
  const title = translate('settings.appearance.surfaceTransparency.title', 'Interface Transparency')

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      document.documentElement.style.setProperty(
        '--ce-workbench-opacity',
        String(latestSaved.current)
      )
    }
  }, [])

  const preview = (transparency: number) => {
    setDraft(transparency)
    document.documentElement.style.setProperty(
      '--ce-workbench-opacity',
      String(normalizeWorkbenchSurfaceOpacity((100 - transparency) / 100))
    )
  }
  const save = async (transparency: number) => {
    if (saving) return
    preview(transparency)
    setSaving(true)
    setError('')
    try {
      await useAppStore.getState().updateSettingsOrThrow({
        workbenchSurfaceOpacity: normalizeWorkbenchSurfaceOpacity((100 - transparency) / 100)
      })
    } catch {
      document.documentElement.style.setProperty(
        '--ce-workbench-opacity',
        String(latestSaved.current)
      )
      if (mounted.current) {
        setError(
          translate(
            'settings.appearance.surfaceTransparency.saveError',
            'Could not save the appearance. Your previous setting has been restored.'
          )
        )
      }
    } finally {
      if (mounted.current) {
        setDraft(null)
        setSaving(false)
      }
    }
  }

  return (
    <>
      <SettingsRow
        className="max-sm:flex-col max-sm:items-stretch"
        label={title}
        description={translate(
          'settings.appearance.surfaceTransparency.description',
          "Let the background show through workspace panels, including terminals. The terminal's own background opacity is applied on top."
        )}
        control={
          <div className="flex w-44 flex-col gap-2 max-sm:w-full" aria-busy={saving}>
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={45}
                step={1}
                value={[value]}
                disabled={saving}
                thumbLabels={[title]}
                thumbValueLabels={[`${value}%`]}
                onValueChange={([next]) => preview(next)}
                onValueCommit={([next]) => void save(next)}
              />
              <output className="w-9 shrink-0 text-right text-sm tabular-nums">{value}%</output>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-end text-xs"
              disabled={
                saving || value === Math.round((1 - DEFAULT_WORKBENCH_SURFACE_OPACITY) * 100)
              }
              onClick={() => void save(Math.round((1 - DEFAULT_WORKBENCH_SURFACE_OPACITY) * 100))}
            >
              {translate('settings.appearance.surfaceTransparency.reset', 'Reset to 18%')}
            </Button>
          </div>
        }
      />
      {error ? (
        <p role="alert" className="pb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}
