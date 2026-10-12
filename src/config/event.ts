/**
 * Everything about the event itself, in one place.
 *
 * The dates, the venue and the list of mandals are placeholders until the
 * organising committee confirms them. Every screen reads from here, so changing
 * a date or adding a mandal is an edit to this file and nothing else.
 */

import { localeOf, translator, type Lang } from "@/i18n/translate"

export const EVENT = {
  name: "Youth Convention 2026",
  venue: "Upasana Dham Mandir, Ahmedabad",
  /** The event days, in order: 29 Jan – 1 Feb 2027. ISO dates, no time zone: these are calendar days at the venue. Mirrors EVENT_DAYS on the server. */
  days: ["2027-01-29", "2027-01-30", "2027-01-31", "2027-02-01"],
} as const

/** Days a guest can arrive on or leave on: the event days only. */
export const STAY_DATES = EVENT.days

export type StayDate = (typeof STAY_DATES)[number]

/**
 * Mandals guests register under.
 *
 * A mandal is the local satsang group a devotee belongs to, usually named after
 * the city or the area. Kept as a flat list for now; it will move to the
 * database once staff need to add new ones themselves.
 */
export const MANDALS = [
  "Ahmedabad",
  "Dahegam",
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
  "Canada",
  "New Zealand",
  "Australia",
  "Dubai (UAE)",
] as const

/** For guests who come on their own, outside any mandal. */
export const NO_MANDAL = "Not in a mandal"

/**
 * Mandals near enough to come and go from home: Ahmedabad, and
 * these. Their devotees are not asked how they travel or whether they need a
 * bed — they need neither. Mirrors isLocalMandal on the server.
 */
const LOCAL_MANDALS: readonly string[] = ["Dahegam", "Gandhinagar"]
export const isLocalMandal = (mandal: string) =>
  mandal.startsWith("Ahmedabad") || LOCAL_MANDALS.includes(mandal)

/** The oldest age asked whether they will attend the Youth Convention. Mirrors the server. */
export const YOUTH_MAX_AGE = 40

/** The Ahmedabad stations a train can arrive at. Mirrors TRAIN_STATIONS on the server. */
export const TRAIN_STATIONS = [
  "Kalupur (Ahmedabad Junction)",
  "Sabarmati",
  "Chandlodiya",
  "Maninagar",
] as const

/**
 * Mandals outside India. Their devotees fly in, so the form offers —
 * optionally — a pickup from and a drop to Ahmedabad airport.
 */
export const OVERSEAS_MANDALS: readonly string[] = [
  "London (UK)",
  "New Jersey (USA)",
  "Canada",
  "New Zealand",
  "Australia",
  "Dubai (UAE)",
]

/** Approximate time of day. Planning works in slots; nobody knows their exact train time a month out. */
export const TIME_SLOTS = {
  morning: "Morning (6 am – 12 pm)",
  afternoon: "Afternoon (12 – 4 pm)",
  evening: "Evening (after 4 pm)",
} as const

export type TimeSlot = keyof typeof TIME_SLOTS

/**
 * The meal served in each slot. Someone arriving or leaving in a slot is asked
 * whether they will take it, so the kitchen knows how many to cook for.
 */
export const SLOT_MEALS: Record<TimeSlot, string> = {
  morning: "breakfast",
  afternoon: "lunch",
  evening: "dinner",
}

/** The meal asked about for a slot, or undefined while no slot is picked. */
export const mealOf = (slot: string): string | undefined =>
  SLOT_MEALS[slot as TimeSlot]

// One formatter per language, made on first use.
const formatters = new Map<string, Intl.DateTimeFormat>()
const formatterFor = (lang: Lang, kind: "day" | "weekday") => {
  const key = `${lang}:${kind}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(
      localeOf(lang),
      kind === "day" ? { day: "numeric", month: "short" } : { weekday: "short" }
    )
    formatters.set(key, format)
  }
  return format
}

/** Parses an ISO date as a local calendar day, so "2026-12-25" never renders as the 24th west of UTC. */
export function toLocalDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** "25 Dec", or "25 ડિસે" in Gujarati */
export function formatDay(iso: string, lang: Lang = "en") {
  return formatterFor(lang, "day").format(toLocalDate(iso))
}

/** "Fri 25 Dec · Day 1", or "Thu 24 Dec · Day before" for the dates either side. */
export function formatStayDate(iso: string, lang: Lang = "en") {
  const t = translator(lang)
  const dayIndex = (EVENT.days as readonly string[]).indexOf(iso)
  const suffix =
    dayIndex >= 0
      ? t("Day {n}", { n: dayIndex + 1 })
      : iso < EVENT.days[0]
        ? t("Day before")
        : t("Day after")
  return `${formatterFor(lang, "weekday").format(toLocalDate(iso))} ${formatDay(iso, lang)} · ${suffix}`
}

/** "30 Jan – 1 Feb 2027", or "25 – 29 Dec 2026" within one month. */
export function formatEventRange(lang: Lang = "en") {
  const first = EVENT.days[0]
  const last = EVENT.days[EVENT.days.length - 1]
  const start =
    first.slice(0, 7) === last.slice(0, 7)
      ? formatDay(first, lang).split(" ")[0]
      : formatDay(first, lang)
  return `${start} – ${formatDay(last, lang)} ${last.slice(0, 4)}`
}
