/** Mongiz's initial paired with a completion check, shared by the brand and loader. */
export function MongizMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`mongiz-mark ${className}`}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="13" fill="#2e63d3" />
      <path
        d="M11 33V15l9 11 9-11v18"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="mongiz-check"
        d="m28 32 4 4 8-10"
        pathLength="1"
        stroke="#baf5d6"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
