import Image from 'next/image';
import { Header } from './Header';
import handhold from '../../public/images/trees-handhold.jpg';

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
    <div id='Home' className='min-h-screen relative'>
      <Image 
        src={handhold}
        alt="Alex and Claire holding hands in trees" 
        fill
        className='bg-cover object-cover object-center -z-10'
        preload={true}
        quality={90}
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/10 to-black/40 -z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,248,244,0.35),transparent_45%)] -z-10" />

      <Header 
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={onToggleMobileMenu}
      />
      
      <div className='flex flex-col justify-center items-center mt-20 px-6 text-white text-center drop-shadow-xl/70'>
        <p className="text-sm uppercase tracking-[0.4em] text-white/80">Save the date</p>
        <h1 className='text-5xl sm:text-6xl mt-4'>Alex & Claire</h1>
        <p className='text-xl sm:text-2xl mt-6'>October 10, 2026 · Boone, IA</p> 
        <p className='text-xl sm:text-2xl mt-2'>{daysToGo}</p>
      </div>
    </div>
  );
};
