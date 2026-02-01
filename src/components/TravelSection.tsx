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
      <div className="flex flex-col md:flex-row justify-center items-center gap-10 px-6">
        <div className="p-6 max-w-md text-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-sage-100">
          <a 
            className="text-lg font-semibold text-sage-800 hover:text-sage-700 underline decoration-sage-200"
            href={bookingLink}
          >
            {name}
          </a>
          <p className="text-sm mt-4 text-sage-700">
            {address}
          </p>
          <a className="text-sm underline text-sage-700 hover:text-sage-800" href={`tel:${phone}`}>
            {phone}
          </a>
          <p className="text-sm mt-4 text-sage-700">
            {details}
          </p>
        </div>
      </div>
    </>
  );
}
