export interface ShuttleRun {
  pickup: string;
  arrival: string;
  note?: string;
}

export interface ShuttleDetails {
  stops: string[];
  capacity: number;
  toFarm: ShuttleRun[];
  toHotels: string[];
}

export const SHUTTLE: ShuttleDetails = {
  stops: ["Baymont by Wyndham", "Cobblestone Inn & Suites", "The farm"],
  capacity: 40,
  // Hotel pickup (Baymont first, then Cobblestone) → drop-off at the farm.
  toFarm: [
    { pickup: "3:30\u00A0PM", arrival: "3:45\u00A0PM", note: "Before the ceremony" },
    { pickup: "4:00\u00A0PM", arrival: "4:15\u00A0PM", note: "Before the ceremony — may run a few minutes behind" },
    { pickup: "4:45\u00A0PM", arrival: "5:00\u00A0PM" },
    { pickup: "5:45\u00A0PM", arrival: "6:00\u00A0PM" },
    { pickup: "6:45\u00A0PM", arrival: "7:00\u00A0PM" },
    { pickup: "7:45\u00A0PM", arrival: "8:00\u00A0PM" },
    { pickup: "8:45\u00A0PM", arrival: "9:00\u00A0PM" },
    { pickup: "9:45\u00A0PM", arrival: "10:00\u00A0PM" },
    { pickup: "10:45\u00A0PM", arrival: "11:00\u00A0PM" },
  ],
  // Departures from the farm back to both hotels.
  toHotels: [
    "5:00\u00A0PM",
    "6:00\u00A0PM",
    "7:00\u00A0PM",
    "8:00\u00A0PM",
    "9:00\u00A0PM",
    "10:00\u00A0PM",
    "11:00\u00A0PM",
    "11:30\u00A0PM",
  ],
};
