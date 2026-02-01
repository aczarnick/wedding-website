import React from 'react';

interface GradientGlowDividerProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  glowColor?: string;
  glowPosition?: 'top' | 'center' | 'bottom';
  intensity?: number;
}

const GLOW_POSITIONS = {
  top: 'circle at 50% 20%',
  center: 'circle at 50% 50%',
  bottom: 'circle at 50% 80%',
};

export const GradientGlowDivider: React.FC<GradientGlowDividerProps> = ({
  children,
  id,
  className = '',
  glowColor = 'rgba(180, 205, 175, 0.7)',
  glowPosition = 'center',
  intensity = 70,
}) => {
  const gradientStyle = {
    background: `radial-gradient(${GLOW_POSITIONS[glowPosition]}, ${glowColor}, transparent ${intensity}%)`,
  };

  return (
    <div id={id} className={`relative ${className}`} style={gradientStyle}>
      {children}
    </div>
  );
};
