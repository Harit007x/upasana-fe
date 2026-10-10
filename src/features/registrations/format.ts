import { TIME_SLOTS, formatStayDate } from "@/config/event"

import type { Registration, StayPoint } from "./types"

/** "Thu 24 Dec · Day before, evening" */
export function formatStay(point: StayPoint) {
  return `${formatStayDate(point.date)}, ${TIME_SLOTS[point.slot].split(" (")[0].toLowerCase()}`
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
