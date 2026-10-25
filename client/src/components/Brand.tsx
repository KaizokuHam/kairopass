export function Brand() {
  return (
    <span className="brand">
      <svg className="brand-symbol" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="0.5" y="0.5" width="31" height="31" rx="8" stroke="currentColor" strokeOpacity=".3" />
        <path d="M9 8h4v8l8-8h5l-9 9 9 7h-6l-7-6v6H9V8Z" fill="currentColor" />
      </svg>
      <span>Kairo<span className="brand-pass">Pass</span><span className="brand-period">.</span></span>
    </span>
  );
}
