import liftBar from "../../public/images/lift-bar.jpg";
import ringShot from "../../public/images/ring-shot.jpg";
import { StaticImageData } from "next/dist/shared/lib/image-external";

export interface EventDetails {
  title: string;
  time: string;
  address: string;
  mapLink: string;
  image: StaticImageData;
  imageAlt: string;
  flip?: boolean;
  subtitle?: string;
}

export const EVENTS: Record<string, EventDetails> = {
  ceremony: {
    title: "Ceremony",
    time: "4:30\u00A0PM",
    address: "1815 260th St Boone, IA 50036",
    mapLink: "https://maps.app.goo.gl/oStkJhh8UEmdLwWG8",
    image: ringShot,
    imageAlt: "Close up of engagement ring",
    subtitle: "Fun Begins",
  },
  reception: {
    title: "Reception",
    time: "6:00\u00A0PM",
    address: "1815 260th St Boone, IA 50036",
    mapLink: "https://maps.app.goo.gl/oStkJhh8UEmdLwWG8",
    image: liftBar,
    imageAlt: "Alex lifting Claire in the air at the bar",
    flip: true,
    subtitle: "Party Starts",
  },
};

export const NAV_LINKS = ["Details", "Travel", "FAQs", "Registry", "Gallery"] as const;