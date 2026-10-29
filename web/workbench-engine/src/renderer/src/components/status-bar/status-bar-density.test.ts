// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import * as usageCollapse from './status-bar-usage-collapse'
import {
  STATUS_BAR_DENSITY_LEVELS,
  pickStatusBarDensityLevel,
  recordStatusBarDensityWidth,
  useStatusBarDensity
} from './status-bar-density'

const TIGHTEST = STATUS_BAR_DENSITY_LEVELS.length - 1
const w = (natural: number, fit = natural) => ({ natural, fit })

describe('useStatusBarDensity', () => {
  it.each([false, true])(
    'settles and expands when folding changes the measurement (content change: %s)',
    (changeContent) => {
      let onResize: ResizeObserverCallback = () => undefined
      const observer = vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: ResizeObserverCallback) {
            onResize = callback
          }
          observe() {}
          unobserve() {}
          disconnect() {}
        }
      )
      let contentChanged = false
      const measure = vi.spyOn(usageCollapse, 'measureUsageRow').mockImplementation((usage) => {
        const collapsed = usage?.dataset.collapsed === 'true'
        if (collapsed && changeContent) contentChanged = true
        const natural = contentChanged ? 200 : 120
        return {
          naturalWidth: natural + (collapsed ? 10 : 0),
          pinnedWidth: 90,
          renderedWidth: collapsed ? 90 : 120,
          chips: [
            {
              provider: 'fixture',
              width: contentChanged ? 120 : 40,
              urgent: false,
              percentage: false,
              collapsed
            }
          ],
          moreChipWidth: 10,
          chipGap: 0,
          unitLabelWidth: 0
        }
      })
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      let barWidth = 100
      function Fixture() {
        const { density, barRef, usageRef, segmentsRef, collapsedUsageProviders } =
          useStatusBarDensity()
        const setBar = (node: HTMLElement | null) => {
          if (node)
            Object.defineProperty(node, 'clientWidth', { value: barWidth, configurable: true })
          barRef(node)
        }
        return React.createElement(
          'div',
          { ref: setBar, style: { padding: '0px', columnGap: '0px' } },
          React.createElement('div', {
            ref: usageRef,
            'data-collapsed': collapsedUsageProviders.length > 0
          }),
          React.createElement('div', {
            ref: segmentsRef,
            'data-density': STATUS_BAR_DENSITY_LEVELS.indexOf(density)
          })
        )
      }
      try {
        act(() => root.render(React.createElement(Fixture)))
        expect(container.querySelector('[data-density]')?.getAttribute('data-density')).toBe('3')
        expect(container.querySelector('[data-collapsed]')?.getAttribute('data-collapsed')).toBe(
          'true'
        )
        barWidth = 150
        Object.defineProperty(container.firstElementChild, 'clientWidth', {
          value: barWidth,
          configurable: true
        })
        act(() => onResize([], {} as ResizeObserver))
        if (changeContent) {
          expect(container.querySelector('[data-density]')?.getAttribute('data-density')).toBe('3')
          barWidth = 250
          Object.defineProperty(container.firstElementChild, 'clientWidth', {
            value: barWidth,
            configurable: true
          })
          act(() => onResize([], {} as ResizeObserver))
        }
        expect(container.querySelector('[data-density]')?.getAttribute('data-density')).toBe('0')
        expect(container.querySelector('[data-collapsed]')?.getAttribute('data-collapsed')).toBe(
          'false'
        )
      } finally {
        act(() => root.unmount())
        container.remove()
        measure.mockRestore()
        observer.unstubAllGlobals()
      }
    }
  )
})

describe('STATUS_BAR_DENSITY_LEVELS', () => {
  it('collapses usage into "+N" before right-side segments lose their labels', () => {
    const firstCollapse = STATUS_BAR_DENSITY_LEVELS.findIndex((level) => level.collapseUsage)
    const firstIconOnly = STATUS_BAR_DENSITY_LEVELS.findIndex((level) => level.segmentsIconOnly)
    expect(firstCollapse).toBeGreaterThan(-1)
    expect(firstCollapse).toBeLessThan(firstIconOnly)
  })
})

describe('pickStatusBarDensityLevel', () => {
  it('keeps the roomiest level that fits', () => {
    expect(pickStatusBarDensityLevel([w(700), w(600), w(500), w(400), w(300)], 800)).toBe(0)
    expect(pickStatusBarDensityLevel([w(700), w(600), w(500), w(400), w(300)], 550)).toBe(2)
  })

  it('fits a collapsing level by its collapsed width, not its natural width', () => {
    // Level 3 would need 500 with every chip, but 380 with calm chips folded into "+N".
    expect(pickStatusBarDensityLevel([w(700), w(600), w(500), w(500, 380), w(300)], 400)).toBe(3)
  })

  it('probes an unmeasured level before settling on a tighter one', () => {
    expect(pickStatusBarDensityLevel([w(700), undefined, w(500)], 650)).toBe(1)
    expect(pickStatusBarDensityLevel([], 650)).toBe(0)
  })

  it('falls back to the tightest level when nothing fits', () => {
    expect(pickStatusBarDensityLevel([w(700), w(600), w(500), w(400), w(300)], 200)).toBe(TIGHTEST)
  })

  it('tolerates sub-pixel rounding at the boundary', () => {
    expect(pickStatusBarDensityLevel([w(600.6)], 600)).toBe(0)
  })
})

describe('recordStatusBarDensityWidth', () => {
  it('fills in a level without disturbing the others', () => {
    expect(recordStatusBarDensityWidth([w(700), undefined, w(500)], 1, w(600))).toEqual([
      w(700),
      w(600),
      w(500)
    ])
  })

  it('forgets other levels when a level re-measures differently', () => {
    // A segment appeared or vanished, so the other levels' widths no longer describe the bar.
    expect(recordStatusBarDensityWidth([w(700), w(600), w(500)], 1, w(640))).toEqual([
      undefined,
      w(640)
    ])
  })

  it('drops only the other collapsing levels when only the collapsed width moves', () => {
    // Urgency changes which chips collapse, moving fit widths but never the natural one.
    expect(
      recordStatusBarDensityWidth(
        [w(700), w(600), w(500), w(600, 450), w(500, 400)],
        3,
        w(600, 430)
      )
    ).toEqual([w(700), w(600), w(500), w(600, 430), undefined])
  })

  it('re-probes a roomier collapsing level once the tightest level sees its fit move', () => {
    // Level 3's stale fit (450) kept the bar at level 4; fewer urgent chips now let it fit.
    const settled = [w(700), w(600), w(500), w(600, 450), w(500, 400)]
    expect(pickStatusBarDensityLevel(settled, 420)).toBe(TIGHTEST)
    const remeasured = recordStatusBarDensityWidth(settled, TIGHTEST, w(500, 380))
    expect(remeasured).toEqual([w(700), w(600), w(500), undefined, w(500, 380)])
    expect(pickStatusBarDensityLevel(remeasured, 420)).toBe(3)
    const probed = recordStatusBarDensityWidth(remeasured, 3, w(600, 410))
    expect(pickStatusBarDensityLevel(probed, 420)).toBe(3)
  })

  it('keeps other levels on a sub-pixel re-measure', () => {
    expect(recordStatusBarDensityWidth([w(700), w(600), w(500)], 1, w(600.5))).toEqual([
      w(700),
      w(600.5),
      w(500)
    ])
  })
})
