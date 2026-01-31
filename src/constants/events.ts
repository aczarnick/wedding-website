export interface EventDetails {
  title: string;
  time: string;
  address: string;
  mapLink: string;
  image: string;
  imageAlt: string;
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
  },
};

export const NAV_LINKS = ["Details", "Travel", "FAQs", "Registry", "Gallery"] as const;
