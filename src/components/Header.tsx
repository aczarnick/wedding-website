'use client';

import { NAV_LINKS } from '@/constants/events';
import { MobileNavLink } from './MobileNavLink';

interface HeaderProps {
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isMobileMenuOpen, onToggleMobileMenu }) => {
  return (
    <div className='flex justify-between md:px-20 lg:px-50 xl:px-70 bg-white/70 py-2.5 z-20 text-black text-2xl'>
      <a className='ml-5' href='#Home'>
        Home
      </a>

      {/* Mobile Menu Button */}
      <div className='md:hidden mr-5 pt-1'>
        <button 
          aria-label="Open mobile menu"
          onClick={onToggleMobileMenu}
        > 
          <svg className='h-6.5 w-6.5' fill='currentColor' viewBox="0 0 18 18">
            <title>Menu</title>
            <path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z" />
          </svg>
        </button>
      </div>

      {/* Desktop Nav Links */}
      <div className='hidden md:contents'>
        {NAV_LINKS.map((link) => (
          <a key={link} href={`#${link}`}>
            {link}
          </a>
        ))}
      </div>

      {/* Mobile Menu Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onToggleMobileMenu}
      />

      {/* Mobile Nav Drawer */}
      <div className={`fixed top-0 right-0 min-h-screen w-64 bg-slate-100 shadow-lg transform md:hidden z-50
        transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"}`
        }>
        <MobileNavLink href='#Home' label='Home' onClick={onToggleMobileMenu} />
        {NAV_LINKS.map((link, index) => (
          <MobileNavLink 
            key={link}
            href={`#${link}`} 
            label={link}
            onClick={onToggleMobileMenu}
            isLast={index === NAV_LINKS.length - 1}
          />
        ))}
      </div>
    </div>
  );
};
