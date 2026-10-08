import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js'
import type { PlayerOptions } from './config'
import type { MatchEndReason } from '../data/contracts'
import { collidesWithLand, moveShip, PLAYER_MOTION, type Point } from './arenaRules'
import { createIslandLayout, type IslandLayout } from './level'
import waterUrl from '../../assets/png/default/tiles/tile_73.png'
import tile1Url from '../../assets/png/default/tiles/tile_1.png'
import tile2Url from '../../assets/png/default/tiles/tile_2.png'
import tile3Url from '../../assets/png/default/tiles/tile_3.png'
import tile17Url from '../../assets/png/default/tiles/tile_17.png'
import tile18Url from '../../assets/png/default/tiles/tile_18.png'
import tile19Url from '../../assets/png/default/tiles/tile_19.png'
import tile33Url from '../../assets/png/default/tiles/tile_33.png'
import tile34Url from '../../assets/png/default/tiles/tile_34.png'
import tile35Url from '../../assets/png/default/tiles/tile_35.png'
import grassUrl from '../../assets/png/default/tiles/tile_39.png'
import flowersUrl from '../../assets/png/default/tiles/tile_24.png'
import palmUrl from '../../assets/png/default/tiles/tile_71.png'
import shrubUrl from '../../assets/png/default/tiles/tile_72.png'
import rockUrl from '../../assets/png/default/tiles/tile_49.png'
import hullUrl from '../../assets/png/default/ship_parts/hull_large_1.png'
import pirateSailUrl from '../../assets/png/default/ship_parts/sail_large_2.png'
import cannonUrl from '../../assets/png/default/ship_parts/cannon_ball.png'
import crew1Url from '../../assets/png/default/ship_parts/crew_1.png'
import crew2Url from '../../assets/png/default/ship_parts/crew_2.png'
import crew3Url from '../../assets/png/default/ship_parts/crew_3.png'
import enemySail1Url from '../../assets/png/default/ship_parts/sail_large_1.png'
import enemySail3Url from '../../assets/png/default/ship_parts/sail_large_3.png'
import enemySail4Url from '../../assets/png/default/ship_parts/sail_large_4.png'
import hull2Url from '../../assets/png/default/ship_parts/hull_large_2.png'
import hull3Url from '../../assets/png/default/ship_parts/hull_large_3.png'
import hull4Url from '../../assets/png/default/ship_parts/hull_large_4.png'
import explosion1Url from '../../assets/png/default/effects/explosion_1.png'
import explosion2Url from '../../assets/png/default/effects/explosion_2.png'
import explosion3Url from '../../assets/png/default/effects/explosion_3.png'
import cannonFireUrl from '../../assets/sounds/cannon_fire_1.wav'
import broadsideFireUrl from '../../assets/sounds/cannon_broadside.wav'
import shipHitUrl from '../../assets/sounds/ship_wood_hit_1.wav'
import shipExplosionUrl from '../../assets/sounds/ship_explosion_1.wav'
import shipSinkingUrl from '../../assets/sounds/ship_sinking.wav'
import waterImpactUrl from '../../assets/sounds/cannonball_water_hit_1.wav'
import pauseSoundUrl from '../../assets/sounds/game_pause.wav'
import resumeSoundUrl from '../../assets/sounds/game_resume.wav'

type TouchAction = 'front' | 'broadside-left' | 'broadside-right'

interface ShipEntity { node: Container; position: Point; angle: number; hp: number; cooldown: number; enemy: boolean; dead: boolean; kind?: 'chaser' | 'shooter'; despawnTimer: number }
interface Projectile { node: Container; position: Point; velocity: Point; damage: number; owner: 'player' | 'enemy'; life: number }

interface GameTestState {
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

interface GameTestControls {
  getState: () => GameTestState
  setTimeScale: (scale: number) => void
  setSeed: (seed: number) => void
  setSpawnEnabled: (enabled: boolean) => void
  setPlayerInvulnerable: (enabled: boolean) => void
  setPlayerPose: (x: number, y: number, angle: number) => void
  spawnEnemy: (x: number, y: number, kind: 'chaser' | 'shooter') => void
}

declare global {
  interface Window { __PIRATE_GAME_TEST__?: GameTestControls }
}

interface ArenaGameProps {
  options: PlayerOptions
  onExit: () => void
  onComplete: (result: { score: number; durationSeconds: number; reason: MatchEndReason }) => void
}

const SHIP_SCALE = 0.66
const WORLD_WIDTH = 1600
const WORLD_HEIGHT = 1000
const wrapAngle = (angle: number) => ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI

function playSound(source: string, volume: number) {
  const audio = new Audio(source)
  audio.volume = volume
  void audio.play().catch(() => audio.remove())
  audio.addEventListener('ended', () => audio.remove(), { once: true })
}

export function ArenaGame({ options, onExit, onComplete }: ArenaGameProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const pressedKeysRef = useRef(new Set<string>())
  const touchActionsRef = useRef(new Set<TouchAction>())
  const fireQueueRef = useRef<number[]>([])
  const joystickInputRef = useRef({ x: 0, y: 0 })
  const joystickBaseRef = useRef<HTMLDivElement>(null)
  const joystickKnobRef = useRef<HTMLDivElement>(null)
  const joystickPointerRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onComplete)
  const scoreRef = useRef(0)
  useLayoutEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  const pausedRef = useRef(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [playerHealth, setPlayerHealth] = useState(3)
  const [timeLeft, setTimeLeft] = useState(options.gameSessionTime)
  const [isGameOver, setIsGameOver] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(() => typeof window !== 'undefined' && (window.innerWidth <= 760 || window.matchMedia('(pointer: coarse)').matches))
  const mobileLayoutRef = useRef(isMobileLayout)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)')
    const updateLayout = () => setIsMobileLayout(window.innerWidth <= 760 || media.matches)
    updateLayout()
    window.addEventListener('resize', updateLayout)
    media.addEventListener('change', updateLayout)
    return () => { window.removeEventListener('resize', updateLayout); media.removeEventListener('change', updateLayout) }
  }, [])

  useLayoutEffect(() => { mobileLayoutRef.current = isMobileLayout }, [isMobileLayout])

  function resetJoystick() {
    joystickInputRef.current = { x: 0, y: 0 }
    joystickPointerRef.current = null
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = 'translate(-50%, -50%)'
  }

  function updateJoystick(clientX: number, clientY: number) {
    const base = joystickBaseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    const radius = (Math.min(rect.width, rect.height) - 38) / 2
    const rawX = clientX - (rect.left + rect.width / 2)
    const rawY = Math.min(0, clientY - (rect.top + rect.height / 2))
    const length = Math.hypot(rawX, rawY)
    const scale = length > radius ? radius / length : 1
    const x = rawX * scale
    const y = rawY * scale
    joystickInputRef.current = { x: x / radius, y: y / radius }
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
  }

  useEffect(() => {
    const pressedKeys = pressedKeysRef.current
    const touchActions = touchActionsRef.current
    const hostElement = hostRef.current
    if (!hostElement) return
    const host: HTMLDivElement = hostElement

    let disposed = false
    let app: Application | null = null
    let resizeObserver: ResizeObserver | null = null
    let camera: Container | null = null
    let world: Container | null = null
    let player: Container | null = null
    let water: TilingSprite | null = null
    let landLayer: Container | null = null
    let currentLayout: IslandLayout | null = null
    let playerPosition: Point = { x: 0, y: 0 }
    let playerAngle = 0
    let playerHp = 3
    let playerCooldown = 0
    let enemySpawnElapsed = 0
    let enemySpawnCount = 0
    let elapsedGame = 0
    let didFinish = false
    let timeScale = 1
    let spawnEnabled = true
    let random = Math.random
    let hitCount = 0
    let enemyShotCount = 0
    let crewCount = 0
    let playerInvulnerable = false
    const firedWeapons: number[] = []
    const enemies: ShipEntity[] = []
    const projectiles: Projectile[] = []
    const effects: { node: Sprite; elapsed: number }[] = []

    pausedRef.current = false
    pressedKeysRef.current.clear()
    touchActionsRef.current.clear()
    setIsPaused(false)
    scoreRef.current = 0
    setScore(0); setPlayerHealth(3); setTimeLeft(options.gameSessionTime); setIsGameOver(false)
    setIsLoading(true)
    setLoadError('')

    const pause = () => {
      pausedRef.current = true
      pressedKeysRef.current.clear()
      touchActionsRef.current.clear()
      resetJoystick()
      playSound(pauseSoundUrl, 0.25)
      setIsPaused(true)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, button, select')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (pausedRef.current) return
        pause()
        return
      }

      const key = event.key.toLowerCase()
      if (['w', 'a', 'd', 'arrowup', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault()
        if (!pausedRef.current) pressedKeysRef.current.add(key)
      }
      const weaponKey = event.code === 'Numpad1' ? 1 : event.code === 'Numpad2' ? 2 : event.code === 'Numpad3' ? 3 :
        ({ '1': 1, '2': 2, '3': 3, k: 1, l: 2, 'ç': 3 } as Record<string, number>)[key]
      if (weaponKey && !event.repeat && !pausedRef.current) {
        event.preventDefault()
        fireQueueRef.current.push(weaponKey)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key.toLowerCase())
    }
    const onWindowBlur = () => pause()
    const onVisibilityChange = () => {
      if (document.hidden) pause()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)

    async function initializeArena() {
      try {
        const [waterTexture, tile1Texture, tile2Texture, tile3Texture, tile17Texture, tile18Texture, tile19Texture, tile33Texture, tile34Texture, tile35Texture, grassTexture, flowersTexture, palmTexture, shrubTexture, rockTexture, hullTexture, sailTexture, cannonTexture, crew1, crew2, crew3, enemySail1, enemySail3, enemySail4, hull2, hull3, hull4, explosion1, explosion2, explosion3] = await Promise.all([
          Assets.load<Texture>(waterUrl),
          Assets.load<Texture>(tile1Url),
          Assets.load<Texture>(tile2Url),
          Assets.load<Texture>(tile3Url),
          Assets.load<Texture>(tile17Url),
          Assets.load<Texture>(tile18Url),
          Assets.load<Texture>(tile19Url),
          Assets.load<Texture>(tile33Url),
          Assets.load<Texture>(tile34Url),
          Assets.load<Texture>(tile35Url),
          Assets.load<Texture>(grassUrl),
          Assets.load<Texture>(flowersUrl),
          Assets.load<Texture>(palmUrl),
          Assets.load<Texture>(shrubUrl),
          Assets.load<Texture>(rockUrl),
          Assets.load<Texture>(hullUrl),
          Assets.load<Texture>(pirateSailUrl),
          Assets.load<Texture>(cannonUrl), Assets.load<Texture>(crew1Url), Assets.load<Texture>(crew2Url), Assets.load<Texture>(crew3Url),
          Assets.load<Texture>(enemySail1Url), Assets.load<Texture>(enemySail3Url), Assets.load<Texture>(enemySail4Url),
          Assets.load<Texture>(hull2Url), Assets.load<Texture>(hull3Url), Assets.load<Texture>(hull4Url),
          Assets.load<Texture>(explosion1Url), Assets.load<Texture>(explosion2Url), Assets.load<Texture>(explosion3Url),
        ])

        if (disposed) return

        const width = Math.max(1, host.clientWidth)
        const height = Math.max(1, host.clientHeight)
        app = new Application()
        await app.init({
          width,
          height,
          backgroundColor: 0x167d9a,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        })

        if (disposed || !app) {
          app?.destroy({ removeView: true }, { children: true })
          return
        }

        app.canvas.className = 'arena-canvas'
        app.canvas.setAttribute('aria-hidden', 'true')
        host.prepend(app.canvas)

        camera = new Container()
        world = new Container()
        app.stage.addChild(camera)
        camera.addChild(world)

        water = new TilingSprite({ texture: waterTexture, width: WORLD_WIDTH, height: WORLD_HEIGHT })
        water.tileScale.set(1)
        world.addChild(water)

        landLayer = new Container()
        world.addChild(landLayer)

        player = new Container()
        const selectionRing = new Graphics()
        selectionRing.circle(0, 0, 27).stroke({ color: 0x89eee0, width: 2, alpha: 0.82 })
        player.addChild(selectionRing)

        const hull = new Sprite({ texture: hullTexture })
        hull.anchor.set(0.5)
        hull.scale.set(SHIP_SCALE)
        const pirateSail = new Sprite({ texture: sailTexture })
        pirateSail.anchor.set(0.5)
        pirateSail.scale.set(SHIP_SCALE)
        pirateSail.position.set(0, -13)
        player.addChild(hull, pirateSail)
        world.addChild(player)

        const shipHullTextures = [hullTexture, hull2, hull3, hull4]
        const playerEntity: ShipEntity = { node: player, position: playerPosition, angle: 0, hp: 3, cooldown: 0, enemy: false, dead: false, despawnTimer: 0 }
        const allShips: ShipEntity[] = [playerEntity]
        const healthLabels = new Map<Container, Text>()
        const makeHealthLabel = (ship: Container) => {
          const label = new Text({ text: '♥♥♥', style: { fontFamily: 'Arial', fontSize: 14, fill: '#fff2cc', stroke: { color: '#17333a', width: 3 }, fontWeight: 'bold' } })
          label.anchor.set(0.5, 1)
          label.position.set(0, -31)
          ship.addChild(label)
          healthLabels.set(ship, label)
        }
        makeHealthLabel(player)
        const updateHealthLabel = (ship: Container, hp: number) => { const label = healthLabels.get(ship); if (label) label.text = '♥'.repeat(Math.max(0, hp)) || '✕' }
        const showExplosion = (x: number, y: number, large = false) => {
          const node = new Sprite({ texture: explosion1 })
          node.anchor.set(0.5); node.position.set(x, y); node.scale.set(large ? 0.58 : 0.34)
          world?.addChild(node); effects.push({ node, elapsed: 0 })
        }
        const addCrew = (x: number, y: number, angle: number) => {
          const texture = [crew1, crew2, crew3][Math.floor(random() * 3)]
          const crew = new Sprite({ texture }); crew.anchor.set(0.5); crew.scale.set(0.32); crew.position.set(x, y)
          const direction = angle + Math.PI
          crewCount += 1
          world?.addChild(crew)
          let elapsed = 0
          const step = (ticker: { deltaMS: number }) => {
            elapsed += ticker.deltaMS / 1000; crew.position.x += Math.sin(direction) * 70 * ticker.deltaMS / 1000
            crew.position.y -= Math.cos(direction) * 70 * ticker.deltaMS / 1000; crew.alpha = Math.max(0, 1 - elapsed / 0.75)
            if (elapsed >= 0.75) { app?.ticker.remove(step); crew.destroy(); crewCount = Math.max(0, crewCount - 1) }
          }
          app?.ticker.add(step)
        }
        const addEnemy = (x: number, y: number, type: 'chaser' | 'shooter') => {
          const node = new Container()
          const enemyHull = new Sprite({ texture: type === 'chaser' ? hull3 : hullTexture }); enemyHull.anchor.set(0.5); enemyHull.scale.set(type === 'chaser' ? SHIP_SCALE * 0.66 : SHIP_SCALE)
          const enemySailTexture = [enemySail1, enemySail3, enemySail4][Math.floor(random() * 3)]
          const enemySail = new Sprite({ texture: enemySailTexture }); enemySail.anchor.set(0.5); enemySail.scale.set(type === 'chaser' ? SHIP_SCALE * 0.66 : SHIP_SCALE); enemySail.position.y = type === 'chaser' ? -9 : -13
          node.addChild(enemyHull, enemySail); node.position.set(x, y); world?.addChild(node); makeHealthLabel(node)
          const entity: ShipEntity = { node, position: { x, y }, angle: random() * Math.PI * 2, hp: 1, cooldown: type === 'shooter' ? 1.4 : 2.8, enemy: true, dead: false, kind: type, despawnTimer: 0 }
          updateHealthLabel(node, entity.hp)
          enemies.push(entity); allShips.push(entity)
        }
        const spawnEnemy = () => {
          if (!app || !currentLayout) return
          const w = WORLD_WIDTH, h = WORLD_HEIGHT
          for (let attempt = 0; attempt < 20; attempt++) {
            const side = Math.floor(random() * 4)
            const point = side === 0 ? { x: 40, y: random() * h } : side === 1 ? { x: w - 40, y: random() * h } : side === 2 ? { x: random() * w, y: 40 } : { x: random() * w, y: h - 40 }
            if (Math.hypot(point.x - playerPosition.x, point.y - playerPosition.y) > Math.min(w, h) * 0.42 && !collidesWithLand(point, PLAYER_MOTION.collisionRadius, currentLayout.obstacles)) {
              addEnemy(point.x, point.y, enemySpawnCount++ % 2 === 0 ? 'chaser' : 'shooter'); return
            }
          }
        }
        const fire = (owner: 'player' | 'enemy', origin: Point, angle: number, weapon: number) => {
          if (owner === 'player') firedWeapons.push(weapon)
          else enemyShotCount += 1
          const front = weapon === 2
          playSound(front ? cannonFireUrl : broadsideFireUrl, owner === 'player' ? 0.48 : 0.34)
          const broadsideDirection = weapon === 3 ? Math.PI / 2 : -Math.PI / 2
          const directions = front ? [angle] : [angle + broadsideDirection - 0.16, angle + broadsideDirection, angle + broadsideDirection + 0.16]
          directions.forEach((direction) => {
            const speed = front ? 330 : 270
            const spawnDistance = front ? 28 : 19
            const position = { x: origin.x + Math.sin(direction) * spawnDistance, y: origin.y - Math.cos(direction) * spawnDistance }
            const node = new Container()
            const ball = new Sprite({ texture: cannonTexture }); ball.anchor.set(0.5); ball.scale.set(front ? 1.45 : 1.15); ball.tint = 0x17191b
            const outline = new Graphics(); outline.circle(0, 0, front ? 8 : 6.5).stroke({ color: 0xffe4a8, width: 2, alpha: 0.95 })
            node.addChild(outline, ball); node.position.set(position.x, position.y); world?.addChild(node)
            projectiles.push({ node, position, velocity: { x: Math.sin(direction) * speed, y: -Math.cos(direction) * speed }, damage: 1, owner, life: 1.8 })
          })
        }
        const finishGame = (reason: MatchEndReason) => {
          if (didFinish) return
          didFinish = true
          pausedRef.current = true
          setIsGameOver(true)
          playSound(shipSinkingUrl, 0.55)
          onCompleteRef.current({
            score: scoreRef.current,
            durationSeconds: Math.min(options.gameSessionTime, Math.floor(elapsedGame)),
            reason,
          })
        }

        const tileTextures: Record<number, Texture> = {
          1: tile1Texture,
          2: tile2Texture,
          3: tile3Texture,
          17: tile17Texture,
          18: tile18Texture,
          19: tile19Texture,
          24: flowersTexture,
          33: tile33Texture,
          34: tile34Texture,
          35: tile35Texture,
          39: grassTexture,
        }

        const addDecoration = (texture: Texture, x: number, y: number, size: number) => {
          if (!landLayer) return
          const sprite = new Sprite({ texture })
          sprite.anchor.set(0.5)
          sprite.position.set(x, y)
          sprite.width = size
          sprite.height = size
          landLayer.addChild(sprite)
        }

        const updateCamera = () => {
          if (!app || !camera) return
          const viewWidth = app.screen.width
          const viewHeight = app.screen.height
          const mobile = mobileLayoutRef.current
          const scale = mobile ? 1 : Math.min(viewWidth / WORLD_WIDTH, viewHeight / WORLD_HEIGHT)
          camera.scale.set(scale)
          if (mobile) {
            const halfViewWidth = viewWidth / (2 * scale)
            const halfViewHeight = viewHeight / (2 * scale)
            const centerX = WORLD_WIDTH <= halfViewWidth * 2
              ? WORLD_WIDTH / 2
              : Math.max(halfViewWidth, Math.min(WORLD_WIDTH - halfViewWidth, playerPosition.x))
            const centerY = WORLD_HEIGHT <= halfViewHeight * 2
              ? WORLD_HEIGHT / 2
              : Math.max(halfViewHeight, Math.min(WORLD_HEIGHT - halfViewHeight, playerPosition.y))
            camera.position.set(viewWidth / 2 - centerX * scale, viewHeight / 2 - centerY * scale)
          } else {
            camera.position.set((viewWidth - WORLD_WIDTH * scale) / 2, (viewHeight - WORLD_HEIGHT * scale) / 2)
          }
        }

        const drawLevel = () => {
          if (!app || !water || !landLayer || !player) return
          landLayer.removeChildren()

          currentLayout = createIslandLayout(WORLD_WIDTH, WORLD_HEIGHT)
          currentLayout.tiles.forEach((tile) => {
            const sprite = new Sprite({ texture: tileTextures[tile.textureId] })
            sprite.position.set(tile.x, tile.y)
            sprite.width = tile.size
            sprite.height = tile.size
            landLayer?.addChild(sprite)
          })
          currentLayout.decorations.forEach((decoration) => {
            const texture = decoration.texture === 'palm'
              ? palmTexture
              : decoration.texture === 'shrub'
                ? shrubTexture
                : rockTexture
            addDecoration(texture, decoration.x, decoration.y, decoration.size)
          })

          if (playerPosition.x === 0 || playerPosition.y === 0) {
            playerPosition = { x: Math.max(PLAYER_MOTION.collisionRadius + 6, WORLD_WIDTH * 0.14), y: WORLD_HEIGHT * 0.57 }
          }
          if (collidesWithLand(playerPosition, PLAYER_MOTION.collisionRadius, currentLayout.obstacles)) {
            playerPosition = { x: Math.max(PLAYER_MOTION.collisionRadius + 6, WORLD_WIDTH * 0.14), y: WORLD_HEIGHT * 0.57 }
          }
          playerPosition.x = Math.max(PLAYER_MOTION.collisionRadius, Math.min(WORLD_WIDTH - PLAYER_MOTION.collisionRadius, playerPosition.x))
          playerPosition.y = Math.max(PLAYER_MOTION.collisionRadius, Math.min(WORLD_HEIGHT - PLAYER_MOTION.collisionRadius, playerPosition.y))
          player.position.set(playerPosition.x, playerPosition.y)
          // The supplied hull art points down by default; rotate the sprite
          // while keeping the simulation angle pointed toward the bow.
          player.rotation = playerAngle + Math.PI
          updateCamera()
        }

        drawLevel()
        if (import.meta.env.MODE === 'e2e') {
          window.__PIRATE_GAME_TEST__ = {
            getState: () => ({
              player: { ...playerPosition, angle: playerAngle, hp: playerHp },
              enemies: enemies.map(({ position, hp, kind, dead }) => ({ ...position, hp, kind, dead })),
              projectileCount: projectiles.length,
              shotsFired: [...firedWeapons],
              enemyShotsFired: enemyShotCount,
              entities: {
                enemies: enemies.filter(({ dead }) => !dead).length,
                wrecks: enemies.filter(({ dead }) => dead).length,
                projectiles: projectiles.length,
                explosions: effects.length,
                crew: crewCount,
                total: 1 + enemies.length + projectiles.length + effects.length + crewCount,
              },
              hits: hitCount,
              score: scoreRef.current,
              elapsed: elapsedGame,
              paused: pausedRef.current,
            }),
            setTimeScale: (scale) => { timeScale = Math.max(0, scale) },
            setSeed: (seed) => {
              let value = seed >>> 0
              random = () => {
                value = (value + 0x6D2B79F5) | 0
                let mixed = Math.imul(value ^ (value >>> 15), 1 | value)
                mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
                return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
              }
            },
            setSpawnEnabled: (enabled) => { spawnEnabled = enabled },
            setPlayerInvulnerable: (enabled) => { playerInvulnerable = enabled },
            setPlayerPose: (x, y, angle) => {
              playerPosition = { x, y }
              playerAngle = angle
              player?.position.set(x, y)
              if (player) player.rotation = angle + Math.PI
              updateCamera()
            },
            spawnEnemy: (x, y, kind) => addEnemy(x, y, kind),
          }
        }
        resizeObserver = new ResizeObserver(() => {
          if (!app || disposed) return
          app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight))
          updateCamera()
        })
        resizeObserver.observe(host)

        app.ticker.add((ticker) => {
          if (!player || !currentLayout || pausedRef.current) return
          const deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.05) * timeScale
          elapsedGame += deltaSeconds
          setTimeLeft(Math.max(0, Math.ceil(options.gameSessionTime - elapsedGame)))
          if (elapsedGame >= options.gameSessionTime) { finishGame('time'); return }
          const keys = pressedKeysRef.current
          const touch = touchActionsRef.current
          const joystick = joystickInputRef.current
          const joystickTurn = Math.abs(joystick.x) > 0.18 ? joystick.x : 0
          const turnLeft = keys.has('a') || keys.has('arrowleft') || joystickTurn < 0
          const turnRight = keys.has('d') || keys.has('arrowright') || joystickTurn > 0
          const moveForward = keys.has('w') || keys.has('arrowup') || joystick.y < -0.18

          if (turnLeft !== turnRight) {
            const turnStrength = joystickTurn !== 0 && !keys.has('a') && !keys.has('d') && !keys.has('arrowleft') && !keys.has('arrowright')
              ? Math.max(0.25, Math.abs(joystickTurn))
              : 1
            playerAngle += (turnLeft ? -1 : 1) * PLAYER_MOTION.rotationSpeed * turnStrength * deltaSeconds
          }
          if (moveForward) {
            const throttle = keys.has('w') || keys.has('arrowup') ? 1 : Math.min(1, Math.max(0.25, -joystick.y))
            playerPosition = moveShip(
              playerPosition,
              playerAngle,
              deltaSeconds,
              currentLayout.obstacles,
              { width: WORLD_WIDTH, height: WORLD_HEIGHT },
              throttle,
            )
          }
          player.position.set(playerPosition.x, playerPosition.y)
          player.rotation = playerAngle + Math.PI
          updateCamera()

          playerEntity.position = playerPosition
          playerEntity.angle = playerAngle
          playerCooldown = Math.max(0, playerCooldown - deltaSeconds)
          const queuedWeapon = fireQueueRef.current.shift()
          const touchWeapon = touch.has('broadside-left') ? 1 : touch.has('front') ? 2 : touch.has('broadside-right') ? 3 : undefined
          if ((queuedWeapon || touchWeapon) && playerCooldown <= 0) {
            fire('player', playerPosition, playerAngle, queuedWeapon || touchWeapon!)
            playerCooldown = 0.38
          }
          fireQueueRef.current.length = 0

          enemySpawnElapsed += deltaSeconds
          if (spawnEnabled && enemySpawnElapsed >= Math.max(2, options.enemySpawnTime)) { enemySpawnElapsed = 0; spawnEnemy() }
          for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
            const enemy = enemies[enemyIndex]
            if (enemy.dead) {
              enemy.despawnTimer -= deltaSeconds
              if (enemy.despawnTimer <= 0) { enemy.node.destroy(); enemies.splice(enemyIndex, 1) }
              continue
            }
            if (enemy.hp <= 0) continue
            const dx = playerPosition.x - enemy.position.x, dy = playerPosition.y - enemy.position.y
            const distance = Math.hypot(dx, dy)
            const kind = enemy.kind
            const targetAngle = Math.atan2(dx, -dy)
            const shipRadius = kind === 'chaser' ? 11 : PLAYER_MOTION.collisionRadius
            const candidateOffsets = [-1.35, -0.95, -0.55, 0, 0.55, 0.95, 1.35]
            let pursuitAngle = targetAngle
            let bestRouteScore = Number.POSITIVE_INFINITY
            for (const offset of candidateOffsets) {
              const candidateAngle = targetAngle + offset
              let clearRoute = true
              for (let lookAhead = 24; lookAhead <= 144; lookAhead += 24) {
                const probe = {
                  x: enemy.position.x + Math.sin(candidateAngle) * lookAhead,
                  y: enemy.position.y - Math.cos(candidateAngle) * lookAhead,
                }
                if (probe.x < shipRadius || probe.y < shipRadius || probe.x > WORLD_WIDTH - shipRadius || probe.y > WORLD_HEIGHT - shipRadius ||
                  collidesWithLand(probe, shipRadius, currentLayout!.obstacles)) {
                  clearRoute = false
                  break
                }
              }
              if (!clearRoute) continue
              const projected = {
                x: enemy.position.x + Math.sin(candidateAngle) * 110,
                y: enemy.position.y - Math.cos(candidateAngle) * 110,
              }
              const routeScore = Math.hypot(projected.x - playerPosition.x, projected.y - playerPosition.y) + Math.abs(wrapAngle(candidateAngle - enemy.angle)) * 14
              if (routeScore < bestRouteScore) { bestRouteScore = routeScore; pursuitAngle = candidateAngle }
            }
            const angleDelta = wrapAngle(pursuitAngle - enemy.angle)
            enemy.angle += Math.max(-1, Math.min(1, angleDelta)) * 1.65 * deltaSeconds
            const approachUntil = kind === 'chaser' ? 22 : 180
            if (distance > approachUntil) {
              const next = moveShip(enemy.position, enemy.angle, deltaSeconds, currentLayout!.obstacles, { width: WORLD_WIDTH, height: WORLD_HEIGHT })
              enemy.position = next
            }
            enemy.node.position.set(enemy.position.x, enemy.position.y)
            enemy.node.rotation = enemy.angle + Math.PI
            enemy.cooldown -= deltaSeconds
            if (kind === 'shooter' && distance < 320 && enemy.cooldown <= 0) {
              const relativeBearing = wrapAngle(targetAngle - enemy.angle)
              const rightError = Math.abs(wrapAngle(relativeBearing - Math.PI / 2))
              const leftError = Math.abs(wrapAngle(relativeBearing + Math.PI / 2))
              const sideError = Math.min(rightError, leftError)
              const weapon = Math.abs(relativeBearing) <= sideError ? 2 : rightError < leftError ? 3 : 1
              fire('enemy', enemy.position, enemy.angle, weapon)
              enemy.cooldown = 2.25
            }
            if (kind === 'chaser' && distance < 29) {
              enemy.dead = true; enemy.hp = 0; enemy.despawnTimer = 1
              const chaserHull = enemy.node.children[0]
              if (chaserHull instanceof Sprite) chaserHull.texture = shipHullTextures[3]
              updateHealthLabel(enemy.node, 0)
              showExplosion(enemy.position.x, enemy.position.y, true)
              playSound(shipExplosionUrl, 0.58)
              if (!playerInvulnerable) {
                playerHp = Math.max(0, playerHp - 1); setPlayerHealth(playerHp); updateHealthLabel(playerEntity.node, playerHp)
                hull.texture = shipHullTextures[playerHp === 0 ? 3 : 3 - playerHp]
                if (playerHp === 0) finishGame('sunk')
              }
            }
          }
          if (didFinish) return
          for (let index = projectiles.length - 1; index >= 0; index--) {
            const shot = projectiles[index]
            shot.life -= deltaSeconds
            shot.position.x += shot.velocity.x * deltaSeconds; shot.position.y += shot.velocity.y * deltaSeconds
            shot.node.position.set(shot.position.x, shot.position.y)
            let hit = shot.life <= 0 || shot.position.x < 0 || shot.position.y < 0 || shot.position.x > WORLD_WIDTH || shot.position.y > WORLD_HEIGHT
            if (!hit && collidesWithLand(shot.position, 4, currentLayout!.obstacles)) { showExplosion(shot.position.x, shot.position.y); playSound(waterImpactUrl, 0.22); hit = true }
            if (!hit) {
              const targets = shot.owner === 'player' ? enemies : [playerEntity]
              const target = targets.find((ship) => !ship.dead && ship.hp > 0 && Math.hypot(shot.position.x - ship.position.x, shot.position.y - ship.position.y) < 23)
              if (target) {
                hitCount += 1
                showExplosion(shot.position.x, shot.position.y)
                playSound(shipHitUrl, 0.34)
                const impactDirection = Math.atan2(shot.velocity.x, -shot.velocity.y)
                addCrew(target.position.x + Math.sin(impactDirection) * 10, target.position.y - Math.cos(impactDirection) * 10, impactDirection + Math.PI)
                if (!(target === playerEntity && playerInvulnerable)) target.hp = Math.max(0, target.hp - shot.damage)
                updateHealthLabel(target.node, target.hp)
                const targetHull = target.node.children[0]
                if (targetHull instanceof Sprite) targetHull.texture = shipHullTextures[target.hp === 0 ? 3 : 3 - target.hp]
                if (target.hp === 0 && target.enemy) {
                  target.dead = true; target.despawnTimer = 1
                  scoreRef.current += 1; setScore(scoreRef.current); showExplosion(target.position.x, target.position.y, true); playSound(shipExplosionUrl, 0.52)
                }
                if (target.hp === 0 && !target.enemy) { setPlayerHealth(0); finishGame('sunk') }
                hit = true
              }
            }
            if (hit) { shot.node.destroy(); projectiles.splice(index, 1) }
            if (didFinish) break
          }
          effects.forEach((effect, index) => {
            effect.elapsed += deltaSeconds
            effect.node.texture = effect.elapsed < 0.1 ? explosion1 : effect.elapsed < 0.2 ? explosion2 : explosion3
            effect.node.alpha = Math.max(0, 1 - effect.elapsed / 0.3)
            if (effect.elapsed >= 0.3) { effect.node.destroy(); effects.splice(index, 1) }
          })
        })

        setIsLoading(false)
        host.focus({ preventScroll: true })
      } catch (error) {
        if (disposed) return
        setLoadError(error instanceof Error ? error.message : 'Unable to load the battle assets.')
        setIsLoading(false)
      }
    }

    void initializeArena()

    return () => {
      disposed = true
      if (window.__PIRATE_GAME_TEST__) delete window.__PIRATE_GAME_TEST__
      resizeObserver?.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      pressedKeys.clear()
      touchActions.clear()
      app?.ticker.stop()
      app?.destroy({ removeView: true }, { children: true })
    }
  }, [loadAttempt, options.gameSessionTime, options.enemySpawnTime])

  function resumeGame() {
    pausedRef.current = false
    resetJoystick()
    playSound(resumeSoundUrl, 0.25)
    setIsPaused(false)
    hostRef.current?.focus({ preventScroll: true })
  }

  function togglePause() {
    if (pausedRef.current) resumeGame()
    else {
      pausedRef.current = true
      pressedKeysRef.current.clear()
      touchActionsRef.current.clear()
      resetJoystick()
      playSound(pauseSoundUrl, 0.25)
      setIsPaused(true)
    }
  }

  function setTouchAction(action: TouchAction, pressed: boolean) {
    if (pausedRef.current) return
    if (pressed) touchActionsRef.current.add(action)
    else touchActionsRef.current.delete(action)
  }

  function startJoystick(event: ReactPointerEvent<HTMLDivElement>) {
    if (pausedRef.current) return
    event.preventDefault()
    joystickPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    updateJoystick(event.clientX, event.clientY)
  }

  function moveJoystick(event: ReactPointerEvent<HTMLDivElement>) {
    if (joystickPointerRef.current !== event.pointerId || pausedRef.current) return
    event.preventDefault()
    updateJoystick(event.clientX, event.clientY)
  }

  function endJoystick(event: ReactPointerEvent<HTMLDivElement>) {
    if (joystickPointerRef.current !== event.pointerId) return
    resetJoystick()
  }

  function touchButton(action: TouchAction, label: string, symbol: string) {
    const caption = action === 'broadside-left' ? 'LEFT' : action === 'broadside-right' ? 'RIGHT' : 'FRONT'
    return (
      <button
        className={`touch-control touch-${action}`}
        key={action}
        type="button"
        aria-label={label}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          setTouchAction(action, true)
        }}
        onPointerUp={() => setTouchAction(action, false)}
        onPointerCancel={() => setTouchAction(action, false)}
        onLostPointerCapture={() => setTouchAction(action, false)}
      >
        <><span>{symbol}</span><small aria-hidden="true">{caption}</small></>
      </button>
    )
  }

  return (
    <section className="game-screen" aria-label="Pirate Battle gameplay">
      <header className="arena-topbar">
        <span className="wordmark"><span className="wordmark-icon" aria-hidden="true">⚓</span> PIRATE <b>BATTLE</b></span>
        <div className="arena-status" aria-label="Player ship status">
          <span className="status-sail" aria-hidden="true">☠</span>
          <span><b>Your ship</b><small>{'♥'.repeat(playerHealth)} · {playerHealth}/3 HP</small></span>
        </div>
        <div className="arena-settings"><span>SCORE <b>{score}</b></span><i /><span>TIME <b>{timeLeft}s</b></span></div>
        <button className="arena-action" type="button" onClick={togglePause} disabled={isLoading || Boolean(loadError)} aria-label={isPaused ? 'Resume game' : 'Pause game'}>
          {isPaused ? 'Resume' : 'Pause'} <span aria-hidden="true">{isPaused ? '▶' : 'Ⅱ'}</span>
        </button>
      </header>

      <div className="arena-viewport" ref={hostRef} tabIndex={-1} aria-label="Water arena with island obstacles and your pirate ship">
        {isLoading && <div className="arena-message"><span className="loading-wheel" /><p>Loading battle assets…</p></div>}
        {loadError && <div className="arena-message" role="alert"><p className="arena-error-title">The arena could not be loaded.</p><p>{loadError}</p><button className="wood-button primary-button" type="button" onClick={() => { setIsLoading(true); setLoadError(''); setLoadAttempt((attempt) => attempt + 1) }}>Try again</button></div>}
        {isMobileLayout && !isLoading && !isPaused && !isGameOver && !loadError && <div className="touch-controls" aria-label="Mobile sailing controls">
          <div
            className="virtual-joystick"
            ref={joystickBaseRef}
            role="group"
            aria-label="Virtual joystick: push up to move forward and left or right to steer; reverse is disabled"
            onPointerDown={startJoystick}
            onPointerMove={moveJoystick}
            onPointerUp={endJoystick}
            onPointerCancel={endJoystick}
            onLostPointerCapture={resetJoystick}
          >
            <span className="joystick-forward-mark" aria-hidden="true">▲</span>
            <span className="joystick-side-mark joystick-side-left" aria-hidden="true">◀</span>
            <span className="joystick-side-mark joystick-side-right" aria-hidden="true">▶</span>
            <div className="joystick-knob" ref={joystickKnobRef} />
            <span className="joystick-caption">STEER · FORWARD</span>
          </div>
          <div className="touch-weapons" role="group" aria-label="Mobile cannon controls">
            {touchButton('broadside-left', 'Fire left broadside, key 1', '1')}
            {touchButton('front', 'Fire forward, key 2', '2')}
            {touchButton('broadside-right', 'Fire right broadside, key 3', '3')}
          </div>
        </div>}
        {isGameOver && <div className="pause-overlay"><section className="pause-card" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><span className="game-compass" aria-hidden="true">☠</span><p className="eyebrow">Battle complete · Score {score}</p><h2 id="game-over-title">{playerHealth === 0 ? 'Your ship was sunk' : 'Time is up'}</h2><p>Final score: {score}</p><button className="wood-button primary-button" type="button" onClick={onExit}>Return to menu</button></section></div>}
        {isPaused && !isGameOver && !loadError && <div className="pause-overlay"><section className="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><span className="game-compass" aria-hidden="true">✥</span><p className="eyebrow">Take a breath, captain</p><h2 id="pause-title">Battle paused</h2><p>Your ship will wait here until you are ready.</p><button className="wood-button primary-button" type="button" onClick={resumeGame}>Resume sailing</button><button className="text-button" type="button" onClick={onExit}>Leave battle</button></section></div>}
      </div>

      <footer className="arena-footer">
        <p><span className="footer-compass" aria-hidden="true">✥</span> <b>Navigate & fire</b><span className="footer-separator">·</span> W / ↑ forward <span className="footer-separator">·</span> A / ← and D / → steer <span className="footer-separator">·</span> 1 / K left · 2 / L front · 3 / Ç right</p>
        <p className="collision-hint"><span /> Islands block your ship</p>
      </footer>
    </section>
  )
}
