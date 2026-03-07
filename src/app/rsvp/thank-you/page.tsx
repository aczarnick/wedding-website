import Link from 'next/link';
import { Header } from '@/components/Header';

const ThankYouPage = () => {
  return (
    <div className='min-h-screen flex flex-col bg-sage-50/30'>
      <Header />

      <div className='flex-1 flex flex-col items-center justify-center px-6 text-center'>
        <h1 className='text-4xl sm:text-5xl text-sage-800'>Thank you!</h1>
        <p className='text-xl sm:text-2xl text-sage-700 mt-6'>Thanks for your response.</p>
        <Link
          href='/rsvp'
          className='mt-10 px-6 py-3 border border-sage-700 text-sage-700 rounded-lg hover:bg-sage-100 transition-colors duration-200'
        >
          Update your RSVP
        </Link>
      </div>
    </div>
  );
};

export default ThankYouPage;
