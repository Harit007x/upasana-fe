/**
 * Everything about the event itself, in one place.
 *
 * The dates, the venue and the list of mandals are placeholders until the
 * organising committee confirms them. Every screen reads from here, so changing
 * a date or adding a mandal is an edit to this file and nothing else.
 */

export const EVENT = {
  name: "Youth Convention 2026",
  venue: "Mandir, Ahmedabad",
  /** The event days, in order: 30 Jan – 1 Feb 2027. ISO dates, no time zone: these are calendar days at the venue. */
  days: ["2027-01-30", "2027-01-31", "2027-02-01"],
} as const

/**
 * Days a guest can arrive on or leave on.
 *
 * One day either side of the event, because people travelling from far away
 * arrive the evening before and leave the morning after, and those nights still
 * need a bed.
 */
export const STAY_DATES = [
  "2027-01-29",
  ...EVENT.days,
  "2027-02-02",
] as const

export type StayDate = (typeof STAY_DATES)[number]

/**
 * Mandals guests register under.
 *
 * A mandal is the local satsang group a devotee belongs to, usually named after
 * the city or the area. Kept as a flat list for now; it will move to the
 * database once staff need to add new ones themselves.
 */
export const MANDALS = [
  "Ahmedabad – Maninagar",
  "Ahmedabad – Naranpura",
  "Gandhinagar",
  "Surat",
  "Vadodara",
  "Rajkot",
  "Bhavnagar",
  "Anand",
  "Jamnagar",
  "Mumbai",
  "Pune",
  "Delhi",
  "London (UK)",
  "New Jersey (USA)",
] as const

/** "Ahmedabad – Maninagar" → "Ahmedabad", "London (UK)" → "London". */
export function cityOfMandal(mandal: string) {
  return mandal.split(" – ")[0].replace(/ \(.*\)$/, "")
}

/** For guests who come on their own, outside any mandal. */
export const NO_MANDAL = "Not in a mandal"

/** Approximate time of day. Planning works in slots; nobody knows their exact train time a month out. */
export const TIME_SLOTS = {
  morning: "Morning (6 am – 12 pm)",
  afternoon: "Afternoon (12 – 4 pm)",
  evening: "Evening (4 – 8 pm)",
  night: "Night (after 8 pm)",
} as const

export type TimeSlot = keyof typeof TIME_SLOTS

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
})
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-IN", { weekday: "short" })

/** Parses an ISO date as a local calendar day, so "2026-12-25" never renders as the 24th west of UTC. */
export function toLocalDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** "25 Dec" */
export function formatDay(iso: string) {
  return DATE_FORMAT.format(toLocalDate(iso))
}

/** "Fri 25 Dec · Day 1", or "Thu 24 Dec · Day before" for the dates either side. */
export function formatStayDate(iso: string) {
  const dayIndex = (EVENT.days as readonly string[]).indexOf(iso)
  const suffix =
    dayIndex >= 0
      ? `Day ${dayIndex + 1}`
      : iso < EVENT.days[0]
        ? "Day before"
        : "Day after"
  return `${WEEKDAY_FORMAT.format(toLocalDate(iso))} ${formatDay(iso)} · ${suffix}`
}

/** "30 Jan – 1 Feb 2027", or "25 – 29 Dec 2026" within one month. */
export function formatEventRange() {
  const first = EVENT.days[0]
  const last = EVENT.days[EVENT.days.length - 1]
  const start =
    first.slice(0, 7) === last.slice(0, 7)
      ? formatDay(first).split(" ")[0]
      : formatDay(first)
  return `${start} – ${formatDay(last)} ${last.slice(0, 4)}`
}
