export type NetworkScenario =
  | 'success'
  | 'empty'
  | 'multi-page'
  | 'slow'
  | 'variable-latency'
  | 'out-of-order'
  | 'timeout'
  | 'connection-error'
  | 'http-4xx'
  | 'http-5xx'
  | 'ranking-error'
  | 'history-error'
  | 'registration-timeout'
  | 'api-unavailable'

export const NETWORK_SCENARIOS: Array<{ value: NetworkScenario; label: string; description: string }> = [
  { value: 'success', label: 'Success', description: 'Normal responses with the default fixtures.' },
  { value: 'empty', label: 'Empty lists', description: 'Ranking and history return no matches.' },
  { value: 'multi-page', label: 'Multiple pages', description: 'Adds enough ranking and history fixtures to paginate.' },
  { value: 'slow', label: 'Slow network', description: 'Adds a fixed delay to API responses.' },
  { value: 'variable-latency', label: 'Variable latency', description: 'Uses repeatable delays based on endpoint and page.' },
  { value: 'out-of-order', label: 'Out-of-order responses', description: 'Page 1 responds after page 2 to exercise stale-response handling.' },
  { value: 'timeout', label: 'Request timeout', description: 'Responses arrive after the client timeout.' },
  { value: 'connection-error', label: 'Connection failure', description: 'Requests fail as if the connection was interrupted.' },
  { value: 'http-4xx', label: 'HTTP 429', description: 'Requests receive a client error response.' },
  { value: 'http-5xx', label: 'HTTP 503', description: 'Requests receive a server error response.' },
  { value: 'ranking-error', label: 'Ranking unavailable', description: 'Only ranking requests fail.' },
  { value: 'history-error', label: 'History unavailable', description: 'Only history requests fail.' },
  { value: 'registration-timeout', label: 'Registration timeout after save', description: 'The first submission is stored, but its response times out; retry returns the existing record.' },
  { value: 'api-unavailable', label: 'API unavailable', description: 'All API calls fail; queued matches remain available for recovery.' },
]

export const SCENARIO_STORAGE_KEY = 'pirate-battle:network-scenario:v1'
export const CONFIRMED_MATCHES_KEY = 'pirate-battle:confirmed-matches:v1'
export const PENDING_MATCHES_KEY = 'pirate-battle:pending-matches:v1'
export const LAST_MATCH_KEY = 'pirate-battle:last-match:v1'

const scenarioSet = new Set(NETWORK_SCENARIOS.map((scenario) => scenario.value))

export function getNetworkScenario(): NetworkScenario {
  try {
    const value = localStorage.getItem(SCENARIO_STORAGE_KEY)
    return value && scenarioSet.has(value as NetworkScenario) ? value as NetworkScenario : 'success'
  } catch {
    return 'success'
  }
}

export function setNetworkScenario(scenario: NetworkScenario) {
  localStorage.setItem(SCENARIO_STORAGE_KEY, scenario)
}

export function resetMockData() {
  localStorage.removeItem(CONFIRMED_MATCHES_KEY)
  localStorage.removeItem(PENDING_MATCHES_KEY)
  localStorage.removeItem(LAST_MATCH_KEY)
  localStorage.setItem(SCENARIO_STORAGE_KEY, 'success')
}
