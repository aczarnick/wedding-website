'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NAV_LINKS } from '@/constants/events';
import { MobileNavLink } from './MobileNavLink';

// Determine if a link is a route (page) or hash (section)
const getHref = (link: string): string => {
  if (link === 'Registry' || link === 'Gallery') {
    return `/${link.toLowerCase()}`;
  }
  return `/#${link}`;
};

const isRouteLink = (link: string): boolean => {
  return link === 'Registry' || link === 'Gallery';
};

export const Header: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <>
      <div className='relative z-50 flex justify-between md:px-20 lg:px-50 xl:px-70 bg-white/70 backdrop-blur-md py-3 text-black text-xl shadow-sm'>
        <Link className='ml-5 text-sage-800 hover:text-sage-700' href='/'>
          Home
        </Link>

        {/* Mobile Menu Button */}
        <div className='md:hidden mr-5 pt-1'>
          <button 
            aria-label="Open mobile menu"
            onClick={toggleMobileMenu}
          > 
            <svg className='h-6.5 w-6.5' fill='currentColor' viewBox="0 0 18 18">
              <title>Menu</title>
              <path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z" />
            </svg>
          </button>
        </div>

        {/* Desktop Nav Links */}
        <div className='hidden md:contents'>
          {NAV_LINKS.map((link) => {
            const href = getHref(link);
            const isRoute = isRouteLink(link);
            
            return isRoute ? (
              <Link key={link} className="text-sage-800 hover:text-sage-700" href={href}>
                {link}
              </Link>
            ) : (
              <a key={link} className="text-sage-800 hover:text-sage-700" href={href}>
                {link}
              </a>
            );
          })}
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-60 transition-opacity duration-300 ${
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={toggleMobileMenu}
      />

      {/* Mobile Nav Drawer */}
      <div className={`fixed top-0 right-0 min-h-lvh w-64 bg-sage-50 shadow-lg transform md:hidden z-70
        transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"}`
        }>
        <MobileNavLink href='/' label='Home' onClick={toggleMobileMenu} isRoute={true} />
        {NAV_LINKS.map((link, index) => (
          <MobileNavLink 
            key={link}
            href={getHref(link)} 
            label={link}
            onClick={toggleMobileMenu}
            isLast={index === NAV_LINKS.length - 1}
            isRoute={isRouteLink(link)}
          />
        ))}
      </div>
    </>
  );
};
