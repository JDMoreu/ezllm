export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" role="img" aria-label="EzLLM">
      <rect x="1" y="1" width="178" height="178" rx="44" fill="#0C0D10" stroke="#3A404B" strokeWidth="2" />
      <rect x="28" y="34" width="84" height="28" rx="14" fill="#2C313A" />
      <rect x="48" y="76" width="84" height="28" rx="14" fill="#5A8CF0" />
      <circle cx="118" cy="90" r="7" fill="#F3F5F8" />
      <rect x="68" y="118" width="84" height="28" rx="14" fill="#2C313A" />
    </svg>
  );
}
