import { EVENTS } from "./events";

export interface ScheduleItem {
  time: string;
  event: string;
}

// Ceremony and dinner times come from EVENTS so the schedule can't disagree with the Details cards.
export const SCHEDULE: ScheduleItem[] = [
  { time: EVENTS.ceremony.time, event: "Ceremony" },
  { time: "5:00–6:00 PM", event: "Cocktail hour" },
  { time: EVENTS.reception.time, event: "Dinner" },
];
