export function DaysUntilWedding(): string {
  const weddingDate = new Date('2026-10-10T00:00:00');
  const currentDate = new Date();
  const timeDifference = weddingDate.getTime() - currentDate.getTime();
  const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
  
  if (daysDifference === 0) {
    return "Today is the day!";
  }

  if (daysDifference === 1) {
    return "1 Day to go!";
  }

  if (daysDifference > 1) {
    return `${daysDifference} Days to go!`;
  }

  return "";
}
