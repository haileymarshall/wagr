import { formatEther } from 'viem'

/** Native USDC on Arc has 18 decimals at the value layer. */
export function usdc(value: bigint, digits = 2): string {
  const n = Number(formatEther(value))
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, n < 1 ? 4 : 2) })
}

export const shortAddress = (address?: string) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '')

export function countdown(targetSeconds: number, nowMs = Date.now()): string {
  let s = Math.max(0, Math.floor(targetSeconds - nowMs / 1000))
  const d = Math.floor(s / 86_400)
  s -= d * 86_400
  const h = Math.floor(s / 3_600)
  s -= h * 3_600
  const m = Math.floor(s / 60)
  s -= m * 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const sameAddress = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())
