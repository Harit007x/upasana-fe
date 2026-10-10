import { STAY_DATES, formatStayDate } from "@/config/event"
import type { Member, Registration } from "@/features/registrations/types"

import type { AccommodationData, Allotment, NoticeState, Place, Room } from "./types"

/**
 * Who sleeps where, worked out from the registrations and the allotments.
 *
 * `roomProblem` mirrors the server's (upasana-be src/lib/accommodation.ts),
 * which checks it again on every allotment; here it decides which rooms the
 * allot dialog offers, and what the screens flag as needing attention.
 */

/**
 * Nights someone can need a bed: every stay date but the last. A night is
 * named by its evening's date.
 */
export const NIGHTS: readonly string[] = STAY_DATES.slice(0, -1)

/** The nights someone sleeps over: from their arrival day up to, not including, the day they leave. */
export function nightsOf(member: Pick<Member, "arrival" | "departure">) {
  return NIGHTS.filter(
    (night) => night >= member.arrival.date && night < member.departure.date
  )
}

/** "Fri 29 Jan" */
export function formatNight(night: string) {
  return formatStayDate(night).split(" · ")[0]
}

/** "29 Jan → 2 Feb · 4 nights" */
export function formatNights(member: Pick<Member, "arrival" | "departure">) {
  const count = nightsOf(member).length
  const day = (iso: string) => formatNight(iso).split(" ").slice(1).join(" ")
  return `${day(member.arrival.date)} → ${day(member.departure.date)} · ${
    count === 0 ? "no night" : `${count} ${count === 1 ? "night" : "nights"}`
  }`
}

/** Someone in a room. */
export type Occupant = { registration: Registration; member: Member; nights: string[] }

/**
 * What is wrong with these people sharing this room, or null.
 *
 * - Gents and ladies rooms take only men or only women.
 * - A family room takes one registration's people, of any gender.
 * - On no night are there more people than beds.
 */
export function roomProblem(
  room: Pick<Room, "label" | "beds" | "kind">,
  occupants: Occupant[]
): string | null {
  if (room.kind === "gents") {
    const woman = occupants.find((o) => o.member.gender !== "male")
    if (woman) return `Room ${room.label} is a gents room — ${woman.member.fullName} is female`
  }
  if (room.kind === "ladies") {
    const man = occupants.find((o) => o.member.gender !== "female")
    if (man) return `Room ${room.label} is a ladies room — ${man.member.fullName} is male`
  }
  if (
    room.kind === "family" &&
    new Set(occupants.map((o) => o.registration.id)).size > 1
  ) {
    return `Room ${room.label} is a family room — one family only`
  }
  for (const night of NIGHTS) {
    const count = occupants.filter((o) => o.nights.includes(night)).length
    if (count > room.beds) {
      return `Room ${room.label} has ${room.beds} ${room.beds === 1 ? "bed" : "beds"} but ${count} people on ${formatNight(night)}`
    }
  }
  return null
}

/** Whether someone should be on the ground floor: they asked for help, or are 60 or older. */
export const wantsGroundFloor = (member: Member) =>
  member.needsAssistance || member.age >= 60

export type Bed = { place: Place; room: Room; allotment: Allotment }

/** Lookups over one load of accommodation data and registrations. */
export type AccommodationIndex = {
  places: Place[]
  placeById: Map<string, Place>
  registrationById: Map<string, Registration>
  /** Where a person sleeps, if they have a room. */
  bedOf: (registrationId: string, memberId: string) => Bed | undefined
  /** Everyone in a room, with their nights. */
  occupantsOf: (placeId: string, roomId: string) => Occupant[]
  notices: Map<string, NoticeState>
  whatsApp: boolean
}

export function indexAccommodation(
  data: AccommodationData,
  registrations: Registration[]
): AccommodationIndex {
  const placeById = new Map(data.places.map((p) => [p.id, p]))
  const registrationById = new Map(registrations.map((r) => [r.id, r]))
  const beds = new Map<string, Bed>()
  const rooms = new Map<string, Occupant[]>()

  for (const allotment of data.allotments) {
    const place = placeById.get(allotment.placeId)
    const room = place?.rooms.find((r) => r.id === allotment.roomId)
    const registration = registrationById.get(allotment.registrationId)
    const member = registration?.members.find((m) => m.id === allotment.memberId)
    if (!place || !room || !registration || !member) continue
    beds.set(`${registration.id}:${member.id}`, { place, room, allotment })
    const key = `${place.id}:${room.id}`
    rooms.set(key, [
      ...(rooms.get(key) ?? []),
      { registration, member, nights: nightsOf(member) },
    ])
  }

  return {
    places: data.places,
    placeById,
    registrationById,
    bedOf: (registrationId, memberId) => beds.get(`${registrationId}:${memberId}`),
    occupantsOf: (placeId, roomId) => rooms.get(`${placeId}:${roomId}`) ?? [],
    notices: new Map(data.notices.map((n) => [n.registrationId, n])),
    whatsApp: data.whatsApp,
  }
}

export type StayStatus =
  | "not_needed"
  | "unconfirmed"
  | "to_allot"
  | "partly"
  | "allotted"

export type RegistrationStay = {
  status: StayStatus
  /** People who sleep over at least one night. */
  sleepers: Member[]
  /** Who has a room, and which. */
  allotted: (Bed & { member: Member })[]
  /** Sleepers still without a room. */
  missing: Member[]
  /** Must be sorted out: a room that no longer fits, a registration back to pending. */
  problems: string[]
  /** Worth a look, never blocking: someone who should be on the ground floor and is not. */
  warnings: string[]
}

/** Where a registration stands for accommodation. */
export function stayFor(
  registration: Registration,
  index: AccommodationIndex
): RegistrationStay {
  const sleepers = registration.members.filter((m) => nightsOf(m).length > 0)
  const allotted = registration.members.flatMap((member) => {
    const bed = index.bedOf(registration.id, member.id)
    return bed ? [{ ...bed, member }] : []
  })
  const missing = sleepers.filter(
    (m) => !allotted.some((a) => a.member.id === m.id)
  )

  const problems: string[] = []
  const warnings: string[] = []
  if (allotted.length > 0 && registration.status === "pending") {
    problems.push("Back to pending after a change — confirm it again, then check the rooms still suit")
  }
  for (const a of allotted) {
    if (nightsOf(a.member).length === 0) {
      problems.push(
        `${a.member.fullName} now leaves the day they arrive — take them out of Room ${a.room.label}`
      )
    }
    if (wantsGroundFloor(a.member) && !a.room.groundFloor) {
      warnings.push(
        `${a.member.fullName} ${a.member.needsAssistance ? "needs assistance" : `is ${a.member.age}`} — Room ${a.room.label} is not on the ground floor`
      )
    }
  }
  const rooms = new Map(allotted.map((a) => [`${a.place.id}:${a.room.id}`, a]))
  for (const { place, room } of rooms.values()) {
    const problem = roomProblem(room, index.occupantsOf(place.id, room.id))
    if (problem) problems.push(`${place.name}: ${problem}`)
  }

  const status: StayStatus =
    !registration.accommodationRequired || registration.status === "cancelled"
      ? "not_needed"
      : allotted.length === 0
        ? registration.status === "pending"
          ? "unconfirmed"
          : "to_allot"
        : missing.length > 0
          ? "partly"
          : "allotted"

  return { status, sleepers, allotted, missing, problems, warnings }
}

/** Beds used on each night in one place. */
export function placeNights(place: Place, index: AccommodationIndex) {
  const beds = place.rooms.reduce((sum, room) => sum + room.beds, 0)
  return NIGHTS.map((night) => ({
    night,
    beds,
    used: place.rooms.reduce(
      (sum, room) =>
        sum +
        index
          .occupantsOf(place.id, room.id)
          .filter((o) => o.nights.includes(night)).length,
      0
    ),
  }))
}

/** For each night: people who need a bed, how many have one, and beds in all places. */
export function nightTotals(
  registrations: Registration[],
  index: AccommodationIndex
) {
  const wanting = registrations.filter(
    (r) => r.accommodationRequired && r.status !== "cancelled"
  )
  const perPlace = index.places.map((place) => placeNights(place, index))
  return NIGHTS.map((night, i) => ({
    night,
    needed: wanting
      .flatMap((r) => r.members)
      .filter((m) => nightsOf(m).includes(night)).length,
    allotted: perPlace.reduce((sum, nights) => sum + nights[i].used, 0),
    beds: perPlace.reduce((sum, nights) => sum + nights[i].beds, 0),
  }))
}

/**
 * How a room suits some of a registration's people: what would be wrong if
 * they moved in, and the fewest beds free on any of their nights (not
 * counting their own, if they are in it already).
 */
export function roomFit(
  place: Place,
  room: Room,
  registration: Registration,
  members: Member[],
  index: AccommodationIndex
) {
  const moving = new Set(members.map((m) => m.id))
  const others = index
    .occupantsOf(place.id, room.id)
    .filter((o) => !(o.registration.id === registration.id && moving.has(o.member.id)))
  const incoming = members.map((member) => ({
    registration,
    member,
    nights: nightsOf(member),
  }))
  const nights = NIGHTS.filter((n) => incoming.some((o) => o.nights.includes(n)))
  const free = nights.length
    ? Math.min(
        ...nights.map(
          (n) => room.beds - others.filter((o) => o.nights.includes(n)).length
        )
      )
    : room.beds
  return {
    problem: roomProblem(room, [...others, ...incoming]),
    free,
    others,
  }
}

/** Places in the order to suggest them: where their mandal already is, then the most room. */
export function suggestPlaces(
  registration: Registration,
  members: Member[],
  index: AccommodationIndex
) {
  const nights = NIGHTS.filter((n) => members.some((m) => nightsOf(m).includes(n)))
  return index.places
    .map((place) => {
      const sameMandal = place.rooms
        .flatMap((room) => index.occupantsOf(place.id, room.id))
        .filter(
          (o) =>
            o.registration.mandal === registration.mandal &&
            o.registration.id !== registration.id
        ).length
      const usage = placeNights(place, index).filter((n) => nights.includes(n.night))
      const free = usage.length
        ? Math.min(...usage.map((n) => n.beds - n.used))
        : place.rooms.reduce((sum, r) => sum + r.beds, 0)
      return { place, sameMandal, free }
    })
    .sort(
      (a, b) =>
        b.sameMandal - a.sameMandal ||
        b.free - a.free ||
        a.place.sortOrder - b.place.sortOrder
    )
}

const byLabel = new Intl.Collator("en", { numeric: true }).compare

/** Rooms in number order: 2 before 10. */
export const sortRooms = (rooms: Room[]) =>
  [...rooms].sort((a, b) => byLabel(a.label, b.label))
