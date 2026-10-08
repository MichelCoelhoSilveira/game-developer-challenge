import { gameState, expect, openMenu, startGame, test } from './fixtures'

test('options validate, save, and persist across navigation and reload', async ({ page }) => {
  await openMenu(page)
  await page.getByRole('button', { name: 'Options' }).click()
  await page.locator('#session-time').fill('59')
  expect(await page.locator('#session-time').evaluate((input) => (input as HTMLInputElement).validity.rangeUnderflow)).toBe(true)
  await page.getByRole('button', { name: 'Save options' }).click()
  await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible()

  await page.locator('#session-time').fill('75')
  await page.locator('#spawn-time').fill('5')
  await page.getByRole('button', { name: 'Save options' }).click()
  await expect(page.getByText('Options saved on this device.')).toBeVisible()
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Options' }).click()
  await expect(page.locator('#session-time')).toHaveValue('75')
  await expect(page.locator('#spawn-time')).toHaveValue('5')
})

test.describe('asset loading retry', () => {
test.use({ serviceWorkers: 'block' })

test('shows asset loading errors and retries successfully', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    if (route.request().method() === 'POST') {
      const match = route.request().postDataJSON()
      await route.fulfill({ contentType: 'application/json', status: 201, body: JSON.stringify({ match, duplicate: false }) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], page: 1, pageSize: 5, total: 0 }) })
  })
  await openMenu(page)
  let failures = 0
  await page.route('**/*.png', async (route) => {
    if (failures++ === 0) await route.abort('failed')
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('alert')).toContainText('arena could not be loaded', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.arena-canvas')).toBeVisible({ timeout: 15_000 })
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  expect(failures).toBeGreaterThan(0)
})
})

test('keyboard movement and rotation work; arena bounds and island collision stop the ship', async ({ page }) => {
  await openMenu(page)
  await startGame(page)
  const initial = await gameState(page)
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(1))
  await page.keyboard.down('w')
  await page.waitForTimeout(500)
  await page.keyboard.up('w')
  const moved = await gameState(page)
  expect(moved.player.y).toBeLessThan(initial.player.y - 20)

  await page.keyboard.down('d')
  await page.waitForTimeout(250)
  await page.keyboard.up('d')
  const turned = await gameState(page)
  expect(turned.player.angle).not.toBe(moved.player.angle)

  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setPlayerPose(1580, 100, Math.PI / 2))
  await page.keyboard.down('w')
  await page.waitForTimeout(350)
  await page.keyboard.up('w')
  expect((await gameState(page)).player.x).toBeLessThanOrEqual(1583)

  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setPlayerPose(940, 520, Math.PI / 2))
  await page.keyboard.down('w')
  await page.waitForTimeout(700)
  await page.keyboard.up('w')
  const atIsland = await gameState(page)
  expect(atIsland.player.x).toBeGreaterThanOrEqual(940)
  expect(atIsland.player.x).toBeLessThan(970)
})

test('all cannon directions fire, cooldown prevents duplicate shots, hits score once, and projectiles clear', async ({ page }) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setSpawnEnabled(false)
    game.setPlayerPose(500, 700, 0)
    game.setTimeScale(1)
  })
  await page.keyboard.press('1')
  await page.keyboard.press('1')
  await page.waitForTimeout(450)
  await page.keyboard.press('2')
  await page.waitForTimeout(450)
  await page.keyboard.press('3')
  await expect.poll(async () => (await gameState(page)).shotsFired).toEqual([1, 2, 3])

  await page.waitForTimeout(450)
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.spawnEnemy(500, 560, 'shooter'))
  await page.keyboard.press('2')
  await expect.poll(async () => (await gameState(page)).shotsFired.length, { timeout: 2_000 }).toBe(4)
  await expect.poll(async () => (await gameState(page)).score, { timeout: 5_000 }).toBe(1)
  await page.waitForTimeout(1_100)
  const afterDespawn = await gameState(page)
  expect(afterDespawn.score).toBe(1)
  expect(afterDespawn.hits).toBeGreaterThan(0)
  await expect.poll(async () => (await gameState(page)).projectileCount, { timeout: 4_000 }).toBe(0)
})

test('Chaser contact damages the player, Shooters pursue and fire, and waves spawn on schedule', async ({ page }) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setSpawnEnabled(false)
    game.setPlayerPose(500, 700, 0)
    game.spawnEnemy(600, 700, 'chaser')
    game.setTimeScale(1)
  })
  await expect.poll(async () => {
    const state = await gameState(page)
    return Math.hypot(state.enemies[0].x - state.player.x, state.enemies[0].y - state.player.y)
  }).toBeLessThan(100)
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setTimeScale(0)
    const { x, y } = game.getState().player
    game.spawnEnemy(x, y, 'chaser')
    game.setTimeScale(1)
  })
  await expect.poll(async () => (await gameState(page)).player.hp).toBe(2)

  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setPlayerPose(500, 700, 0)
    game.spawnEnemy(500, 520, 'shooter')
    game.setTimeScale(5)
  })
  await expect.poll(async () => (await gameState(page)).enemyShotsFired, { timeout: 5_000 }).toBeGreaterThan(0)

  await page.goto('/')
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(10))
  await expect.poll(async () => (await gameState(page)).enemies.length, { timeout: 5_000 }).toBeGreaterThan(0)
})

test('timeout and sinking end the match; a new voyage starts with clean state', async ({ page }) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(200))
  await expect(page.getByRole('heading', { name: 'Time is up' })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('heading', { name: 'Time is up' })).toBeVisible()
  await page.getByRole('button', { name: 'Play again' }).click()
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  await page.evaluate(() => {
    const game = window.__PIRATE_GAME_TEST__!
    game.setSpawnEnabled(false)
    const { x, y } = game.getState().player
    game.spawnEnemy(x, y, 'chaser')
    game.spawnEnemy(x, y, 'chaser')
    game.spawnEnemy(x, y, 'chaser')
  })
  await expect(page.getByRole('heading', { name: 'Your ship was sunk' })).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.result-score')).toContainText('0 points')
})

test('pause, window blur, and resume hold the simulation clock', async ({ page }) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(1))
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: 'Pause game' }).click()
  await expect(page.getByRole('heading', { name: 'Battle paused' })).toBeVisible()
  const pausedAt = await gameState(page)
  await page.waitForTimeout(350)
  expect((await gameState(page)).elapsed).toBe(pausedAt.elapsed)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.getByRole('button', { name: 'Resume sailing' }).click()
  await page.waitForTimeout(250)
  expect((await gameState(page)).elapsed).toBeGreaterThan(pausedAt.elapsed)
})

test('result is displayed and restored after a page refresh', async ({ page }) => {
  await openMenu(page)
  await startGame(page)
  await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(200))
  await expect(page.getByRole('heading', { name: 'Time is up' })).toBeVisible({ timeout: 8_000 })
  await expect(page.getByRole('heading', { name: 'Time is up' }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Time is up' })).toBeVisible()
  await expect(page.locator('.result-stats dd').nth(1)).toHaveText('60s')
})

test('abandonment, repeated navigation, and mobile touch controls behave correctly', async ({ page }, testInfo) => {
  await openMenu(page)
  await page.getByRole('button', { name: 'Options' }).click()
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  await page.getByRole('button', { name: 'Pause game' }).click()
  await page.getByRole('button', { name: 'Leave battle' }).click()
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible()
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.waitForFunction(() => Boolean(window.__PIRATE_GAME_TEST__))
  await expect(page.locator('.arena-canvas')).toBeVisible({ timeout: 15_000 })

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.locator('.touch-controls')).toBeVisible()
    await page.evaluate(() => window.__PIRATE_GAME_TEST__!.setTimeScale(1))
    const joystick = page.locator('.virtual-joystick')
    const joystickBox = await joystick.boundingBox()
    expect(joystickBox).not.toBeNull()
    const yBefore = (await gameState(page)).player.y
    const centerX = joystickBox!.x + joystickBox!.width / 2
    const centerY = joystickBox!.y + joystickBox!.height / 2
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX, centerY - 28, { steps: 3 })
    await page.waitForTimeout(250)
    await page.mouse.up()
    await expect.poll(async () => (await gameState(page)).player.y).toBeLessThan(yBefore)
    const fireButton = page.getByRole('button', { name: 'Fire forward, key 2' })
    const box = await fireButton.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect.poll(async () => (await gameState(page)).shotsFired.length).toBeGreaterThan(0)
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.locator('.arena-canvas')).toBeVisible()
  }
})
