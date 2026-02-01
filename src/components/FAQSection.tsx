import { FAQS } from '@/constants/faqs';

export const FAQSection: React.FC = () => {
  return (
    <>
      <p className="text-3xl text-center text-sage-800">FAQs</p>
      <p className="text-center text-xs uppercase tracking-[0.4em] text-sage-700/70 mt-3">Good to know</p>
      <div className='flex flex-col gap-6 px-7.5 pb-12 pt-10 text-sm sm:px-30 md:px-40 lg:px-50 xl:px-60 2xl:px-80 text-sage-700'>
        {FAQS.map((faq, index) => (
          <div key={index}>
            <p className="font-semibold text-sage-800">Q: {faq.question}</p>
            <p className="mt-2">A: {faq.answer}</p>
          </div>
        ))}
      </div>
      <p className="text-lg text-center pb-16 text-sage-700">Come back for more updates!</p>
    </>
  );
};
