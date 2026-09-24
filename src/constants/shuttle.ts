export interface ShuttleTrip {
  pickup: string;
  arrival: string;
  note?: string;
}

export interface ShuttleDetails {
  stops: string[];
  capacity: number;
  // The only trips with exact times; everything after runs hourly.
  preCeremony: ShuttleTrip[];
  hourlyFrom: string;
  lastRidesHome: string[];
}

export const SHUTTLE: ShuttleDetails = {
  stops: ["Baymont by Wyndham", "Cobblestone Inn & Suites", "The farm"],
  capacity: 40,
  preCeremony: [
    { pickup: "3:30\u00A0PM", arrival: "3:45\u00A0PM" },
    { pickup: "4:00\u00A0PM", arrival: "4:15\u00A0PM", note: "may run a few minutes behind" },
  ],
  hourlyFrom: "5:00\u00A0PM",
  lastRidesHome: ["11:00\u00A0PM", "11:30\u00A0PM"],
};
