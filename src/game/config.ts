export interface PlayerOptions {
  gameSessionTime: number
  enemySpawnTime: number
}

export const DEFAULT_PLAYER_OPTIONS: PlayerOptions = {
  gameSessionTime: 120,
  enemySpawnTime: 3,
}

export const OPTION_LIMITS = {
  gameSessionTime: { min: 60, max: 180, step: 1 },
  // The spawn interval is positive and capped to keep a match active.
  enemySpawnTime: { min: 1, max: 30, step: 1 },
} as const

const OPTIONS_STORAGE_KEY = 'pirate-battle:player-options:v1'

export function isValidPlayerOptions(value: unknown): value is PlayerOptions {
  if (typeof value !== 'object' || value === null) return false

  const options = value as Partial<PlayerOptions>
  return (
    Number.isInteger(options.gameSessionTime) &&
    options.gameSessionTime! >= OPTION_LIMITS.gameSessionTime.min &&
    options.gameSessionTime! <= OPTION_LIMITS.gameSessionTime.max &&
    Number.isInteger(options.enemySpawnTime) &&
    options.enemySpawnTime! >= OPTION_LIMITS.enemySpawnTime.min &&
    options.enemySpawnTime! <= OPTION_LIMITS.enemySpawnTime.max
  )
}

export function loadPlayerOptions(): PlayerOptions {
  try {
    const storedOptions = localStorage.getItem(OPTIONS_STORAGE_KEY)
    if (!storedOptions) return DEFAULT_PLAYER_OPTIONS

    const parsedOptions: unknown = JSON.parse(storedOptions)
    return isValidPlayerOptions(parsedOptions)
      ? parsedOptions
      : DEFAULT_PLAYER_OPTIONS
  } catch {
    return DEFAULT_PLAYER_OPTIONS
  }
}

export function savePlayerOptions(options: PlayerOptions): void {
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options))
}
