// The EventFlow mark: a tent drawn as one stroke, with a small teal light at the ridge (DIRECTIONS.md 2.4).
// The stroke follows the text color; keep public/favicon.svg in step if the shape changes.
export const BrandMark = ({ className = '' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <path d="M3 26 16 8l13 18h-9l-4-8-4 8H3Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="7" r="2.6" fill="#5EEAD4" />
  </svg>
)
