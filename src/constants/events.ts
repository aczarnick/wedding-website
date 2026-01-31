export interface EventDetails {
  title: string;
  time: string;
  address: string;
  mapLink: string;
  image: string;
  imageAlt: string;
  flip?: boolean;
}

export const EVENTS: Record<string, EventDetails> = {
  ceremony: {
    title: "Ceremony",
    time: "4:30\u00A0PM",
    address: "1815 260th St Boone, IA 50036",
    mapLink: "https://maps.app.goo.gl/oStkJhh8UEmdLwWG8",
    image: "/images/ring-shot.jpg",
    imageAlt: "Close up of engagement ring",
  },
  reception: {
    title: "Reception",
    time: "6:00\u00A0PM",
    address: "1815 260th St Boone, IA 50036",
    mapLink: "https://maps.app.goo.gl/oStkJhh8UEmdLwWG8",
    image: "/images/lift-bar.jpg",
    imageAlt: "Alex lifting Claire in the air at the bar",
    flip: true,
  },
};

export const NAV_LINKS = ["Details", "Travel", "FAQs", "Registry", "Gallery"] as const;

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