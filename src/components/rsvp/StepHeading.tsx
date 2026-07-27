interface StepHeadingProps {
  title: string;
  eyebrow: string;
}

export const StepHeading: React.FC<StepHeadingProps> = ({ title, eyebrow }) => (
  <div className='text-center'>
    <h1 className='text-3xl text-sage-800 sm:text-4xl'>{title}</h1>
    <p className='mt-3 text-xs uppercase tracking-[0.4em] text-sage-700/70'>{eyebrow}</p>
    <div aria-hidden='true' className='mx-auto mt-5 h-0.5 w-16 bg-sage-200' />
  </div>
);
