import Image from 'next/image';
import { EventDetails } from '@/constants/events';

interface EventSectionProps extends EventDetails {
  mobileImageWidth?: number;
  mobileImageHeight?: number;
  desktopImageWidth?: number;
  desktopImageHeight?: number;
}

export const EventSection: React.FC<EventSectionProps> = ({
  title,
  time,
  address,
  mapLink,
  image,
  imageAlt,
  flip,
  subtitle,
  mobileImageWidth = 246,
  mobileImageHeight = 164,
  desktopImageWidth = 342,
  desktopImageHeight = 512,
}) => {
  return (
    <>
      {/* Mobile Layout */}
      <div className='flex flex-col md:hidden items-center px-6 py-12'>
        <p className="text-3xl text-center text-sage-800">{title}</p>
        <p className="text-xs uppercase tracking-[0.35em] text-sage-700/70 mt-3">{subtitle}</p>
        <Image
          src={image}
          alt={imageAlt}
          width={mobileImageWidth}
          height={mobileImageHeight}
          className="mt-10 shadow-lg/70 rounded-2xl"
        />
        <p className="text-lg mt-6 text-sage-800">{time}</p>
        <p className="text-base text-sage-700">{address}</p>
        <a className="text-base underline text-sage-700 hover:text-sage-800" href={mapLink}>
          Map
        </a>
      </div>

      {/* Desktop Layout */}
      <div className='hidden md:flex flex-row items-center justify-center gap-12 py-20 px-10 lg:px-24'>
        <div
          className={flip ? 'order-2' : ''}
        >
          <Image
            src={image}
            alt={imageAlt}
            width={desktopImageWidth}
            height={desktopImageHeight}
            className="shadow-lg/70 rounded-3xl basis-1/2"
          />
        </div>
        <div className="text-center basis-1/2">
          <p className="text-5xl text-sage-800">{title}</p>
          <p className="text-xs uppercase tracking-[0.45em] text-sage-700/70 mt-4">{subtitle}</p>
          <p className="text-lg mt-6 text-sage-800">{time}</p>
          <p className="text-base text-sage-700">{address}</p>
          <a className="text-base underline text-sage-700 hover:text-sage-800" href={mapLink}>
            Map
          </a>
        </div>
      </div>
    </>
  );
};
