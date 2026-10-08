import type { Obstacle, Point } from './arenaRules'

export interface LandTile {
  x: number
  y: number
  size: number
  textureId: number
}

export interface IslandDecoration {
  x: number
  y: number
  size: number
  texture: 'palm' | 'shrub' | 'rock'
}

export interface IslandLayout {
  tiles: LandTile[]
  obstacles: Obstacle[]
  decorations: IslandDecoration[]
  centerX: number
  centerY: number
  tileSize: number
}

// The edge and center sprites form a rounded 3 × 3 island. Each row uses
// matching corner, shoreline, and center pieces from the supplied tileset.
const ISLAND_TILE_ROWS = [
  [1, 2, 3],
  [17, 18, 19],
  [33, 34, 35],
]

function roundedIslandCollider(centerX: number, centerY: number, tileSize: number): Obstacle {
  const width = tileSize * 3
  const height = tileSize * 3
  const left = centerX - width / 2
  const top = centerY - height / 2
  const points: Point[] = [
    { x: left + width * 0.23, y: top + height * 0.025 },
    { x: left + width * 0.77, y: top + height * 0.025 },
    { x: left + width * 0.94, y: top + height * 0.08 },
    { x: left + width * 0.99, y: top + height * 0.25 },
    { x: left + width * 0.99, y: top + height * 0.74 },
    { x: left + width * 0.91, y: top + height * 0.91 },
    { x: left + width * 0.76, y: top + height * 0.98 },
    { x: left + width * 0.24, y: top + height * 0.98 },
    { x: left + width * 0.08, y: top + height * 0.91 },
    { x: left + width * 0.01, y: top + height * 0.75 },
    { x: left + width * 0.01, y: top + height * 0.24 },
    { x: left + width * 0.08, y: top + height * 0.08 },
  ]
  return { points }
}

function appendIsland(
  tiles: LandTile[],
  obstacles: Obstacle[],
  decorations: IslandDecoration[],
  centerX: number,
  centerY: number,
  tileSize: number,
  grassTile: number,
  includePalm: boolean,
) {
  const startX = centerX - tileSize * 1.5
  const startY = centerY - tileSize * 1.5

  ISLAND_TILE_ROWS.forEach((row, rowIndex) => {
    row.forEach((textureId, columnIndex) => {
      // The center of the island becomes a grass clearing while the original
      // sand center remains around it as a beach border.
      if (rowIndex === 1 && columnIndex === 1) textureId = grassTile
      tiles.push({
        x: startX + columnIndex * tileSize,
        y: startY + rowIndex * tileSize,
        size: tileSize,
        textureId,
      })
    })
  })

  obstacles.push(roundedIslandCollider(centerX, centerY, tileSize))
  decorations.push({
    x: centerX,
    y: centerY,
    size: tileSize * (includePalm ? 0.78 : 0.55),
    texture: includePalm ? 'palm' : 'shrub',
  })
  if (includePalm) {
    decorations.push({
      x: centerX + tileSize * 0.42,
      y: centerY + tileSize * 0.34,
      size: tileSize * 0.42,
      texture: 'shrub',
    })
  }
}

export function createIslandLayout(width: number, height: number): IslandLayout {
  const tileSize = Math.max(42, Math.min(72, width * 0.065))
  const tiles: LandTile[] = []
  const obstacles: Obstacle[] = []
  const decorations: IslandDecoration[] = []
  const centerX = width * 0.67
  const centerY = height * 0.52

  appendIsland(tiles, obstacles, decorations, centerX, centerY, tileSize, 39, true)
  appendIsland(tiles, obstacles, decorations, width * 0.4, height * 0.22, tileSize * 0.66, 24, false)

  return { tiles, obstacles, decorations, centerX, centerY, tileSize }
}
