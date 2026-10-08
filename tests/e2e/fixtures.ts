import { expect, test as base, type Page } from '@playwright/test'

declare global {
  interface Window {
    __PIRATE_GAME_TEST__?: {
      getState: () => {
        player: { x: number; y: number; angle: number; hp: number }
        enemies: Array<{ x: number; y: number; hp: number; kind?: 'chaser' | 'shooter'; dead: boolean }>
        projectileCount: number
        shotsFired: number[]
        enemyShotsFired: number
        entities: { enemies: number; wrecks: number; projectiles: number; explosions: number; crew: number; total: number }
        hits: number
        score: number
        elapsed: number
        paused: boolean
      }
      setTimeScale: (scale: number) => void
      setSeed: (seed: number) => void
      setSpawnEnabled: (enabled: boolean) => void
      setPlayerInvulnerable: (enabled: boolean) => void
      setPlayerPose: (x: number, y: number, angle: number) => void
      spawnEnemy: (x: number, y: number, kind: 'chaser' | 'shooter') => void
    }
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('pirate-battle:e2e-initialized') !== 'yes') {
        localStorage.clear()
        localStorage.setItem('pirate-battle:player-options:v1', JSON.stringify({ gameSessionTime: 60, enemySpawnTime: 3 }))
        localStorage.setItem('pirate-battle:network-scenario:v1', 'success')
        sessionStorage.setItem('pirate-battle:e2e-initialized', 'yes')
      }
    })
    // Playwright fixtures use this continuation function to provide the page.
    // oxlint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
  },
})

export { expect }

export async function openMenu(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible()
}

export async function startGame(page: Page) {
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.locator('.arena-canvas')).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setSeed(202608)
    game.setTimeScale(0)
  })
}

export async function gameState(page: Page) {
  return page.evaluate(() => window.__PIRATE_GAME_TEST__!.getState())
}

export async function chooseScenario(page: Page, scenario: string) {
  await page.getByRole('button', { name: 'Options' }).click()
  await page.locator('#network-scenario').selectOption(scenario)
  await page.getByRole('button', { name: 'Main menu' }).click()
}
