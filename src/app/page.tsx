'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { EventSection } from '@/components/EventSection';
import { SectionContainer } from '@/components/SectionContainer';
import { EVENTS, HOTELS } from '@/constants/events';
import { DaysUntilWedding } from '@/utils/dateUtils';
import { TravelSection } from '@/components/TravelSection';

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
          preload={true}
        />

        <Header 
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />
        
        <div className='flex flex-col justify-center items-center mt-15 drop-shadow-xl/70 text-white font-serif'>
          <h1 className='text-5xl'>Alex & Claire</h1>
          <p className='text-2xl mt-5'>October 10, 2026 - Boone, IA</p> 
          <p className='text-2xl'>{daysToGo}</p>
          <button className='text-black text-2xl bg-white/80 px-8 py-3 mt-5'>RSVP</button>
        </div>
      </div>

      <SectionContainer id="Details">
        <EventSection {...EVENTS.ceremony} />
      </SectionContainer>

      <SectionContainer>
        <EventSection {...EVENTS.reception} />
      </SectionContainer>

      <SectionContainer id="Travel">
        <h1 className="text-3xl font-serif text-center mt-10">Travel Recomendations</h1>
        <TravelSection {...HOTELS.cobblestone} />
        <TravelSection {...HOTELS.baymont} />
        <h1 className="text-xl font-serif text-center mt-10">Issues with booking? Let us know!</h1>
      </SectionContainer>
      <SectionContainer id="FAQs">
        <p className="text-3xl font-serif text-center my-10">FAQs</p>
        <div className='flex flex-col gap-2.5 px-7.5 text-sm sm:px-30 md:px-40 lg:px-50 xl:px-60 2xl:px-80'>
          <p className="underline font-black">Q: Is this in the middle of nowhere?</p>
          <p className="">A: Yes! The ceremony and reception will be at Claire's Grandmothers farm!</p>
          <p className="underline font-black">Q: What should I wear?</p>
          <p className="">A: Dress Formal. The ceremony and reception will be inside in unconditioned spaces. We will do whatever we can to make the night comfortable.</p>
          <p className="underline font-black">Q: Will there be food and drinks?</p>
          <p className="">A: Yes! Following the ceremony there will be a cocktail hour(-ish). After that, there will be a full dinner and dessert! The bar will be open all night with beer and seltzers! If beer and seltzers aren't for you, feel free to bring your own!</p>
        </div>
        <p className="text-xl text-center mt-10">Come back for more updates!</p>
      </SectionContainer>
      <SectionContainer id="Registry">
        <h1 className="text-3xl font-serif">Registry</h1>
      </SectionContainer>
      <SectionContainer id="Gallery">
        <h1 className="text-3xl font-serif">See our Gallery</h1>
      </SectionContainer>
    </div>
  );
};

export default Home;