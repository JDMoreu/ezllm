export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" role="img" aria-label="EzLLM">
      <rect x="1" y="1" width="178" height="178" rx="44" fill="#141829" stroke="#323C63" strokeWidth="2" />
      <rect x="28" y="34" width="84" height="28" rx="14" fill="#2F3760" />
      <rect x="48" y="76" width="84" height="28" rx="14" fill="#6B7CF3" />
      <circle cx="118" cy="90" r="7" fill="#E8EBFF" />
      <rect x="68" y="118" width="84" height="28" rx="14" fill="#2F3760" />
    </svg>
  );
}
