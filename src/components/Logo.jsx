import { Link } from 'react-router-dom'

// The MatchPulse Rugby wordmark. Rendered with the brand display font
// (Space Grotesk) so it stays crisp at any size and matches the rest of the
// site's typography: "Match" in ink navy, "Pulse" in brand green, and a
// pale-green rounded "RUGBY" pill. `className` lets callers scale it (the
// pill and gaps are sized in em, so everything tracks the font size).
export default function Logo({ className = '', linkTo = '/' }) {
  const inner = (
    <span className={`inline-flex items-center gap-[0.5em] font-display font-bold leading-none whitespace-nowrap text-[1.375rem] ${className}`}>
      <span className="tracking-[-0.01em] text-slate-800">
        Match<span className="text-green-600">Pulse</span>
      </span>
      <span className="text-[0.5em] uppercase tracking-[0.14em] text-green-700 bg-green-100 rounded-full px-[0.7em] py-[0.42em]">
        Rugby
      </span>
    </span>
  )
  if (!linkTo) return inner
  return (
    <Link to={linkTo} aria-label="MatchPulse Rugby — home" className="shrink-0">
      {inner}
    </Link>
  )
}
