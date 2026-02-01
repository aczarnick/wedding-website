import React from 'react';

interface SectionDividerProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
}

export const SectionDivider: React.FC<SectionDividerProps> = ({ children, id, className }) => {
  return (
    <div className="relative">
      <div className="absolute left-1/2 top-6 h-px w-24 -translate-x-1/2 -translate-y-1/2 bg-sage-200 z-10" />
      <div 
        id={id} 
        className={`bg-[radial-gradient(circle_at_top,rgba(210,225,207,0.6),transparent_55%)] pt-12 ${className ?? ''}`}
        style={{
          maskImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 120' preserveAspectRatio='none'%3E%3Cpath d='M0,64L80,80C160,96,320,128,480,128C640,128,800,96,960,80C1120,64,1280,64,1360,64L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z' fill='black'/%3E%3C/svg%3E\"), linear-gradient(black, black)",
          maskPosition: "top, 0 47px",
          maskSize: "100% 48px, 100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 120' preserveAspectRatio='none'%3E%3Cpath d='M0,64L80,80C160,96,320,128,480,128C640,128,800,96,960,80C1120,64,1280,64,1360,64L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z' fill='black'/%3E%3C/svg%3E\"), linear-gradient(black, black)",
          WebkitMaskPosition: "top, 0 47px",
          WebkitMaskSize: "100% 48px, 100% 100%",
          WebkitMaskRepeat: "no-repeat",
        }}
      >
        {children}
      </div>
    </div>
  );
};
