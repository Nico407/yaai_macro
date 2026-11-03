import { format } from "date-fns";

/** The date on this device's clock (Swiss time here) as yyyy-MM-dd. Not toISOString(), which is UTC: between
 *  midnight and 1:00 (2:00 in summer) that's still yesterday. */
export function localDateISO(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}
