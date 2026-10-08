import { expect, openMenu, startGame, test } from './fixtures'

test('visual baseline: main menu', async ({ page }, testInfo) => {
  await openMenu(page)
  await expect(page.getByRole('tab', { name: 'Ranking' })).toBeVisible()
  await expect(page).toHaveScreenshot(`${testInfo.project.name}-menu.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  })
})

test('visual baseline: stable arena', async ({ page }, testInfo) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setTimeScale(0)
    game.setSpawnEnabled(false)
  })
  await expect(page).toHaveScreenshot(`${testInfo.project.name}-arena.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  })
})

test('visual baseline: result screen', async ({ page }, testInfo) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(200))
  await expect(page.getByRole('heading', { name: 'Time is up' })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('Match recorded in ranking and history.')).toBeVisible({ timeout: 8_000 })
  await expect(page).toHaveScreenshot(`${testInfo.project.name}-result.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.015,
  })
})
