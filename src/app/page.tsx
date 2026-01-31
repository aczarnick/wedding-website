'use client';

import Image from 'next/image';
import { useState } from 'react';
import { MobileNavLink } from '@/components/MobileNavLink';
import { SectionContainer } from '@/components/SectionContainer';

const Home = () => {

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const daysToGo = DaysUntilWedding();

  return (
    <div className='flex flex-col max-h-screen overflow-x-hidden overflow-y-scroll snap-y snap-mandatory'>
      <div id='Home' className='snap-center min-h-screen'>
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
              onClick={() => setIsMobileMenuOpen(true)}
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
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Mobile Nav Links - hidden by default */}
          <div className={`fixed top-0 right-0 min-h-screen w-64 bg-slate-100 shadow-lg transform md:hidden z-50
            transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"}`
            }>
            <MobileNavLink href='#Home' label='Home' />
            <MobileNavLink href='#Details' label='Details' />
            <MobileNavLink href='#Travel' label='Travel' />
            <MobileNavLink href='#FAQs' label='FAQs' />
            <MobileNavLink href='#Registry' label='Registry' />
            <MobileNavLink href='#Gallery' label='Gallery' isLast />
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
      <SectionContainer id="Details">
        <div className='flex flex-col md:hidden items-center min-h-screen'>
          <p className="text-5xl font-serif mt-5">Ceremony</p>
          <Image
            src="/images/ring-shot.jpg"
            alt="Close up of engagement ring"
            width={246}
            height={164}
            className="mt-10 shadow-lg/70 rounded-lg"
          />
          <p className="text-xl mt-5">4:30&nbsp;PM</p>
          <p className="text-xl">1815 260th St Boone, IA 50036</p>
          <a className="text-xl underline mt-5" href='https://maps.app.goo.gl/oStkJhh8UEmdLwWG8'>Map</a>

        </div>
        <div className='hidden md:flex flex-row items-center min-h-screen justify-center gap-10'>
          <div>
            <Image
              src="/images/ring-shot.jpg"
              alt="Close up of engagement ring"
              width={342}
              height={512}
              className="shadow-lg/70 rounded-lg basis-1/2"
            />
          </div>
          <div className='text-center font-serif basis-1/2'>
            <p className="text-5xl font-serif mt-5">Ceremony</p>
            <p className="text-xl mt-5">4:30&nbsp;PM</p>
            <p className="text-xl">1815 260th St Boone, IA 50036</p>
            <a className="text-xl underline mt-20" href='https://maps.app.goo.gl/oStkJhh8UEmdLwWG8'>Map</a>

          </div>
        </div>
      </SectionContainer>
      <SectionContainer>
        <div className='flex flex-col md:hidden justify-center items-center min-h-screen'>
          <p className="text-5xl font-serif mt-5">Reception</p>
          <Image
            src="/images/lift-bar.jpg"
            alt="Alex lifting Claire in the air at the bar"
            width={246}
            height={164}
            className="mt-10 shadow-lg/70 rounded-lg"
          />
          <p className="text-xl mt-5">6:00&nbsp;PM</p>
          <p className="text-xl">1815 260th St Boone, IA 50036</p>
          <a className="text-xl underline mt-5" href='https://maps.app.goo.gl/oStkJhh8UEmdLwWG8'>Map</a>
          
        </div>
        <div className='hidden md:flex flex-row items-center min-h-screen justify-center gap-10'>
          <div className='text-center font-serif basis-1/2'>
            <p className="text-5xl font-serif mt-10">Reception</p>
            <p className="text-xl mt-5">6:00&nbsp;PM</p>
            <p className="text-xl">1815 260th St Boone, IA 50036</p>
            <a className="text-xl underline mt-20" href='https://maps.app.goo.gl/oStkJhh8UEmdLwWG8'>Map</a>
          </div>
          <div>
            <Image
              src="/images/lift-bar.jpg"
              alt="Alex lifting Claire in the air at the bar"
              width={342}
              height={512}
              className="shadow-lg/70 rounded-lg basis-1/2"
            />
          </div>
        </div>
      </SectionContainer>
      <SectionContainer id="Travel">
        <h2 className="text-3xl font-serif">Travel</h2>
      </SectionContainer>
      <SectionContainer id="FAQs">
        <h2 className="text-3xl font-serif">FAQs</h2>
      </SectionContainer>
      <SectionContainer id="Registry">
        <h2 className="text-3xl font-serif">Registry</h2>
      </SectionContainer>
      <SectionContainer id="Gallery">
        <h2 className="text-3xl font-serif">See our Gallery</h2>
      </SectionContainer>
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