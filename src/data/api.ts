import axios from 'axios'
import type { MatchRecord, MatchSubmission, PageResult, RankingEntry } from './contracts'
import { LAST_MATCH_KEY, PENDING_MATCHES_KEY } from '../mocks/scenario'

export const http = axios.create({ baseURL: '/api', timeout: 5000 })
const PLAYER_ID_KEY = 'pirate-battle:player-id:v1'

export function loadLastMatch(): MatchRecord | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_MATCH_KEY) ?? 'null')
    return value && typeof value === 'object' ? value as MatchRecord : null
  } catch {
    return null
  }
}

export function saveLastMatch(match: MatchRecord) {
  localStorage.setItem(LAST_MATCH_KEY, JSON.stringify(match))
}

export function getPlayerId(): string {
  try {
    const saved = localStorage.getItem(PLAYER_ID_KEY)
    if (saved) return saved
    const id = globalThis.crypto?.randomUUID?.() ?? `captain-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(PLAYER_ID_KEY, id)
    return id
  } catch {
    return 'captain-local'
  }
}

export function getPendingMatches(): MatchRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PENDING_MATCHES_KEY) ?? '[]')
    return Array.isArray(value) ? value as MatchRecord[] : []
  } catch {
    return []
  }
}

function savePendingMatches(matches: MatchRecord[]) {
  localStorage.setItem(PENDING_MATCHES_KEY, JSON.stringify(matches))
}

export async function submitMatch(match: MatchRecord): Promise<MatchSubmission> {
  const pending = getPendingMatches()
  if (!pending.some((entry) => entry.id === match.id)) savePendingMatches([...pending, match])
  const response = await http.post<MatchSubmission>('/matches', match)
  savePendingMatches(getPendingMatches().filter((entry) => entry.id !== match.id))
  return response.data
}

export async function fetchRanking(options: { gameSessionTime: number; enemySpawnTime: number; page: number }) {
  const response = await http.get<PageResult<RankingEntry>>('/ranking', { params: options })
  return response.data
}

export async function fetchHistory(playerId: string, page: number) {
  const response = await http.get<PageResult<MatchRecord>>('/history', { params: { playerId, page } })
  return response.data
}
