import React from 'react';

interface SideLinesDividerProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  lineColor?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
}

export const SideLinesDivider: React.FC<SideLinesDividerProps> = ({
  children,
  id,
  className = '',
  lineColor = '#d2e1cf',
  lineStyle = 'solid',
}) => {
  const verticalLineStyles: React.CSSProperties = {
    position: 'absolute',
    top: '15%',
    bottom: '15%',
    width: '2px',
    backgroundColor: lineStyle === 'solid' ? lineColor : 'transparent',
    borderLeft: lineStyle !== 'solid' ? `2px ${lineStyle} ${lineColor}` : 'none',
  };

  const horizontalLineStyles: React.CSSProperties = {
    height: '2px',
    backgroundColor: lineColor,
    width: '60%',
    margin: '0 auto',
  };

  return (
    <div id={id} className={`relative ${className}`}>
      {/* Mobile: Horizontal line at top */}
      <div
        className="block md:hidden"
        style={horizontalLineStyles}
        aria-hidden="true"
      />
      
      {/* Desktop: Left decorative line */}
      <div
        className="hidden md:block"
        style={{ ...verticalLineStyles, left: '4%' }}
        aria-hidden="true"
      />
      {/* Desktop: Right decorative line */}
      <div
        className="hidden md:block"
        style={{ ...verticalLineStyles, right: '4%' }}
        aria-hidden="true"
      />
      
      {children}
      
      {/* Mobile: Horizontal line at bottom */}
      <div
        className="block md:hidden"
        style={horizontalLineStyles}
        aria-hidden="true"
      />
    </div>
  );
};
