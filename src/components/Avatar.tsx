import { useState, useEffect } from 'react';

type Props = {
  name: string;
  avatarUrl: string | null;
  size?: number;
  className?: string;
};

export function Avatar({ name, avatarUrl, size = 40, className = '' }: Props) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const initials = getInitials(name);
  const ringSize = size;
  const fontSize = Math.max(11, Math.round(size * 0.38));

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={ringSize}
        height={ringSize}
        onError={() => setImgError(true)}
        className={`rounded-full object-cover bg-surface-2 flex-shrink-0 ${className}`}
        style={{ width: ringSize, height: ringSize }}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-gradient-to-br from-amber-dim to-amber/30 flex items-center justify-center flex-shrink-0 select-none ${className}`}
      style={{ width: ringSize, height: ringSize, fontSize }}
    >
      <span className="font-display font-bold text-amber leading-none">
        {initials}
      </span>
    </div>
  );
}

function getInitials(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
