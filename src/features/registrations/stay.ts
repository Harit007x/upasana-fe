import { EVENT, TIME_SLOTS, type TimeSlot } from "@/config/event"

import type { Member, Registration, StayPoint } from "./types"

const SLOT_ORDER = Object.keys(TIME_SLOTS) as TimeSlot[]

/** Orders two stay points: negative when `a` comes first. Dates are ISO, so they compare as strings. */
export function compareStay(a: StayPoint, b: StayPoint) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)
}

/** Whether the member is at the venue at any point on the given day. */
export function isPresentOn(member: Pick<Member, "arrival" | "departure">, day: string) {
  return member.arrival.date <= day && member.departure.date >= day
}

/** Nights between arrival and departure. Leaving the same day it arrived is zero nights. */
export function nightsBetween(arrival: StayPoint, departure: StayPoint) {
  const ms =
    Date.parse(`${departure.date}T00:00:00Z`) -
    Date.parse(`${arrival.date}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

/** Event days this registration's party covers, counting anyone in it. */
export function eventDaysCovered(registration: Registration) {
  return EVENT.days.filter((day) =>
    registration.members.some((member) => isPresentOn(member, day))
  ).length
}

/** True when at least one member's dates differ from the booking's. */
export function hasSplitSchedule(registration: Registration) {
  return registration.members.some(
    (member) =>
      compareStay(member.arrival, registration.arrival) !== 0 ||
      compareStay(member.departure, registration.departure) !== 0
  )
}
