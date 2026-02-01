import Image from 'next/image';
import { Header } from './Header';

interface HeroSectionProps {
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  daysToGo: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  isMobileMenuOpen,
  onToggleMobileMenu,
  daysToGo,
}) => {
  return (
    <div id='Home' className='snap-center min-h-screen'>
      <Image 
        src="/images/trees-handhold.jpg"
        alt="Alex and Claire holding hands in trees" 
        fill
        className='bg-cover object-cover object-center -z-10'
        preload={true}
      />

      <Header 
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={onToggleMobileMenu}
      />
      
      <div className='flex flex-col justify-center items-center mt-15 drop-shadow-xl/70 text-white font-serif'>
        <h1 className='text-5xl'>Alex & Claire</h1>
        <p className='text-2xl mt-5'>October 10, 2026 - Boone, IA</p> 
        <p className='text-2xl'>{daysToGo}</p>
        {/* <button className='text-black text-2xl bg-white/80 px-8 py-3 mt-5'>
          RSVP
        </button> */}
      </div>
    </div>
  );
};
