'use client';
import { getInitials, getAvatarColor } from '@/lib/utils';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  xs: { px: 28, text: '10px' },
  sm: { px: 36, text: '13px' },
  md: { px: 44, text: '16px' },
  lg: { px: 56, text: '20px' },
  xl: { px: 72, text: '26px' },
};

export function Avatar({ name, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const { px, text } = sizes[size];
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);

  const style = {
    width: px,
    height: px,
    minWidth: px,
    fontSize: text,
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (imageUrl) {
    return (
      <div style={style} className={className}>
        <img src={imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div
      style={{ ...style, backgroundColor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontFamily: 'var(--font-sans)', letterSpacing: '0.5px' }}
      className={className}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
