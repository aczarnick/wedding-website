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
  mobileImageWidth = 246,
  mobileImageHeight = 164,
  desktopImageWidth = 342,
  desktopImageHeight = 512,
}) => {
  return (
    <>
      {/* Mobile Layout */}
      <div className='flex flex-col md:hidden items-center'>
        <p className="text-3xl text-center mt-10">{title}</p>
        <Image
          src={image}
          alt={imageAlt}
          width={mobileImageWidth}
          height={mobileImageHeight}
          className="mt-10 shadow-lg/70 rounded-lg"
        />
        <p className="text-xl mt-5">{time}</p>
        <p className="text-xl">{address}</p>
        <a className="text-xl underline" href={mapLink}>
          Map
        </a>
      </div>

      {/* Desktop Layout */}
      <div className='hidden md:flex flex-row items-center justify-center gap-5 mt-20 mx-50'>
        <div
          className={flip ? 'order-2' : ''}
        >
          <Image
            src={image}
            alt={imageAlt}
            width={desktopImageWidth}
            height={desktopImageHeight}
            className="shadow-lg/70 rounded-lg basis-1/2"
          />
        </div>
        <div className={`text-center basis-1/2`}>
          <p className="text-5xl">{title}</p>
          <p className="text-xl mt-5">{time}</p>
          <p className="text-xl">{address}</p>
          <a className="text-xl underline" href={mapLink}>
            Map
          </a>
        </div>
      </div>
    </>
  );
};
