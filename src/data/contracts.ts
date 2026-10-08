import type { PlayerOptions } from '../game/config'

export type MatchEndReason = 'time' | 'sunk'

export interface MatchRecord {
  id: string
  playerId: string
  playerName: string
  createdAt: string
  score: number
  durationSeconds: number
  reason: MatchEndReason
  options: PlayerOptions
}

export interface RankingEntry extends MatchRecord {
  rank: number
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface MatchSubmission {
  match: MatchRecord
  duplicate: boolean
}
