export interface HotelDetails {
  name: string;
  address: string;
  phone: string;
  bookingLink: string;
  details: string;
}

export const HOTELS: Record<string, HotelDetails> = {
  cobblestone: {
    name: "Cobblestone Inn & Suites",
    address: "1900 Lakewood Drive, Boone, IA, 50036",
    phone: "(515)212-8823",
    bookingLink: "https://staycobblestone.com/ia/boone",
    details: "Must call and mention The Czarnick Wedding to get the block rate."
  },
  baymont: {
    name: "Baymont by Wyndham",
    address: "1745 SouthEast Marshall, Boone, IA, 50036",
    phone: "(515)432-8168",
    bookingLink: "https://www.wyndhamhotels.com/baymont/boone-iowa/baymont-inn-suites-boone/overview",
    details: "No block setup, across the street from Cobblestone."
  },
};