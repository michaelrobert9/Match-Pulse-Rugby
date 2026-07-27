import { useState } from 'react'
import { Link } from 'react-router-dom'

// The MatchPulse Rugby logo.
//
// Primary: the supplied wordmark artwork at public/logo.png. It is referenced
// from `public/` (not imported) so a missing file degrades gracefully at
// runtime instead of failing the build.
//
// Fallback: if the image is absent or fails to load, we render the wordmark in
// the brand display font (Space Grotesk) — "Match" in ink navy, "Pulse" in
// brand green, plus the pale-green RUGBY pill — so the header always shows a
// correct logo. Remove the fallback once the PNG is committed if you prefer.
const LOGO_SRC = '/logo.png'

function Wordmark({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-[0.5em] font-display font-bold leading-none whitespace-nowrap text-[1.375rem] ${className}`}>
      <span className="tracking-[-0.01em] text-slate-800">
        Match<span className="text-green-600">Pulse</span>
      </span>
      <span className="text-[0.5em] uppercase tracking-[0.14em] text-green-700 bg-green-100 rounded-full px-[0.7em] py-[0.42em]">
        Rugby
      </span>
    </span>
  )
}

export default function Logo({ className = '', imgClassName = 'h-8', linkTo = '/' }) {
  const [failed, setFailed] = useState(false)

  const inner = failed
    ? <Wordmark className={className} />
    : (
      <img
        src={LOGO_SRC}
        alt="MatchPulse Rugby"
        className={`${imgClassName} w-auto`}
        onError={() => setFailed(true)}
      />
    )

  if (!linkTo) return inner
  return (
    <Link to={linkTo} aria-label="MatchPulse Rugby — home" className="shrink-0 inline-flex items-center">
      {inner}
    </Link>
  )
}
