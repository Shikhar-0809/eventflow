// Coarse "Browser on OS" label from a User-Agent string, e.g. "Chrome on Android". Only this label is ever stored:
// never the UA itself. Order matters: Edge, Opera and Samsung Internet all also say "Chrome", Chrome says "Safari".
const BROWSERS = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
// iPhone/iPad before Mac (iPad UAs say "like Mac OS X"); Android before Linux.
const SYSTEMS = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux/, 'Linux'],
]

export const deviceLabel = (userAgent) => {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 500) : ''
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Unknown device'
}
