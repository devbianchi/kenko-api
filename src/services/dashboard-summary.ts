export interface HourCount {
  hour: number;
  appointmentCount: number;
}

export interface PeakHourSummary {
  hour: number;
  appointmentCount: number;
  otherBusinessHoursAverage: number;
  aboveAverage: number;
}

/** The peak is selected only from business hours; tied counts choose the earlier hour. */
export function summarizePeakHour(
  businessHours: number[],
  counts: HourCount[],
): PeakHourSummary | null {
  if (businessHours.length === 0) return null;

  const countsByHour = new Map(counts.map(({ hour, appointmentCount }) => [hour, appointmentCount]));
  const series = [...new Set(businessHours)]
    .sort((a, b) => a - b)
    .map((hour) => ({ hour, count: countsByHour.get(hour) ?? 0 }));
  const peak = series.reduce((best, current) =>
    current.count > best.count ? current : best,
  );
  const others = series.filter((item) => item.hour !== peak.hour);
  const average =
    others.length === 0 ? 0 : others.reduce((sum, item) => sum + item.count, 0) / others.length;

  return {
    hour: peak.hour,
    appointmentCount: peak.count,
    otherBusinessHoursAverage: average,
    aboveAverage: peak.count - average,
  };
}

/** Median with the arithmetic mean of the two central observations for even samples. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}
