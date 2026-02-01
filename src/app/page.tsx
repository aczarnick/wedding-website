'use client';

import { useState } from 'react';
import { HeroSection } from '@/components/HeroSection';
import { EventSection } from '@/components/EventSection';
import { SectionContainer } from '@/components/SectionContainer';
import { FAQSection } from '@/components/FAQSection';
import { Footer } from '@/components/Footer';
import { EVENTS } from '@/constants/events';
import { HOTELS } from '@/constants/hotels';
import { DaysUntilWedding } from '@/utils/dateUtils';
import { TravelSection } from '@/components/TravelSection';

const Home = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const daysToGo = DaysUntilWedding();

  return (
    <div className='flex flex-col max-h-screen overflow-x-hidden overflow-y-scroll snap-y'>
      <HeroSection 
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        daysToGo={daysToGo}
      />

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
        <FAQSection />
        <Footer />
      </SectionContainer>
    </div>
  );
};

export default Home;