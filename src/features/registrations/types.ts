import type { StayDate, TimeSlot } from "@/config/event"
import type { StayNotice } from "@/features/accommodation/paused/types"

/**
 * The registration record, shaped the way the backend will store it.
 *
 * One registration is one booking: a single devotee or a family, with every
 * person in it listed as a member. Members are embedded rather than kept
 * in their own collection because nobody ever looks a member up on their own —
 * staff always find the booking first.
 */

export const REGISTRATION_TYPES = {
  individual: "Individual",
  family: "Family",
} as const
export type RegistrationType = keyof typeof REGISTRATION_TYPES

export const GENDERS = { male: "Male", female: "Female" } as const
export type Gender = keyof typeof GENDERS

export const TRAVEL_MODES = {
  personal_vehicle: "Personal vehicle",
  mandal_bus: "Mandal bus",
  train: "Train",
  flight: "Flight",
  public_bus: "Public bus / ST",
  other: "Other",
  /** Set for local mandals (isLocalMandal), who are not asked. Never offered. */
  local: "Local",
} as const
export type TravelMode = keyof typeof TRAVEL_MODES

export const REGISTRATION_STATUSES = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  cancelled: "Cancelled",
} as const
export type RegistrationStatus = keyof typeof REGISTRATION_STATUSES

/** Relations offered for family members. Free text is still accepted through "Other". */
export const RELATIONS = [
  "Spouse",
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Grandfather",
  "Grandmother",
  "Grandchild",
  "Other",
] as const

/**
 * Relations that fix the person's gender. A "Son" entered as Female is a
 * mistake in one of the two fields; the form flags it. Spouse, Grandchild and
 * Other say nothing about gender. Mirrored in upasana-be src/lib/event.ts.
 */
export const RELATION_GENDER: Partial<
  Record<(typeof RELATIONS)[number], Gender>
> = {
  Son: "male",
  Father: "male",
  Brother: "male",
  Grandfather: "male",
  Daughter: "female",
  Mother: "female",
  Sister: "female",
  Grandmother: "female",
}

export type StayPoint = {
  date: StayDate
  slot: TimeSlot
  /**
   * Whether they take the meal served in that slot (SLOT_MEALS): on arrival,
   * the first meal here; on leaving, the last one before going. Missing on
   * registrations from before it was asked.
   */
  meal?: boolean
}

export type Member = {
  id: string
  fullName: string
  gender: Gender
  age: number
  /**
   * E.164, e.g. "+919876543210". Required for the primary contact, optional
   * for everyone else.
   */
  mobile?: string
  /** Relation to the primary contact. Only meaningful for families. */
  relation?: string
  isPrimary: boolean
  /** Senior, wheelchair, medical condition: anything the hosts should plan around. */
  needsAssistance: boolean
  assistanceNote?: string
  arrival: StayPoint
  departure: StayPoint
  /**
   * Whether this person asked for a bed, so a family can put up only some of
   * its members. Read it through `wantsBed` (stay.ts).
   */
  needsAccommodation?: boolean
  /** Aged 40 or under: whether they will attend the Youth Convention. Absent when not answered. */
  attendsYouthConvention?: boolean
}

export type Travel = {
  mode: TravelMode
  /** Personal vehicle only: how many, and their numbers (optional, may be fewer than the count). */
  vehicleCount?: number
  vehicleNumbers?: string[]
  /** Train or flight number, or the bus operator. */
  reference?: string
  /** Train, bus or flight, with a pickup: when it reaches Ahmedabad, "HH:MM". */
  arrivalTime?: string
  /** Train only: the Ahmedabad station it arrives at. */
  station?: string
  /** Train, public bus or flight: a pickup in Ahmedabad. */
  needsPickup: boolean
  /** Train, bus or flight: a drop to the station, bus stand or airport when leaving. */
  needsDrop?: boolean
  /** With a drop: how they leave, which need not be how they came. */
  departureMode?: "train" | "public_bus" | "flight"
  /** With a drop: the train, bus or flight home, its station (train only), and when it leaves ("HH:MM"). */
  departureReference?: string
  departureStation?: string
  departureTime?: string
}

/** A flight into or out of Ahmedabad airport. */
export type IndiaFlight = {
  /** ISO calendar day, e.g. "2027-01-24". */
  date: string
  /** 24-hour local time, e.g. "06:30", when known. */
  time?: string
  flight?: string
}

/**
 * For devotees from abroad: a pickup from Ahmedabad airport, the only one the
 * transport team covers, and the flight out. Asked on the first step when the
 * mandal is overseas; both optional.
 */
export type IndiaTravel = {
  needsPickup: boolean
  /** The flight they land on; with `needsPickup`. */
  arrival?: IndiaFlight
  /** No longer offered: always false on new registrations. */
  needsDrop: boolean
  /** The flight they leave on, for the record; given or not. */
  departure?: IndiaFlight
}

export type Registration = {
  id: string
  /** Human-facing code printed on the confirmation, e.g. YC-0142. */
  code: string
  type: RegistrationType
  /** "Patel family" or "Surat yuvak mandal". Empty for individuals. */
  groupName?: string
  mandal: string
  members: Member[]
  /**
   * The booking-level dates. Each member also carries their own, which equal
   * these unless someone in the party comes or goes separately.
   */
  arrival: StayPoint
  departure: StayPoint
  travel: Travel
  /** Only for devotees from abroad who filled it in. */
  indiaTravel?: IndiaTravel
  accommodationRequired: boolean
  notes?: string
  status: RegistrationStatus
  /** Who filled the form: the devotee themselves, or staff at the desk. */
  source: "self" | "staff"
  /** One of the made-up demo registrations an admin can load and remove. */
  isSample?: boolean
  createdAt: string
  /** How the contact's number was confirmed; missing on older registrations. */
  mobileVerification?: "otp" | "in_person"
  /** The sanchalak or admin who vouched, for "in_person". */
  verifiedByName?: string
  /** The last change after submitting, and who made it ("the devotee" when edited online). */
  editedAt?: string
  editedByName?: string
  /**
   * Only on a devotee's own registrations (`/registrations/mine`): the room
   * details they were sent, while still right — or `stayChanging` when the
   * rooms changed since and new details are coming. PAUSED 2026-10-11 with
   * per-person allotment: the server no longer sends them.
   */
  stay?: StayNotice
  stayChanging?: boolean
}

/** Just enough to recognise a registration, for "this number is already registered". */
export type RegistrationSummary = {
  /** Missing when the viewer may not open it (another mandal's, for a sanchalak). */
  id?: string
  code: string
  name: string
  people: number
  status: RegistrationStatus
  mandal: string
}

/** What the form submits. The server assigns everything else. */
export type NewRegistration = Omit<
  Registration,
  | "id"
  | "code"
  | "status"
  | "createdAt"
  | "mobileVerification"
  | "verifiedByName"
  | "editedAt"
  | "editedByName"
  | "stay"
  | "stayChanging"
> & {
  /** From verifying the contact's mobile by OTP. Spent by the server, never stored. */
  mobileVerificationToken?: string
  /** A sanchalak or admin vouching for the number at the desk instead. */
  verifiedInPerson?: boolean
}
