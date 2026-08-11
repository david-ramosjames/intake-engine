// Format timestamps in US Central time for the admin UI. The server runs in UTC,
// so toLocaleString() with no timezone would show UTC; pin it to America/Chicago
// (which handles CST/CDT automatically) and label it so it's unambiguous.
export function formatCentral(d: string | Date): string {
  return new Date(d).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}
