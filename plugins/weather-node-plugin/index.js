'use strict'

// Example OpenBrain plugin: Weather node.
// Runtime hooks contract: `execute({ inputs, node, context }) => outputs`.
// The runtime inspects plugin manifests for nodeTypes and dispatches custom
// node types to the matching plugin.

async function execute({ inputs, node, configuration: _configuration }) {
  const city = String(inputs.city ?? node?.configuration?.city ?? '')
  if (city.trim() === '') throw new Error('Weather node needs a city input.')
  const response = await fetch(
    `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=en`,
    { headers: { 'User-Agent': 'openbrain-runtime/1.0' } },
  )
  if (!response.ok) throw new Error(`Weather upstream HTTP ${response.status}`)
  const data = await response.json()
  const current = data?.current_condition?.[0] ?? {}
  const content = [
    `Weather in ${city}`,
    `Temperature: ${current.temp_C ?? '?'}°C (feels like ${current.FeelsLikeC ?? '?'}°C)`,
    `Condition:  ${current.weatherDesc?.[0]?.value ?? 'unknown'}`,
    `Humidity:   ${current.humidity ?? '?'}%`,
    `Wind:       ${current.windspeedKmph ?? '?'} km/h`,
  ].join('\n')
  return { content, result: content }
}

module.exports = { execute }
