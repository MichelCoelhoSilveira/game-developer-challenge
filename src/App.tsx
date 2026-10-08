import { useEffect, useRef, useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_PLAYER_OPTIONS,
  loadPlayerOptions,
  OPTION_LIMITS,
  savePlayerOptions,
  type PlayerOptions,
} from './game/config'
import { ArenaGame } from './game/ArenaGame'
import { fetchHistory, fetchRanking, getPendingMatches, getPlayerId, loadLastMatch, saveLastMatch, submitMatch } from './data/api'
import type { MatchRecord } from './data/contracts'
import { getNetworkScenario, NETWORK_SCENARIOS, resetMockData, setNetworkScenario, type NetworkScenario } from './mocks/scenario'
import './App.css'

type Screen = 'menu' | 'options' | 'game' | 'result'
type MenuTab = 'ranking' | 'history'

function App() {
  const [completedMatch, setCompletedMatch] = useState<MatchRecord | null>(loadLastMatch)
  const [screen, setScreen] = useState<Screen>(() => completedMatch ? 'result' : 'menu')
  const [activeTab, setActiveTab] = useState<MenuTab>('ranking')
  const [playerOptions, setPlayerOptions] = useState(loadPlayerOptions)
  const [sessionDraft, setSessionDraft] = useState(String(playerOptions.gameSessionTime))
  const [spawnDraft, setSpawnDraft] = useState(String(playerOptions.enemySpawnTime))
  const [formError, setFormError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [matchOptions, setMatchOptions] = useState<PlayerOptions | null>(null)
  const [playerId] = useState(getPlayerId)
  const [pendingCount, setPendingCount] = useState(() => getPendingMatches().length)
  const [networkScenario, setNetworkScenarioState] = useState<NetworkScenario>(getNetworkScenario)
  const queryClient = useQueryClient()
  const recoveryStarted = useRef(false)
  const submission = useMutation({
    mutationFn: submitMatch,
    onSuccess: () => {
      setPendingCount(getPendingMatches().length)
      void queryClient.invalidateQueries({ queryKey: ['ranking'] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
    },
    onError: () => setPendingCount(getPendingMatches().length),
  })
  const { mutateAsync: submitPendingMatch } = submission

  useEffect(() => {
    if (recoveryStarted.current) return
    recoveryStarted.current = true
    void (async () => {
      for (const pendingMatch of getPendingMatches()) {
        try { await submitPendingMatch(pendingMatch) } catch { /* Keep the match queued for a later retry. */ }
      }
      setPendingCount(getPendingMatches().length)
    })()
  }, [submitPendingMatch])

  function openOptions() {
    setSessionDraft(String(playerOptions.gameSessionTime))
    setSpawnDraft(String(playerOptions.enemySpawnTime))
    setFormError('')
    setSaveMessage('')
    setScreen('options')
  }

  function handleSaveOptions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextOptions = {
      gameSessionTime: Number(sessionDraft),
      enemySpawnTime: Number(spawnDraft),
    }

    if (!Number.isInteger(nextOptions.gameSessionTime) ||
      nextOptions.gameSessionTime < OPTION_LIMITS.gameSessionTime.min ||
      nextOptions.gameSessionTime > OPTION_LIMITS.gameSessionTime.max) {
      setFormError('Choose a whole number from 60 to 180 seconds.')
      setSaveMessage('')
      return
    }

    if (!Number.isInteger(nextOptions.enemySpawnTime) ||
      nextOptions.enemySpawnTime < OPTION_LIMITS.enemySpawnTime.min ||
      nextOptions.enemySpawnTime > OPTION_LIMITS.enemySpawnTime.max) {
      setFormError('Choose a whole number from 1 to 30 seconds.')
      setSaveMessage('')
      return
    }

    try {
      savePlayerOptions(nextOptions)
      setPlayerOptions(nextOptions)
      setFormError('')
      setSaveMessage('Options saved on this device.')
    } catch {
      setFormError('Options could not be saved in this browser. Please try again.')
      setSaveMessage('')
    }
  }

  function startGame() {
    // A match uses the saved options snapshot taken when the player starts it.
    setMatchOptions({ ...playerOptions })
    setScreen('game')
  }

  function completeGame(result: { score: number; durationSeconds: number; reason: 'time' | 'sunk' }) {
    const match: MatchRecord = {
      id: globalThis.crypto?.randomUUID?.() ?? `match-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      playerId,
      playerName: 'You',
      createdAt: new Date().toISOString(),
      score: result.score,
      durationSeconds: result.durationSeconds,
      reason: result.reason,
      options: { ...(matchOptions ?? playerOptions) },
    }
    setCompletedMatch(match)
    saveLastMatch(match)
    setScreen('result')
    submission.mutate(match)
    setPendingCount(getPendingMatches().length)
  }

  async function retryPendingMatches() {
    for (const pendingMatch of getPendingMatches()) {
      try { await submitPendingMatch(pendingMatch) } catch { /* Pending records remain available for a later retry. */ }
    }
    setPendingCount(getPendingMatches().length)
  }

  function selectNetworkScenario(scenario: NetworkScenario) {
    setNetworkScenario(scenario)
    setNetworkScenarioState(scenario)
    void queryClient.invalidateQueries({ queryKey: ['ranking'] })
    void queryClient.invalidateQueries({ queryKey: ['history'] })
  }

  function handleResetMockData() {
    resetMockData()
    setNetworkScenarioState('success')
    setPendingCount(0)
    setCompletedMatch(null)
    queryClient.removeQueries({ queryKey: ['ranking'] })
    queryClient.removeQueries({ queryKey: ['history'] })
    setSaveMessage('Mock data reset. Game options were kept.')
  }

  return (
    <main className="app-shell">
      {screen === 'menu' && (
        <MenuScreen
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onPlay={startGame}
          onOptions={openOptions}
          options={playerOptions}
          networkScenario={networkScenario}
          playerId={playerId}
          pendingCount={pendingCount}
          onRetryPending={() => { void retryPendingMatches() }}
        />
      )}
      {screen === 'options' && (
        <section className="wood-frame options-frame" aria-labelledby="options-title">
          <div className="frame-inner options-inner">
            <p className="eyebrow">Captain's quarters</p>
            <h1 id="options-title">Options</h1>
            <p className="panel-intro">Set the pace for your next voyage.</p>

            <form className="options-form" onSubmit={handleSaveOptions}>
              <label className="option-field" htmlFor="session-time">
                <span className="field-title">Game session time</span>
                <span className="field-description">How long each battle lasts.</span>
                <span className="input-with-unit">
                  <input
                    id="session-time"
                    type="number"
                    min={OPTION_LIMITS.gameSessionTime.min}
                    max={OPTION_LIMITS.gameSessionTime.max}
                    step={OPTION_LIMITS.gameSessionTime.step}
                    value={sessionDraft}
                    onChange={(event) => setSessionDraft(event.target.value)}
                    aria-describedby="session-help"
                  />
                  <span>seconds</span>
                </span>
                <span className="field-help" id="session-help">60–180 seconds</span>
              </label>

              <label className="option-field" htmlFor="spawn-time">
                <span className="field-title">Enemy spawn time</span>
                <span className="field-description">Time between enemy waves.</span>
                <span className="input-with-unit">
                  <input
                    id="spawn-time"
                    type="number"
                    min={OPTION_LIMITS.enemySpawnTime.min}
                    max={OPTION_LIMITS.enemySpawnTime.max}
                    step={OPTION_LIMITS.enemySpawnTime.step}
                    value={spawnDraft}
                    onChange={(event) => setSpawnDraft(event.target.value)}
                    aria-describedby="spawn-help"
                  />
                  <span>seconds</span>
                </span>
                <span className="field-help" id="spawn-help">1–30 seconds; must be positive</span>
              </label>

              <div className="form-feedback" aria-live="polite">
                {formError && <p className="error-message" role="alert">{formError}</p>}
                {saveMessage && <p className="success-message">{saveMessage}</p>}
              </div>
              <div className="options-actions">
                <button className="wood-button secondary-button" type="button" onClick={() => {
                  setSessionDraft(String(DEFAULT_PLAYER_OPTIONS.gameSessionTime))
                  setSpawnDraft(String(DEFAULT_PLAYER_OPTIONS.enemySpawnTime))
                  setFormError('')
                  setSaveMessage('')
                }}>
                  Restore defaults
                </button>
                <button className="wood-button primary-button" type="submit">Save options</button>
              </div>
            </form>
            <section className="network-scenarios" aria-labelledby="network-scenarios-title">
              <p className="eyebrow">Development tools</p>
              <h2 id="network-scenarios-title">Network simulation</h2>
              <label htmlFor="network-scenario">Scenario</label>
              <select id="network-scenario" value={networkScenario} onChange={(event) => selectNetworkScenario(event.target.value as NetworkScenario)}>
                {NETWORK_SCENARIOS.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
              </select>
              <p className="scenario-description">{NETWORK_SCENARIOS.find((scenario) => scenario.value === networkScenario)?.description}</p>
              <p className="scenario-note">Scenarios and delays are deterministic and persist after refresh. Reset clears confirmed matches, pending submissions, and the saved last result; game options and player identity stay intact.</p>
              <button className="wood-button secondary-button reset-mock-button" type="button" onClick={handleResetMockData}>Reset mock data</button>
            </section>
            <button className="text-button back-button" type="button" onClick={() => setScreen('menu')}>
              <span aria-hidden="true">←</span> Main menu
            </button>
          </div>
        </section>
      )}
      {screen === 'game' && (
        <ArenaGame options={matchOptions ?? playerOptions} onExit={() => setScreen('menu')} onComplete={completeGame} />
      )}
      {screen === 'result' && completedMatch && (
        <ResultScreen
          match={completedMatch}
          saveStatus={getPendingMatches().some((match) => match.id === completedMatch.id) ? submission.isPending ? 'saving' : submission.isError ? 'failed' : 'pending' : 'saved'}
          onRetry={() => submission.mutate(completedMatch)}
          onPlayAgain={startGame}
          onMainMenu={() => setScreen('menu')}
        />
      )}
      {screen !== 'game' && <footer className="brand-mark" aria-label="Pirate Battle">PIRATE BATTLE <span>✦</span></footer>}
    </main>
  )
}

interface MenuScreenProps {
  activeTab: MenuTab
  onTabChange: (tab: MenuTab) => void
  onPlay: () => void
  onOptions: () => void
  options: PlayerOptions
  networkScenario: NetworkScenario
  playerId: string
  pendingCount: number
  onRetryPending: () => void
}

function MenuScreen({ activeTab, onTabChange, onPlay, onOptions, options, networkScenario, playerId, pendingCount, onRetryPending }: MenuScreenProps) {
  return (
    <div className="menu-layout">
      <header className="topbar">
        <a className="wordmark" href="#home" aria-label="Pirate Battle home">
          <span className="wordmark-icon" aria-hidden="true">⚓</span>
          <span>PIRATE <b>BATTLE</b></span>
        </a>
        <span className="topbar-caption">A high seas adventure</span>
        <span className="online-status"><i /> Ready to sail</span>
      </header>

      <section className="hero-layout" id="home" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> The open sea is calling</p>
          <h1 id="hero-title">Set sail.<br /><em>Take command.</em></h1>
          <p className="hero-description">Navigate treacherous waters, outmaneuver enemy ships, and claim your place among the legends.</p>
          <div className="hero-actions">
            <button className="wood-button primary-button play-button" type="button" onClick={onPlay}>
              <span className="button-icon" aria-hidden="true">▶</span> Start game
            </button>
            <button className="wood-button secondary-button" type="button" onClick={onOptions}>
              <span className="button-icon" aria-hidden="true">⚙</span> Options
            </button>
          </div>
          <div className="captain-tip"><span className="tip-icon" aria-hidden="true">☠</span><span><b>Captain's tip</b><br />Keep moving. A still ship is an easy target.</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-glow" />
          <div className="hero-island"><span className="palm palm-one">♣</span><span className="palm palm-two">♣</span></div>
          <div className="hero-ship"><span className="ship-sail">☠</span><span className="ship-flag">✦</span></div>
          <span className="art-label label-island">Skull Cove <i /></span>
          <span className="art-label label-ship"><i /> Your ship</span>
          <span className="orbit orbit-one" /><span className="orbit orbit-two" />
        </div>
      </section>

      <section className="lower-grid" aria-label="Game information">
        <div className="info-card controls-card">
          <div className="card-heading"><span className="heading-icon" aria-hidden="true">⌨</span><div><p className="eyebrow">Learn the ropes</p><h2>Controls</h2></div></div>
          <div className="controls-columns">
            <section className="control-group" aria-label="Movement controls">
              <h3>Movement</h3>
              <div className="control-rows">
                <div className="control-row"><span className="key-group"><kbd>W</kbd><kbd>↑</kbd></span><span className="control-action">Move forward</span></div>
                <div className="control-row"><span className="key-group"><kbd>A</kbd><kbd>←</kbd></span><span className="control-action">Turn left</span></div>
                <div className="control-row"><span className="key-group"><kbd>D</kbd><kbd>→</kbd></span><span className="control-action">Turn right</span></div>
                <div className="control-row"><span className="key-group"><kbd>ESC</kbd></span><span className="control-action">Pause</span></div>
              </div>
            </section>
            <section className="control-group" aria-label="Weapon controls">
              <h3>Weapons</h3>
              <div className="control-rows">
                <div className="control-row"><span className="key-group"><kbd>1</kbd><kbd>K</kbd></span><span className="control-action">Fire left</span></div>
                <div className="control-row"><span className="key-group"><kbd>2</kbd><kbd>L</kbd></span><span className="control-action">Fire forward</span></div>
                <div className="control-row"><span className="key-group"><kbd>3</kbd><kbd>Ç</kbd></span><span className="control-action">Fire right</span></div>
                <p className="numpad-note">Number keys and numpad both work.</p>
              </div>
            </section>
          </div>
          <p className="touch-note"><span aria-hidden="true">☝</span> Touch controls appear in-game on mobile.</p>
        </div>

        <div className="info-card leaderboard-card">
          <div className="card-heading"><span className="heading-icon" aria-hidden="true">♜</span><div><p className="eyebrow">Tales of the sea</p><h2>Captain's log</h2></div></div>
          <div className="tab-list" role="tablist" aria-label="Captain's log">
            <button id="ranking-tab" className={activeTab === 'ranking' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'ranking'} aria-controls="log-panel" onClick={() => onTabChange('ranking')}>Ranking</button>
            <button id="history-tab" className={activeTab === 'history' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'history'} aria-controls="log-panel" onClick={() => onTabChange('history')}>Match history</button>
          </div>
          {pendingCount > 0 && <div className="pending-notice" role="status"><span>{pendingCount} match{pendingCount === 1 ? '' : 'es'} waiting to sync</span><button type="button" onClick={onRetryPending}>Retry</button></div>}
          <div className="log-panel" id="log-panel" role="tabpanel" aria-labelledby={activeTab === 'ranking' ? 'ranking-tab' : 'history-tab'}>
            <CaptainLog key={`${options.gameSessionTime}-${options.enemySpawnTime}-${networkScenario}`} activeTab={activeTab} options={options} networkScenario={networkScenario} playerId={playerId} />
          </div>
        </div>
      </section>
      <p className="version-note">PIRATE BATTLE <span>•</span> SINGLE PLAYER VOYAGE</p>
    </div>
  )
}

interface CaptainLogProps { activeTab: MenuTab; options: PlayerOptions; networkScenario: NetworkScenario; playerId: string }

function CaptainLog({ activeTab, options, networkScenario, playerId }: CaptainLogProps) {
  const queryClient = useQueryClient()
  const [rankingPage, setRankingPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const ranking = useQuery({
    queryKey: ['ranking', networkScenario, options, rankingPage],
    queryFn: () => fetchRanking({ ...options, page: rankingPage }),
    enabled: activeTab === 'ranking',
    placeholderData: keepPreviousData,
  })
  const history = useQuery({
    queryKey: ['history', networkScenario, playerId, historyPage],
    queryFn: () => fetchHistory(playerId, historyPage),
    enabled: activeTab === 'history',
    placeholderData: keepPreviousData,
  })
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: activeTab === 'ranking' ? ['ranking'] : ['history'] })
  }, [activeTab, queryClient])
  const result = activeTab === 'ranking' ? ranking.data : history.data
  const isPending = activeTab === 'ranking' ? ranking.isPending : history.isPending
  const isError = activeTab === 'ranking' ? ranking.isError : history.isError
  const isFetching = activeTab === 'ranking' ? ranking.isFetching : history.isFetching
  const refetch = activeTab === 'ranking' ? ranking.refetch : history.refetch
  const page = activeTab === 'ranking' ? rankingPage : historyPage
  const setPage = activeTab === 'ranking' ? setRankingPage : setHistoryPage

  if (isPending) return <p className="log-feedback" role="status">Loading {activeTab === 'ranking' ? 'ranking' : 'match history'}…</p>
  if (isError) return <div className="log-feedback" role="alert"><p>Could not load {activeTab === 'ranking' ? 'ranking' : 'match history'}.</p><button type="button" onClick={() => { void refetch() }}>Try again</button></div>
  if (!result || result.total === 0) return <div className="log-feedback empty-log"><span aria-hidden="true">{activeTab === 'ranking' ? '♛' : '◷'}</span><b>{activeTab === 'ranking' ? 'No scores yet' : 'No matches yet'}</b><p>{activeTab === 'ranking' ? 'Complete a battle to join this configuration’s ranking.' : 'Your completed matches will appear here.'}</p></div>

  return <>
    <p className="log-context">{activeTab === 'ranking' ? `Ranking · ${options.gameSessionTime}s session · ${options.enemySpawnTime}s spawn` : 'Your completed matches'}{isFetching && <span className="query-refresh"> Updating…</span>}</p>
    <ol className={`match-list ${activeTab === 'ranking' ? 'ranking-list' : 'history-list'}`}>
      {activeTab === 'ranking'
        ? ranking.data?.items.map((entry) => <li key={entry.id}><span className="match-rank">{entry.rank}.</span><b>{entry.playerName}</b><span className="match-score">{entry.score} pts</span></li>)
        : history.data?.items.map((entry) => <li key={entry.id}><span className="match-date">{new Date(entry.createdAt).toLocaleDateString()}</span><b>{entry.score} pts</b><span className="match-detail">{entry.durationSeconds}s · {entry.reason === 'time' ? 'Time up' : 'Ship sunk'}</span></li>)}
    </ol>
    <div className="log-pagination"><span>{result.total} {activeTab === 'ranking' ? 'scores' : 'matches'}</span><div><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>←</button><span>Page {page} of {Math.max(1, Math.ceil(result.total / result.pageSize))}</span><button type="button" aria-label="Next page" disabled={page >= Math.ceil(result.total / result.pageSize)} onClick={() => setPage((value) => value + 1)}>→</button></div></div>
  </>
}

interface ResultScreenProps {
  match: MatchRecord
  saveStatus: 'saving' | 'failed' | 'pending' | 'saved'
  onRetry: () => void
  onPlayAgain: () => void
  onMainMenu: () => void
}

function ResultScreen({ match, saveStatus, onRetry, onPlayAgain, onMainMenu }: ResultScreenProps) {
  const statusCopy = saveStatus === 'saving' ? 'Submitting your match…' : saveStatus === 'failed' || saveStatus === 'pending' ? 'Match saved locally; it will sync when the mock API is available.' : 'Match recorded in ranking and history.'
  return <section className="result-screen" aria-labelledby="result-title">
    <div className="result-card">
      <span className="result-emblem" aria-hidden="true">{match.reason === 'sunk' ? '☠' : '⚓'}</span>
      <p className="eyebrow">Voyage complete</p>
      <h1 id="result-title">{match.reason === 'sunk' ? 'Your ship was sunk' : 'Time is up'}</h1>
      <p className="result-score">{match.score}<span> points</span></p>
      <dl className="result-stats"><div><dt>Time played</dt><dd>{match.durationSeconds}s</dd></div><div><dt>Session</dt><dd>{match.options.gameSessionTime}s</dd></div><div><dt>Enemy spawn</dt><dd>{match.options.enemySpawnTime}s</dd></div></dl>
      <p className={`submission-status ${saveStatus}`} role="status"><i />{statusCopy}</p>
      {(saveStatus === 'failed' || saveStatus === 'pending') && <button className="text-button retry-submit" type="button" onClick={onRetry}>Retry match submission</button>}
      <div className="result-actions"><button className="wood-button primary-button" type="button" onClick={onPlayAgain}>Play again</button><button className="wood-button secondary-button" type="button" onClick={onMainMenu}>Main menu</button></div>
    </div>
  </section>
}

export default App
