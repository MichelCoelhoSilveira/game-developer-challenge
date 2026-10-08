export interface Point {
  x: number
  y: number
}

export interface Obstacle {
  points: Point[]
}

export interface ArenaBounds {
  width: number
  height: number
}

export const PLAYER_MOTION = {
  forwardSpeed: 185,
  rotationSpeed: 2.45,
  collisionRadius: 17,
} as const

export function circleIntersectsObstacle(point: Point, radius: number, obstacle: Obstacle): boolean {
  let isInside = false
  for (let index = 0, previous = obstacle.points.length - 1; index < obstacle.points.length; previous = index++) {
    const currentPoint = obstacle.points[index]
    const previousPoint = obstacle.points[previous]
    const crossesRay = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
    if (crossesRay && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
      (previousPoint.y - currentPoint.y) + currentPoint.x) {
      isInside = !isInside
    }

    const segmentX = previousPoint.x - currentPoint.x
    const segmentY = previousPoint.y - currentPoint.y
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
    const projection = segmentLengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - currentPoint.x) * segmentX + (point.y - currentPoint.y) * segmentY) / segmentLengthSquared))
    const closestX = currentPoint.x + projection * segmentX
    const closestY = currentPoint.y + projection * segmentY
    const distanceX = point.x - closestX
    const distanceY = point.y - closestY
    if (distanceX * distanceX + distanceY * distanceY < radius * radius) return true
  }

  return isInside
}

export function collidesWithLand(point: Point, radius: number, obstacles: Obstacle[]): boolean {
  return obstacles.some((obstacle) => circleIntersectsObstacle(point, radius, obstacle))
}

export function moveShip(
  position: Point,
  angle: number,
  deltaSeconds: number,
  obstacles: Obstacle[],
  bounds: ArenaBounds,
  throttle = 1,
): Point {
  const movementX = Math.sin(angle) * PLAYER_MOTION.forwardSpeed * Math.max(0, Math.min(1, throttle)) * deltaSeconds
  const movementY = -Math.cos(angle) * PLAYER_MOTION.forwardSpeed * Math.max(0, Math.min(1, throttle)) * deltaSeconds
  const radius = PLAYER_MOTION.collisionRadius
  let x = Math.max(radius, Math.min(bounds.width - radius, position.x + movementX))
  let y = Math.max(radius, Math.min(bounds.height - radius, position.y + movementY))

  // Resolve each axis independently so the ship can slide along a coastline.
  if (collidesWithLand({ x, y: position.y }, radius, obstacles)) x = position.x
  if (collidesWithLand({ x, y }, radius, obstacles)) y = position.y

  return {
    x: Math.max(radius, Math.min(bounds.width - radius, x)),
    y: Math.max(radius, Math.min(bounds.height - radius, y)),
  }
}
