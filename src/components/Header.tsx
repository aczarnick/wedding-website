'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [isMounted, setIsMounted] = useState(false);
  const bodyStylesRef = useRef<{ overflow: string; position: string } | null>(null);
  
  const toggleMobileMenu = () => setIsMobileMenuOpen((prev) => !prev);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fix for iOS 26 Safari viewport bug
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const updateMenuMetrics = () => {
      const visualHeight = window.visualViewport?.height ?? window.innerHeight;
      const layoutHeight = html.clientHeight;
      const pageHeight = Math.max(
        html.scrollHeight,
        body.scrollHeight,
        html.offsetHeight,
        body.offsetHeight
      );

      const drawerHeight = Math.max(visualHeight, layoutHeight);

      html.style.setProperty('--mobile-menu-height', `${drawerHeight}px`);
      html.style.setProperty('--mobile-menu-page-height', `${pageHeight}px`);
    };

    if (!isMobileMenuOpen) {
      html.style.removeProperty('--mobile-menu-height');
      html.style.removeProperty('--mobile-menu-page-height');

      if (bodyStylesRef.current) {
        body.style.overflow = bodyStylesRef.current.overflow;
        body.style.position = bodyStylesRef.current.position;
        bodyStylesRef.current = null;
      }

      return;
    }

    if (!bodyStylesRef.current) {
      bodyStylesRef.current = {
        overflow: body.style.overflow,
        position: body.style.position,
      };
    }

    body.style.overflow = 'hidden';
    body.style.position = 'relative';

    updateMenuMetrics();
    window.visualViewport?.addEventListener('resize', updateMenuMetrics);
    window.addEventListener('resize', updateMenuMetrics);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateMenuMetrics);
      window.removeEventListener('resize', updateMenuMetrics);

      if (bodyStylesRef.current) {
        body.style.overflow = bodyStylesRef.current.overflow;
        body.style.position = bodyStylesRef.current.position;
        bodyStylesRef.current = null;
      }

      html.style.removeProperty('--mobile-menu-height');
      html.style.removeProperty('--mobile-menu-page-height');
    };
  }, [isMobileMenuOpen]);

  const mobileMenuOverlay = isMounted
    ? createPortal(
        <div
          className={`absolute inset-0 md:hidden bg-black/50 z-60 transition-opacity duration-300 ${
            isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          style={{ height: 'var(--mobile-menu-page-height, 100%)' }}
          onClick={toggleMobileMenu}
        >
          <div
            className="sticky top-0"
            style={{ height: 'var(--mobile-menu-height, 100vh)' }}
          >
            <div
              className={`absolute top-0 right-0 h-full w-64 bg-sage-50 shadow-lg transform z-70 transition-transform duration-300 ease-in-out ${
                isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
              }`}
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              onClick={(event) => event.stopPropagation()}
            >
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
          </div>
        </div>,
        document.body
      )
    : null;

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

      {mobileMenuOverlay}
    </>
  );
};
