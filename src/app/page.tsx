'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { EventSection } from '@/components/EventSection';
import { SectionContainer } from '@/components/SectionContainer';
import { EVENTS } from '@/constants/events';
import { DaysUntilWedding } from '@/utils/dateUtils';

const Home = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

        <Header 
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
        
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
        <EventSection {...EVENTS.ceremony} />
      </SectionContainer>

      <SectionContainer>
        <EventSection {...EVENTS.reception} />
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
  );
};

export default Home;