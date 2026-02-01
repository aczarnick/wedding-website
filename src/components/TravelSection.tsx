import { HotelDetails } from '@/constants/hotels';

export const TravelSection: React.FC<HotelDetails> = ({
  name,
  address,
  phone,
  bookingLink,
  details,
}) => {
  return (
    <>
      <div className="flex flex-col md:flex-row justify-center items-center gap-10">
        <div className="p-5 max-w-sm text-center font-serif">
          <a 
            className="text-xl font-serif mb-5 font-bold underline"
            href={bookingLink}
          >
            {name}
          </a>
          <p className="text-md mt-5">
            {address}
          </p>
          <a className="text-md underline" href={`tel:${phone}`}>
            {phone}
          </a>
          <p className="text-md mt-5">
            {details}
          </p>
        </div>
      </div>
    </>
  );
}