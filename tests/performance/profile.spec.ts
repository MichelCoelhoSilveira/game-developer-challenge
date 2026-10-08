import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

declare global {
  interface Window {
    __PIRATE_GAME_TEST__?: {
      getState: () => { elapsed: number; entities: { enemies: number; wrecks: number; projectiles: number; explosions: number; crew: number; total: number } }
      setTimeScale: (scale: number) => void
      setSeed: (seed: number) => void
      setSpawnEnabled: (enabled: boolean) => void
      setPlayerInvulnerable: (enabled: boolean) => void
    }
    __PERF_CAPTURE__?: { started: number; frames: number[]; entities: Array<{ at: number; elapsed: number; enemies: number; wrecks: number; projectiles: number; explosions: number; crew: number; total: number }> }
  }
}

const reportPath = path.resolve('performance-report/results.json')
function saveSection(section: string, value: unknown) {
  mkdirSync(path.dirname(reportPath), { recursive: true })
  let report: Record<string, unknown> = {}
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown> } catch { /* first run */ }
  report[section] = value
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

async function preparePage(page: Page, duration = 180) {
  await page.addInitScript((matchDuration) => {
    localStorage.clear()
    localStorage.setItem('pirate-battle:player-options:v1', JSON.stringify({ gameSessionTime: matchDuration, enemySpawnTime: 2 }))
    localStorage.setItem('pirate-battle:network-scenario:v1', 'success')
  }, duration)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible()
}

test('records a three-minute optimized gameplay session', async ({ page, browser }, testInfo) => {
  await preparePage(page, 180)
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.locator('.arena-canvas')).toBeVisible({ timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setSeed(202609)
    game.setTimeScale(1)
    game.setSpawnEnabled(true)
    game.setPlayerInvulnerable(true)
    const capture = window.__PERF_CAPTURE__ = { started: performance.now(), frames: [], entities: [] }
    let last = 0
    const recordFrame = (now: number) => {
      if (last) capture.frames.push(now - last)
      last = now
      if (now - capture.started < 190_000) requestAnimationFrame(recordFrame)
    }
    requestAnimationFrame(recordFrame)
    window.setInterval(() => {
      const state = window.__PIRATE_GAME_TEST__?.getState()
      if (state) capture.entities.push({ at: performance.now() - capture.started, elapsed: state.elapsed, ...state.entities })
    }, 1000)
  })

  const started = Date.now()
  await page.keyboard.down('w')
  await page.keyboard.down('d')
  let nextShot = started
  while (!(await page.getByRole('heading', { name: /time is up/i }).count())) {
    if (Date.now() - started > 225_000) throw new Error('Match did not reach its 180-second limit within 225 seconds')
    if (Date.now() >= nextShot) {
      await page.keyboard.press('l')
      nextShot = Date.now() + 1000
    }
    await page.waitForTimeout(250)
  }
  await page.keyboard.up('w')
  await page.keyboard.up('d')

  const raw = await page.evaluate(() => ({ capture: window.__PERF_CAPTURE__, result: localStorage.getItem('pirate-battle:last-match:v1'), userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } }))
  const intervals = raw.capture?.frames ?? []
  const sorted = [...intervals].sort((a, b) => a - b)
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  const sum = intervals.reduce((total, value) => total + value, 0)
  const entitySamples = raw.capture?.entities ?? []
  const max = (key: 'enemies' | 'wrecks' | 'projectiles' | 'explosions' | 'crew' | 'total') => Math.max(0, ...entitySamples.map((sample) => sample[key]))
  const result = raw.result ? JSON.parse(raw.result) as { durationSeconds?: number; reason?: string } : null
  const evidence = {
    capturedAt: new Date().toISOString(),
    mode: 'Vite optimized production build (e2e telemetry enabled)',
    browser: { name: browser.browserType().name(), version: browser.version(), userAgent: raw.userAgent },
    machine: { platform: `${os.type()} ${os.release()}`, architecture: os.arch(), cpu: os.cpus()[0]?.model ?? 'unknown', logicalCores: os.cpus().length, totalMemoryGiB: Math.round(os.totalmem() / 1024 ** 3 * 10) / 10, gpu: 'Not measured' },
    display: raw.viewport,
    match: { configuredSeconds: 180, seed: 202609, spawnIntervalSeconds: 2, invulnerable: true, controls: 'W+D movement; L fired at one-second intervals' },
    frame: { count: intervals.length, averageFps: sum ? Math.round(intervals.length / (sum / 1000) * 100) / 100 : 0, p95IntervalMs: Math.round(percentile(0.95) * 100) / 100, framesOver16_67msPercent: intervals.length ? Math.round(intervals.filter((value) => value > 16.67).length / intervals.length * 10000) / 100 : 0, framesOver33_33msPercent: intervals.length ? Math.round(intervals.filter((value) => value > 33.33).length / intervals.length * 10000) / 100 : 0 },
    entities: { samples: entitySamples.length, peakEnemies: max('enemies'), peakWrecks: max('wrecks'), peakProjectiles: max('projectiles'), peakExplosions: max('explosions'), peakCrew: max('crew'), peakTotal: max('total') },
    completion: result,
  }
  saveSection('gameplay', evidence)
  await testInfo.attach('gameplay-profile.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
  expect(result?.reason).toBe('time')
  expect(result?.durationSeconds).toBe(180)
  expect(intervals.length).toBeGreaterThan(5_000)
})

test('records memory and browser nodes over five start-play-exit cycles', async ({ page, browser }, testInfo) => {
  await preparePage(page, 60)
  const session = await page.context().newCDPSession(page)
  await session.send('Performance.enable')
  await session.send('HeapProfiler.enable')
  const sample = async (label: string) => {
    await session.send('HeapProfiler.collectGarbage')
    const metrics = await session.send('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> }
    const values = Object.fromEntries(metrics.metrics.map(({ name, value }) => [name, value]))
    return { label, usedHeapMiB: Math.round(((values.JSHeapUsedSize ?? 0) / 1024 ** 2) * 100) / 100, heapTotalMiB: Math.round(((values.JSHeapTotalSize ?? 0) / 1024 ** 2) * 100) / 100, documentNodes: values.Nodes ?? 0 }
  }
  const samples = [await sample('menu-baseline')]
  const liveEntities = []
  for (let cycle = 1; cycle <= 5; cycle++) {
    await page.getByRole('button', { name: 'Start game' }).click()
    await expect(page.locator('.arena-canvas')).toBeVisible({ timeout: 20_000 })
    await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
    await page.evaluate((seed) => { window.__PIRATE_GAME_TEST__!.setSeed(seed); window.__PIRATE_GAME_TEST__!.setTimeScale(1); window.__PIRATE_GAME_TEST__!.setSpawnEnabled(false) }, 202609 + cycle)
    await page.keyboard.down('w')
    await page.keyboard.press('l')
    await page.waitForTimeout(1200)
    liveEntities.push(await page.evaluate(() => window.__PIRATE_GAME_TEST__!.getState().entities))
    await page.keyboard.up('w')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /leave battle/i }).click()
    await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible()
    await page.waitForTimeout(300)
    samples.push(await sample(`after-cycle-${cycle}`))
  }
  const evidence = { capturedAt: new Date().toISOString(), browser: { name: browser.browserType().name(), version: browser.version() }, method: 'Chromium CDP Performance metrics after forced V8 GC; five Pixi arena mount/play/unmount cycles', liveEntities, samples, netChange: { heapUsedMiB: Math.round((samples.at(-1)!.usedHeapMiB - samples[0].usedHeapMiB) * 100) / 100, documentNodes: samples.at(-1)!.documentNodes - samples[0].documentNodes } }
  saveSection('memoryCycles', evidence)
  await testInfo.attach('memory-cycles-profile.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
  await session.detach()
  expect(samples).toHaveLength(6)
})
