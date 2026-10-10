import { z } from "zod"

import {
  MANDALS,
  NO_MANDAL,
  STAY_DATES,
  TIME_SLOTS,
  type StayDate,
  type TimeSlot,
} from "@/config/event"

import { DEFAULT_COUNTRY_CODE, fromE164, mobileError, toE164 } from "@/lib/phone"

import { compareStay, hasSplitSchedule } from "../stay"
import {
  GENDERS,
  RELATION_GENDER,
  TRAVEL_MODES,
  type Gender,
  type NewRegistration,
  type Registration,
  type RegistrationType,
  type StayPoint,
  type TravelMode,
} from "../types"

/**
 * The registration form's values and rules.
 *
 * Every field is a plain string or boolean, which is what the inputs produce.
 * Choices that start out unpicked (gender, mandal, travel mode) are strings
 * checked against their list instead of enums, so an empty select shows
 * "Select a gender" rather than a type error. `toNewRegistration` turns the
 * validated values into the real record.
 *
 * Rules that depend on more than one field live in `superRefine`. Zod still
 * runs it when single-field checks fail, so every error on a step appears at
 * once instead of one round at a time.
 */


const isIn = (list: readonly string[]) => (value: string) => list.includes(value)
const STAY_DATE_VALUES: readonly string[] = STAY_DATES
const SLOT_VALUES = Object.keys(TIME_SLOTS)

const memberSchema = z.object({
  // The person's id on a saved registration, sent back so the server keeps
  // it (room allotments point at it). Not shown; missing for someone new.
  key: z.string().optional(),
  fullName: z.string().trim().min(2, "Enter the full name"),
  gender: z.string().refine(isIn(Object.keys(GENDERS)), "Select a gender"),
  age: z
    .string()
    .trim()
    .refine(
      (v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100,
      "Enter an age from 1 to 100"
    ),
  mobileCountry: z.string(),
  // Digits only, without the country code. Checked in superRefine, because
  // the valid length depends on the country picked beside it.
  mobile: z.string().trim(),
  relation: z.string(),
  needsAssistance: z.boolean(),
  assistanceNote: z.string(),
  // Only used when the party does not travel together. Checked in superRefine.
  arrivalDate: z.string(),
  arrivalSlot: z.string(),
  departureDate: z.string(),
  departureSlot: z.string(),
})

export const registrationFormSchema = z
  .object({
    type: z.enum(["individual", "family"]),
    groupName: z.string().trim(),
    mandal: z.string().refine(isIn([...MANDALS, NO_MANDAL]), "Select your mandal"),
    city: z.string().trim().min(2, "Enter the city you are coming from"),
    members: z.array(memberSchema),
    sameSchedule: z.boolean(),
    // The party's dates. Only asked for while everyone travels together —
    // checked in superRefine, since with split dates they are not on screen.
    arrivalDate: z.string(),
    arrivalSlot: z.string(),
    departureDate: z.string(),
    departureSlot: z.string(),
    travelMode: z.string().refine(isIn(Object.keys(TRAVEL_MODES)), "Select how you are travelling"),
    vehicleCount: z.string().trim(),
    // One per vehicle, all optional. Longer than the count when the count
    // was lowered: kept so raising it again brings the numbers back, and
    // trimmed to the count on submit.
    vehicleNumbers: z.array(z.string().optional()),
    travelReference: z.string().trim(),
    needsPickup: z.boolean(),
    needsDrop: z.boolean(),
    accommodationRequired: z.boolean(),
    notes: z.string().trim(),
    consent: z.boolean().refine((v) => v, "Please confirm the details to submit"),
    // Set by MobileVerification once the primary contact's code is right: the
    // number that was verified, and the server's proof of it. Not inputs.
    verifiedMobile: z.string(),
    mobileVerificationToken: z.string(),
    // Ticked by a sanchalak or admin at the desk instead of sending a code.
    verifiedInPerson: z.boolean(),
    // When editing: the contact number already on the registration. Keeping
    // it needs no new verification. Empty for a new registration.
    keptMobile: z.string(),
    // A number found to be another registration's contact already (one
    // registration per number), and that registration's code. Set by
    // MobileVerification; blocks Continue while the number is the same.
    takenMobile: z.string(),
    takenCode: z.string(),
    // The other people of a family while "Individual" is picked, so switching
    // back brings them back. Never submitted, never validated.
    stashedMembers: z.array(z.custom<z.infer<typeof memberSchema>>(() => true)),
  })
  .superRefine((values, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message })

    if (values.type === "family" && values.groupName.length < 2) {
      issue(["groupName"], "Enter a family name, e.g. Patel family")
    }

    if (values.type === "individual" && values.members.length !== 1) {
      issue(["members"], "An individual registration has exactly one person")
    }
    if (values.type === "family" && values.members.length < 2) {
      issue(["members"], "Add at least two people to a family registration")
    }

    // The same person added twice. Compared ignoring case and extra spaces,
    // so "Harit  Patel" and "harit patel" count as one name. Flagged on the
    // later entry, which is the one to remove or correct.
    const firstWithName = new Map<string, number>()
    values.members.forEach((member, index) => {
      const key = member.fullName.trim().replace(/\s+/g, " ").toLowerCase()
      if (key.length < 2) return
      const first = firstWithName.get(key)
      if (first === undefined) {
        firstWithName.set(key, index)
        return
      }
      issue(
        ["members", index, "fullName"],
        first === 0 ? "Already added as the primary contact" : `Already added as person ${first + 1}`
      )
    })

    // A relation that implies a gender has to agree with the gender picked.
    // On the relation field; changing either field re-checks it.
    if (values.type === "family") {
      values.members.forEach((member, index) => {
        const expected = RELATION_GENDER[member.relation as keyof typeof RELATION_GENDER]
        if (index === 0 || !expected || !member.gender || member.gender === expected) return
        issue(
          ["members", index, "relation"],
          `${member.relation} has to be ${GENDERS[expected]} — check the gender or the relation`
        )
      })
    }

    values.members.forEach((member, index) => {
      if (member.mobile === "") {
        if (index === 0) {
          issue(["members", 0, "mobile"], "The primary contact needs a mobile number")
        }
        return
      }
      const error = mobileError(member.mobile, member.mobileCountry)
      if (error) {
        issue(["members", index, "mobile"], error)
        return
      }
      // The primary contact's number has to be verified: by OTP, by a
      // sanchalak or admin in person, or already on the registration being
      // edited. A number changed after verifying needs it again.
      // One registration per contact number.
      if (index === 0 && values.takenMobile && contactMobile(values) === values.takenMobile) {
        issue(["members", 0, "mobile"], `Already registered as ${values.takenCode} — one registration per number`)
        return
      }
      if (index === 0 && !isContactVerified(values)) {
        issue(["members", 0, "mobile"], "Verify this number with the code we send on WhatsApp")
      }
    })

    // A family is looked after by an adult. Someone registering alone may be
    // younger, so this is for families only.
    const contactAge = Number(values.members[0]?.age)
    if (values.type === "family" && contactAge >= 1 && contactAge < MIN_FAMILY_CONTACT_AGE) {
      issue(["members", 0, "age"], `A family's primary contact has to be ${MIN_FAMILY_CONTACT_AGE} or older`)
    }

    if (!hasSplitDates(values)) {
      if (!isIn(STAY_DATE_VALUES)(values.arrivalDate)) issue(["arrivalDate"], "Select the arrival day")
      if (!isIn(SLOT_VALUES)(values.arrivalSlot)) issue(["arrivalSlot"], "Select a time")
      if (!isIn(STAY_DATE_VALUES)(values.departureDate)) issue(["departureDate"], "Select the departure day")
      if (!isIn(SLOT_VALUES)(values.departureSlot)) issue(["departureSlot"], "Select a time")

      const arrival = { date: values.arrivalDate, slot: values.arrivalSlot } as StayPoint
      const departure = { date: values.departureDate, slot: values.departureSlot } as StayPoint
      const datesPicked =
        isIn(STAY_DATE_VALUES)(values.arrivalDate) &&
        isIn(STAY_DATE_VALUES)(values.departureDate) &&
        isIn(SLOT_VALUES)(values.arrivalSlot) &&
        isIn(SLOT_VALUES)(values.departureSlot)
      if (datesPicked && compareStay(departure, arrival) <= 0) {
        issue(["departureDate"], "Departure has to be after arrival")
      }
    } else {
      values.members.forEach((member, index) => {
        const path = ["members", index]
        // Both checked, not one then the other, so every gap shows at once.
        const arrivalPicked =
          isIn(STAY_DATE_VALUES)(member.arrivalDate) && isIn(SLOT_VALUES)(member.arrivalSlot)
        const departurePicked =
          isIn(STAY_DATE_VALUES)(member.departureDate) && isIn(SLOT_VALUES)(member.departureSlot)
        if (!arrivalPicked) issue([...path, "arrivalDate"], "Select arrival")
        if (!departurePicked) issue([...path, "departureDate"], "Select departure")
        if (!arrivalPicked || !departurePicked) return
        const memberArrival = { date: member.arrivalDate, slot: member.arrivalSlot } as StayPoint
        const memberDeparture = { date: member.departureDate, slot: member.departureSlot } as StayPoint
        if (compareStay(memberDeparture, memberArrival) <= 0) {
          issue([...path, "departureDate"], "Departure has to be after arrival")
        }
      })
    }

    if (values.travelMode === "personal_vehicle") {
      // An individual's count is not asked (it is always one), so only a
      // family's is checked: one to four, and no more than there are people.
      const max = maxVehicles(values)
      const count = Number(values.vehicleCount)
      if (
        values.type === "family" &&
        values.vehicleCount !== "" &&
        !(Number.isInteger(count) && count >= 1 && count <= max)
      ) {
        issue(
          ["vehicleCount"],
          max < MAX_VEHICLES.family ? `Enter 1 to ${max} — no more vehicles than people` : `Enter 1 to ${max}`
        )
      }
      // Optional, but a number that is there has to be a real plate, and each
      // vehicle only once.
      const firstWithPlate = new Map<string, number>()
      values.vehicleNumbers.slice(0, vehicleSlots(values)).forEach((number, index) => {
        const value = (number ?? "").trim()
        if (value === "") return
        if (!isVehiclePlate(value)) {
          issue(["vehicleNumbers", index], "Enter a number like GJ-05-AB-1234")
          return
        }
        const first = firstWithPlate.get(normalizePlate(value))
        if (first !== undefined) issue(["vehicleNumbers", index], `Same as vehicle ${first + 1}`)
        else firstWithPlate.set(normalizePlate(value), index)
      })
    }
  })

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>

/**
 * The most vehicles one registration can bring: one person drives one, a
 * family up to four. Mirrors the server's limit (upasana-be src/lib/event.ts).
 */
export const MAX_VEHICLES = { individual: 1, family: 4 } as const

/** A family's primary contact has to be at least this old. Mirrors the server. */
export const MIN_FAMILY_CONTACT_AGE = 18

type VehicleValues = Pick<RegistrationFormValues, "type" | "vehicleCount" | "members">

/** No more vehicles than people: one for an individual, up to four for a family. */
export function maxVehicles(values: Pick<RegistrationFormValues, "type" | "members">) {
  return Math.max(1, Math.min(MAX_VEHICLES[values.type], values.members.length))
}

/**
 * How many vehicles — and vehicle-number boxes — a registration has. Always
 * one for an individual; for a family what "Number of vehicles" says, kept
 * between one and `maxVehicles`, and one while that box is empty or mid-edit.
 */
export function vehicleSlots(values: VehicleValues) {
  const n = Number(values.vehicleCount)
  return Number.isInteger(n) && n >= 1 ? Math.min(n, maxVehicles(values)) : 1
}

/** "gj 05-ab 1234" → "GJ05AB1234": how two plates are compared. */
export const normalizePlate = (plate: string) => plate.toUpperCase().replace(/[\s.-]/g, "")

/**
 * An Indian number plate: state, district, up to three series letters, four
 * digits (GJ-05-AB-1234), or a Bharat series plate (22 BH 1234 AA). Spaces and
 * dashes are optional. Mirrors isVehiclePlate on the server.
 */
export const isVehiclePlate = (plate: string) =>
  /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(normalizePlate(plate)) ||
  /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(normalizePlate(plate))

/** The contact's number as entered, in E.164, or undefined while it is not a valid number. */
export function contactMobile(values: Pick<RegistrationFormValues, "members">) {
  const contact = values.members[0]
  if (!contact?.mobile || mobileError(contact.mobile, contact.mobileCountry)) return undefined
  return toE164(contact.mobileCountry, contact.mobile)
}

/**
 * Whether the contact's number is verified: unchanged from the registration
 * being edited, vouched for in person, or confirmed by an OTP for this very
 * number.
 */
export function isContactVerified(
  values: Pick<
    RegistrationFormValues,
    "members" | "keptMobile" | "verifiedInPerson" | "verifiedMobile" | "mobileVerificationToken"
  >
) {
  const mobile = contactMobile(values)
  if (!mobile) return false
  if (values.keptMobile && mobile === values.keptMobile) return true
  if (values.verifiedInPerson) return true
  return mobile === values.verifiedMobile && !!values.mobileVerificationToken
}

/** Smallest believable age gaps, for the "check the age" hints. */
const RELATION_AGE_GAP: Partial<Record<string, { older: boolean; years: number }>> = {
  Son: { older: false, years: 14 },
  Daughter: { older: false, years: 14 },
  Father: { older: true, years: 14 },
  Mother: { older: true, years: 14 },
  Grandfather: { older: true, years: 30 },
  Grandmother: { older: true, years: 30 },
  Grandchild: { older: false, years: 30 },
}

/**
 * Gentle hints where an age and a relation do not fit — a "Son" older than the
 * contact, a "Father" younger. Usually a typo, so they never block Continue.
 * By person index; only for people whose relation and both ages are filled.
 */
export function relationAgeHints(values: Pick<RegistrationFormValues, "type" | "members">) {
  const hints = new Map<number, string>()
  if (values.type !== "family") return hints
  const contact = values.members[0]
  const contactAge = Number(contact?.age)
  if (!contactAge) return hints
  values.members.forEach((member, index) => {
    const gap = RELATION_AGE_GAP[member.relation]
    const age = Number(member.age)
    if (index === 0 || !gap || !age) return
    const fits = gap.older ? age >= contactAge + gap.years : age <= contactAge - gap.years
    if (fits) return
    const who = contact.fullName.trim().split(/\s+/)[0] || "the primary contact"
    hints.set(
      index,
      gap.older
        ? `Check the age: a ${member.relation.toLowerCase()} is usually at least ${gap.years} years older than ${who} (${contactAge}).`
        : `Check the age: a ${member.relation.toLowerCase()} is usually at least ${gap.years} years younger than ${who} (${contactAge}).`
    )
  })
  return hints
}

const PARTY_DATES = ["arrivalDate", "arrivalSlot", "departureDate", "departureSlot"]

/**
 * Which fields' rules read the field that just changed — passed to
 * `keepErrorsFresh`, so a conflict between two fields shows whichever one was
 * edited last. Keep in step with the cross-field rules in the schema above.
 */
export function relatedFields(changed: string, values: RegistrationFormValues): string[] {
  if (PARTY_DATES.includes(changed)) return PARTY_DATES
  // Adding or removing someone changes how many vehicles are allowed.
  if (changed === "members" || changed === "type") return ["vehicleCount"]
  // Two boxes with one plate: every plate is compared with every other.
  if (/^vehicleNumbers\.\d+$/.test(changed)) {
    return values.vehicleNumbers.map((_, i) => `vehicleNumbers.${i}`)
  }

  const match = /^members\.(\d+)\.(\w+)$/.exec(changed)
  if (!match) return []
  const [, index, field] = match
  const person = `members.${index}`
  switch (field) {
    // "Son" has to be male: either field can make or break it.
    case "gender":
    case "relation":
      return [`${person}.relation`]
    // A day and its time slot, and departure after arrival.
    case "arrivalDate":
    case "arrivalSlot":
    case "departureDate":
    case "departureSlot":
      return [`${person}.arrivalDate`, `${person}.departureDate`]
    // A number's valid length and first digit depend on its country code.
    case "mobileCountry":
      return [`${person}.mobile`]
    // Two people with one name: every name is compared with every other.
    case "fullName":
      return values.members.map((_, i) => `members.${i}.fullName`)
    default:
      return []
  }
}

/**
 * Whether each person has their own dates. Only possible with more than one
 * person: the "everyone together" box is not shown for one, so a lone member
 * left over after unticking it and removing the others is back on the party's
 * dates.
 */
export function hasSplitDates(values: Pick<RegistrationFormValues, "members" | "sameSchedule">) {
  return values.members.length > 1 && !values.sameSchedule
}
export type MemberFormValues = RegistrationFormValues["members"][number]

type DatesValues = Pick<
  RegistrationFormValues,
  "members" | "sameSchedule" | "arrivalDate" | "departureDate"
>

/**
 * Everyone arrives and leaves on the same day, so nobody spends a night and
 * there is no bed to ask for. False until every leaving day is picked.
 */
export function isSameDayVisit(values: DatesValues) {
  const people = hasSplitDates(values)
    ? values.members
    : [{ arrivalDate: values.arrivalDate, departureDate: values.departureDate }]
  return people.every(
    (p) => !!p.arrivalDate && !!p.departureDate && p.departureDate <= p.arrivalDate
  )
}

/** Accommodation as it is saved: never for a same-day visit. */
export function needsAccommodation(
  values: DatesValues & Pick<RegistrationFormValues, "accommodationRequired">
) {
  return values.accommodationRequired && !isSameDayVisit(values)
}

/** The fields each step owns, so Continue validates only what is on screen. */
export const STEP_FIELDS = [
  ["type", "groupName", "mandal", "city"],
  ["members"],
  [
    "arrivalDate",
    "arrivalSlot",
    "departureDate",
    "departureSlot",
    "members",
    "travelMode",
    "vehicleCount",
    "vehicleNumbers",
  ],
  ["consent"],
] as const satisfies readonly (readonly (keyof RegistrationFormValues)[])[]

export function emptyMember(): MemberFormValues {
  return {
    fullName: "",
    gender: "",
    age: "",
    mobileCountry: DEFAULT_COUNTRY_CODE,
    mobile: "",
    relation: "",
    needsAssistance: false,
    assistanceNote: "",
    arrivalDate: "",
    arrivalSlot: "",
    departureDate: "",
    departureSlot: "",
  }
}

export const DEFAULT_VALUES: RegistrationFormValues = {
  type: "individual",
  groupName: "",
  mandal: "",
  city: "",
  members: [emptyMember()],
  sameSchedule: true,
  arrivalDate: "",
  arrivalSlot: "",
  departureDate: "",
  departureSlot: "",
  travelMode: "",
  vehicleCount: "1",
  vehicleNumbers: [""],
  travelReference: "",
  needsPickup: false,
  needsDrop: false,
  accommodationRequired: false,
  notes: "",
  consent: false,
  verifiedMobile: "",
  mobileVerificationToken: "",
  verifiedInPerson: false,
  keptMobile: "",
  takenMobile: "",
  takenCode: "",
  stashedMembers: [],
}

const orUndefined = (value: string) => (value === "" ? undefined : value)

/** Validated form values → the record the API accepts. */
export function toNewRegistration(
  values: RegistrationFormValues,
  source: NewRegistration["source"]
): NewRegistration {
  const arrival: StayPoint = {
    date: values.arrivalDate as StayDate,
    slot: values.arrivalSlot as TimeSlot,
  }
  const departure: StayPoint = {
    date: values.departureDate as StayDate,
    slot: values.departureSlot as TimeSlot,
  }
  const mode = values.travelMode as TravelMode
  const split = hasSplitDates(values)
  const type: RegistrationType = values.type

  const members = values.members.map((member, index) => ({
    // Empty for someone new: the server assigns their id.
    id: member.key ?? "",
    fullName: member.fullName.trim(),
    gender: member.gender as Gender,
    age: Number(member.age),
    mobile: member.mobile ? toE164(member.mobileCountry, member.mobile) : undefined,
    // Optional: left unpicked, it is simply not sent.
    relation: index > 0 && type === "family" ? orUndefined(member.relation) : undefined,
    isPrimary: index === 0,
    needsAssistance: member.needsAssistance,
    assistanceNote: member.needsAssistance
      ? orUndefined(member.assistanceNote.trim())
      : undefined,
    arrival: !split
      ? arrival
      : { date: member.arrivalDate as StayDate, slot: member.arrivalSlot as TimeSlot },
    departure: !split
      ? departure
      : { date: member.departureDate as StayDate, slot: member.departureSlot as TimeSlot },
  }))

  // With split dates, the booking spans from the first person in to the last
  // person out, which is what the accommodation team plans the room around.
  const bookingArrival = !split
    ? arrival
    : members.map((m) => m.arrival).sort(compareStay)[0]
  const bookingDeparture = !split
    ? departure
    : members.map((m) => m.departure).sort(compareStay).at(-1)!

  return {
    type,
    groupName: type === "individual" ? undefined : values.groupName,
    mandal: values.mandal,
    city: values.city,
    members,
    arrival: bookingArrival,
    departure: bookingDeparture,
    travel: {
      mode,
      vehicleCount: mode === "personal_vehicle" ? vehicleSlots(values) : undefined,
      // Only the boxes on screen, without the blank ones.
      vehicleNumbers:
        mode === "personal_vehicle"
          ? values.vehicleNumbers
              .slice(0, vehicleSlots(values))
              .map((number) => (number ?? "").trim().toUpperCase())
              .filter(Boolean)
          : undefined,
      reference: mode === "personal_vehicle" ? undefined : orUndefined(values.travelReference),
      needsPickup: (mode === "train" || mode === "flight") && values.needsPickup,
      needsDrop: (mode === "train" || mode === "flight") && values.needsDrop,
    },
    accommodationRequired: needsAccommodation(values),
    notes: orUndefined(values.notes),
    source,
    // How the contact's number is vouched for. Nothing when an edit keeps it.
    ...contactProof(values),
  }
}

function contactProof(values: RegistrationFormValues) {
  const mobile = contactMobile(values)
  if (values.keptMobile && mobile === values.keptMobile) return {}
  if (values.verifiedInPerson) return { verifiedInPerson: true }
  return { mobileVerificationToken: values.mobileVerificationToken }
}

/**
 * A saved registration as form values, for editing it. The contact's number
 * goes into `keptMobile`, so leaving it alone needs no new verification.
 */
export function fromRegistration(registration: Registration): RegistrationFormValues {
  const split = hasSplitSchedule(registration)
  const members = registration.members.map((member) => {
    const phone = member.mobile ? fromE164(member.mobile) : undefined
    return {
      ...emptyMember(),
      key: member.id,
      fullName: member.fullName,
      gender: member.gender,
      age: String(member.age),
      mobileCountry: phone?.code ?? DEFAULT_COUNTRY_CODE,
      mobile: phone?.national ?? "",
      relation: member.relation ?? "",
      needsAssistance: member.needsAssistance,
      assistanceNote: member.assistanceNote ?? "",
      arrivalDate: split ? member.arrival.date : "",
      arrivalSlot: split ? member.arrival.slot : "",
      departureDate: split ? member.departure.date : "",
      departureSlot: split ? member.departure.slot : "",
    }
  })
  const count = registration.travel.vehicleCount ?? 1
  const numbers = registration.travel.vehicleNumbers ?? []
  return {
    ...DEFAULT_VALUES,
    type: registration.type,
    groupName: registration.groupName ?? "",
    mandal: registration.mandal,
    city: registration.city,
    members,
    sameSchedule: !split,
    arrivalDate: registration.arrival.date,
    arrivalSlot: registration.arrival.slot,
    departureDate: registration.departure.date,
    departureSlot: registration.departure.slot,
    travelMode: registration.travel.mode,
    vehicleCount: String(count),
    vehicleNumbers: [...numbers, ...Array<string>(Math.max(1, count) - numbers.length).fill("")].slice(
      0,
      Math.max(1, count, numbers.length)
    ),
    travelReference: registration.travel.reference ?? "",
    needsPickup: registration.travel.needsPickup,
    needsDrop: registration.travel.needsDrop ?? false,
    accommodationRequired: registration.accommodationRequired,
    notes: registration.notes ?? "",
    keptMobile: registration.members[0]?.mobile ?? "",
  }
}
