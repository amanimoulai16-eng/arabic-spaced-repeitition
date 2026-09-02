import { buildCurvePath, type Card } from '@/lib/srs';

export function ForgettingCurve({ card }: { card: Card }) {
  const { path, dotX, dotY, dotColor } = buildCurvePath(card);
  return (
    <svg
      viewBox="0 0 240 56"
      width="100%"
      height="56"
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <path
        d={path}
        fill="none"
        stroke="#3A4256"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={dotX.toFixed(1)} cy={dotY.toFixed(1)} r="4" fill={dotColor} />
    </svg>
  );
}
