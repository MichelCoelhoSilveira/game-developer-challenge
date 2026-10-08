import { delay, http, HttpResponse } from 'msw'
import type { MatchRecord, PageResult, RankingEntry } from '../data/contracts'
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from '../game/config'
import { CONFIRMED_MATCHES_KEY, getNetworkScenario } from './scenario'

const PAGE_SIZE = 5
const baseDate = Date.UTC(2026, 0, 1)
const fixtures: MatchRecord[] = [
  { id: 'fixture-1', playerId: 'captain-ada', playerName: 'Ada', createdAt: new Date(baseDate + 86400000 * 2).toISOString(), score: 12, durationSeconds: 120, reason: 'time', options: { gameSessionTime: 120, enemySpawnTime: 3 } },
  { id: 'fixture-2', playerId: 'captain-morgan', playerName: 'Morgan', createdAt: new Date(baseDate + 86400000).toISOString(), score: 9, durationSeconds: 120, reason: 'time', options: { gameSessionTime: 120, enemySpawnTime: 3 } },
  { id: 'fixture-3', playerId: 'captain-jack', playerName: 'Jack', createdAt: new Date(baseDate).toISOString(), score: 7, durationSeconds: 82, reason: 'sunk', options: { gameSessionTime: 120, enemySpawnTime: 3 } },
  { id: 'fixture-4', playerId: 'captain-anne', playerName: 'Anne', createdAt: new Date(baseDate - 86400000).toISOString(), score: 15, durationSeconds: 180, reason: 'time', options: { gameSessionTime: 180, enemySpawnTime: 5 } },
]

function readMatches(key: string): MatchRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value as MatchRecord[] : []
  } catch {
    return []
  }
}

function writeMatches(key: string, matches: MatchRecord[]) {
  localStorage.setItem(key, JSON.stringify(matches))
}

function pageOf<T>(items: T[], page: number): PageResult<T> {
  const start = (page - 1) * PAGE_SIZE
  return { items: items.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: items.length }
}

function sameOptions(left: PlayerOptions, right: PlayerOptions) {
  return left.gameSessionTime === right.gameSessionTime && left.enemySpawnTime === right.enemySpawnTime
}

function makeExtraFixtures(options: PlayerOptions, count: number, playerId?: string): MatchRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: playerId ? `history-demo-${playerId}-${index + 1}` : `ranking-demo-${options.gameSessionTime}-${options.enemySpawnTime}-${index + 1}`,
    playerId: playerId ?? `captain-demo-${String(index + 1).padStart(2, '0')}`,
    playerName: playerId ? 'You' : `Captain ${String.fromCharCode(65 + index)}`,
    createdAt: new Date(baseDate + 86400000 * (count - index + 5)).toISOString(),
    score: count - index + 2,
    durationSeconds: Math.max(35, options.gameSessionTime - index * 7),
    reason: index % 4 === 3 ? 'sunk' : 'time',
    options,
  }))
}

async function waitForScenario(scenario: ReturnType<typeof getNetworkScenario>, route: 'ranking' | 'history' | 'matches', page = 1) {
  if (scenario === 'slow') return delay(1200)
  if (scenario === 'variable-latency') {
    // Deterministic latency: no random source is used, so the same query always has the same delay.
    const routeSeed = route === 'ranking' ? 211 : route === 'history' ? 487 : 733
    return delay(180 + ((page * 173 + routeSeed) % 850))
  }
  if (scenario === 'out-of-order') return delay(page === 1 ? 1500 : 120)
  if (scenario === 'timeout') return delay(6500)
  return Promise.resolve()
}

function failureFor(scenario: ReturnType<typeof getNetworkScenario>, route: 'ranking' | 'history' | 'matches') {
  if (scenario === 'api-unavailable' || scenario === 'connection-error') return HttpResponse.error()
  if (scenario === 'http-4xx') return HttpResponse.json({ message: 'Simulated client error.' }, { status: 429 })
  if (scenario === 'http-5xx') return HttpResponse.json({ message: 'Simulated service unavailable.' }, { status: 503 })
  if (scenario === 'ranking-error' && route === 'ranking') return HttpResponse.json({ message: 'Ranking is temporarily unavailable.' }, { status: 503 })
  if (scenario === 'history-error' && route === 'history') return HttpResponse.json({ message: 'History is temporarily unavailable.' }, { status: 503 })
  return null
}

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const scenario = getNetworkScenario()
    const failure = failureFor(scenario, 'ranking')
    if (failure) return failure
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    await waitForScenario(scenario, 'ranking', page)
    if (scenario === 'empty') return HttpResponse.json(pageOf<RankingEntry>([], page))

    const options: PlayerOptions = {
      gameSessionTime: Number(url.searchParams.get('gameSessionTime')) || DEFAULT_PLAYER_OPTIONS.gameSessionTime,
      enemySpawnTime: Number(url.searchParams.get('enemySpawnTime')) || DEFAULT_PLAYER_OPTIONS.enemySpawnTime,
    }
    const generated = scenario === 'multi-page' || scenario === 'out-of-order' ? makeExtraFixtures(options, 12) : []
    const records = [...fixtures, ...generated, ...readMatches(CONFIRMED_MATCHES_KEY)]
      .filter((match) => sameOptions(match.options, options))
      .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt) || a.playerId.localeCompare(b.playerId) || a.id.localeCompare(b.id))
      .map((match, index): RankingEntry => ({ ...match, rank: index + 1 }))
    return HttpResponse.json(pageOf(records, page))
  }),
  http.get('/api/history', async ({ request }) => {
    const scenario = getNetworkScenario()
    const failure = failureFor(scenario, 'history')
    if (failure) return failure
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    await waitForScenario(scenario, 'history', page)
    if (scenario === 'empty') return HttpResponse.json(pageOf<MatchRecord>([], page))

    const playerId = url.searchParams.get('playerId') ?? ''
    const generated = scenario === 'multi-page' || scenario === 'out-of-order' ? makeExtraFixtures(DEFAULT_PLAYER_OPTIONS, 12, playerId) : []
    const records = [...generated, ...fixtures, ...readMatches(CONFIRMED_MATCHES_KEY)]
      .filter((match) => match.playerId === playerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    return HttpResponse.json(pageOf(records, page))
  }),
  http.post('/api/matches', async ({ request }) => {
    const scenario = getNetworkScenario()
    const failure = failureFor(scenario, 'matches')
    if (failure) return failure
    const candidate = await request.json() as MatchRecord
    if (scenario === 'timeout') { await waitForScenario(scenario, 'matches'); return HttpResponse.json({ match: candidate, duplicate: false }, { status: 201 }) }

    const stored = readMatches(CONFIRMED_MATCHES_KEY)
    const existing = stored.find((match) => match.id === candidate.id) ?? fixtures.find((match) => match.id === candidate.id)
    if (existing) return HttpResponse.json({ match: existing, duplicate: true })
    writeMatches(CONFIRMED_MATCHES_KEY, [...stored, candidate])

    if (scenario === 'registration-timeout') {
      await delay(6500)
      return HttpResponse.json({ match: candidate, duplicate: false }, { status: 201 })
    }

    await waitForScenario(scenario, 'matches')
    return HttpResponse.json({ match: candidate, duplicate: false }, { status: 201 })
  }),
]
