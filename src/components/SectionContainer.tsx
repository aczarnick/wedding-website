import { ReactNode } from 'react';

interface SectionContainerProps {
  children: ReactNode;
  id?: string;
}

export const SectionContainer: React.FC<SectionContainerProps> = ({ children, id }) => {
  return (
    <div id={id} className='snap-center min-h-screen bg-zinc-100 flex flex-col'>
      {children}
    </div>
  );
};
