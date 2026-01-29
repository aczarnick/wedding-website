'use client';

import Image from 'next/image';
import { useState } from 'react';

const Home = () => {

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const daysToGo = DaysUntilWedding();

  return (
    <div className='flex flex-col h-screen overflow-hidden'>
      <div>
        <Image 
          src="/images/trees-handhold.jpg"
          alt="Alex and Claire holding hands in trees" 
          fill
          className='bg-cover object-cover object-center -z-10'
        />

        <div className='flex justify-between md:px-20 lg:px-50 xl:px-70 bg-white/70 py-2.5 z-20 text-black font-serif text-2xl' >
          <a className='ml-5' href='#Home'>Home</a>
          <div className='md:hidden mr-5 pt-1'>
            <button 
              aria-label="Open mobile menu"
              onClick={toggleMobileMenu}
            > 
              <svg className='h-6.5 w-6.5' fill='current-color' viewBox="0 0 18 18">
					      <title>Menu</title>
					      <path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v-2z"></path>
				      </svg>
            </button>
          </div>

          {/* Desktop Nav Links */}
          <div className='hidden md:contents'>
            <a href='#Details'>Details</a>
            <a href='#Travel'>Travel</a>
            <a href='#FAQs'>FAQs</a>
            <a href='#Registry'>Registry</a>
            <a className='mr-5' href='#Gallery'>Gallery</a>
          </div>

          {/* Mobile Menu Overlay */}
          <div 
            className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
              isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={toggleMobileMenu}
          />

          {/* Mobile Nav Links - hidden by default */}
          <div className={`fixed top-0 right-0 min-h-screen w-64 bg-slate-100 shadow-lg transform md:hidden z-50
            transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"}`
            }>
            <a className='block p-4 border-b border-black' href='#Home'>Home</a>
            <a className='block p-4 border-b border-black' href='#Details'>Details</a>
            <a className='block p-4 border-b border-black' href='#Travel'>Travel</a>
            <a className='block p-4 border-b border-black' href='#FAQs'>FAQs</a>
            <a className='block p-4 border-b border-black' href='#Registry'>Registry</a>
            <a className='block p-4' href='#Gallery'>Gallery</a>
          </div>
        </div>
        
        <div className='flex flex-col justify-center items-center mt-15 drop-shadow-xl/70 text-white font-serif'>
          <h1 className='text-5xl'>Alex & Claire</h1>
          <p className='text-2xl mt-5'>October 10, 2026 - Boone, IA</p> 
          <p className='text-2xl'>{daysToGo}</p>
          <button className='text-black text-2xl bg-white/80 px-8 py-3 mt-5'>
            RSVP
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home;

function DaysUntilWedding() {
  const weddingDate = new Date('2026-10-10T00:00:00');
  const currentDate = new Date();
  const timeDifference = weddingDate.getTime() - currentDate.getTime();
  const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
  
  if (daysDifference == 0) {
    return "Today is the day!";
  }

  if (daysDifference == 1) {
    return "1 Day to go!";
  }

  if (daysDifference > 1) {
    return daysDifference + " Days to go!";
  }

  return "";
}