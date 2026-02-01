import React from 'react';

interface BottomGradientDividerProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  gradientColor?: string;
  intensity?: number;
}

export const BottomGradientDivider: React.FC<BottomGradientDividerProps> = ({
  children,
  id,
  className = '',
  gradientColor = '#d2e1cf',
  intensity = 70,
}) => {
  const gradientStyle = {
    background: `linear-gradient(to top, ${gradientColor}, transparent ${intensity}%)`,
  };

  return (
    <div id={id} className={`relative ${className}`} style={gradientStyle}>
      {children}
    </div>
  );
};
