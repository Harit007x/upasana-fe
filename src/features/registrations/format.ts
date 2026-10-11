import { TIME_SLOTS, formatStayDate, mealOf, toLocalDate } from "@/config/event"
import { formatTime } from "@/lib/time"

import type { IndiaFlight, Registration, StayPoint } from "./types"

/** "Thu 24 Dec · Day before, evening · with dinner" */
export function formatStay(point: StayPoint) {
  const meal = formatMeal(point)
  return `${formatStayDate(point.date)}, ${TIME_SLOTS[point.slot].split(" (")[0].toLowerCase()}${meal ? ` · ${meal}` : ""}`
}

/** "with breakfast" or "no breakfast"; empty on registrations from before it was asked. */
export function formatMeal(point: Pick<StayPoint, "slot" | "meal">) {
  const meal = mealOf(point.slot)
  if (!meal || point.meal === undefined) return ""
  return point.meal ? `with ${meal}` : `no ${meal}`
}

const FLIGHT_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
})

/** "Sun 24 Jan, 6:30 am · AI 144" — the time and number when given. */
export function formatIndiaFlight(flight: IndiaFlight) {
  const when = [
    FLIGHT_DATE.format(toLocalDate(flight.date)).replace(",", ""),
    flight.time && formatTime(flight.time),
  ]
    .filter(Boolean)
    .join(", ")
  return [when, flight.flight].filter(Boolean).join(" · ")
}

/** The name a registration goes by in lists: the family name, else the person. */
export function displayName(registration: Registration) {
  return registration.groupName ?? registration.members[0]?.fullName ?? "—"
}

/** "3 Oct, 2:15 pm" in the viewer's own time zone. */
export function formatCreatedAt(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}
