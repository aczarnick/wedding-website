import { Header } from '@/components/Header';
import { RsvpWizard } from '@/components/rsvp/RsvpWizard';

const RsvpPage = () => {
  return (
    <div className='min-h-screen flex flex-col bg-sage-50/30'>
      <Header />

      <main className='flex-1 flex flex-col items-center px-6 py-12'>
        <RsvpWizard />
      </main>
    </div>
  );
};

export default RsvpPage;
