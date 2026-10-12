import { z } from "zod"

import {
  MANDALS,
  NO_MANDAL,
  OVERSEAS_MANDALS,
  YOUTH_MAX_AGE,
  isLocalMandal,
  STAY_DATES,
  TIME_SLOTS,
  EVENT,
  formatDay,
  mealOf,
  type StayDate,
  type TimeSlot,
} from "@/config/event"

import { translator, type Lang, type Translate } from "@/i18n/translate"
import {
  DEFAULT_COUNTRY_CODE,
  fromE164,
  mobileError,
  toE164,
} from "@/lib/phone"

import { compareStay, hasSplitSchedule, wantsBed } from "../stay"
import {
  GENDERS,
  RELATION_GENDER,
  TRAVEL_MODES,
  type Gender,
  type NewRegistration,
  type Registration,
  type RegistrationType,
  type IndiaFlight,
  type IndiaTravel,
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

const isIn = (list: readonly string[]) => (value: string) =>
  list.includes(value)
const MEAL_ANSWERS = ["yes", "no"]
/** The travel modes the form offers: all but "local", which is set, not picked. */
export const TRAVEL_CHOICES = (
  Object.keys(TRAVEL_MODES) as TravelMode[]
).filter((mode): mode is Exclude<TravelMode, "local"> => mode !== "local")

/** Whether someone of this age (as typed) is asked about the Youth Convention. */
export const asksYouthConvention = (age: string) =>
  /^\d{1,3}$/.test(age.trim()) && Number(age) <= YOUTH_MAX_AGE

/** "yes" → true, "no" → false, anything else (unanswered) → undefined. */
const yesNoAnswer = (answer: string | undefined) =>
  answer === "yes" ? true : answer === "no" ? false : undefined

/** A flight number in capitals ("6e 2131" → "6E 2131"); anything else as typed. */
const asTyped = (mode: string, reference: string) =>
  mode === "flight" ? reference.toUpperCase() : reference

/**
 * Whether the text has letters from a script other than English's: a name
 * typed in Gujarati or Hindi. Names are kept in English letters only, so the
 * team can search, sort and print them however the form was filled in.
 * Mirrors hasNonLatinLetters on the server.
 */
export const hasNonLatinLetters = (text: string) =>
  /(?!\p{Script=Latin})\p{L}/u.test(text)

/** What a pickup or drop's train, bus or flight is missing, when it is. */
const REFERENCE_REQUIRED: Record<DropMode, string> = {
  train: "Enter the train number and name",
  public_bus: "Enter the bus details",
  flight: "Enter the flight number",
}

/** Whether a pickup and drop in Ahmedabad are offered for this way of travelling. */
export const offersPickup = (mode: string): mode is DropMode =>
  (DROP_MODES as readonly string[]).includes(mode)

/** The ways of leaving a drop is offered for: to a station, bus stand or the airport. */
export const DROP_MODES = ["train", "public_bus", "flight"] as const
export type DropMode = (typeof DROP_MODES)[number]

/** A meal answer as saved: only for a slot with a meal. */
const mealTaken = (slot: string, answer: string) =>
  mealOf(slot) && MEAL_ANSWERS.includes(answer) ? answer === "yes" : undefined
/** A saved meal answer back as the form's "yes", "no" or unanswered. */
const mealAnswer = (point: StayPoint) =>
  point.meal === undefined ? "" : point.meal ? "yes" : "no"
const STAY_DATE_VALUES: readonly string[] = STAY_DATES
const SLOT_VALUES = Object.keys(TIME_SLOTS)

/** A name: at least two characters, in English letters (see hasNonLatinLetters). */
const nameField = (t: Translate, tooShort: string) =>
  z
    .string()
    .trim()
    .min(2, tooShort)
    .refine(
      (v) => !hasNonLatinLetters(v),
      t("Write the name in English letters, e.g. Ramesh Patel")
    )

const makeMemberSchema = (t: Translate) =>
  z.object({
    // The person's id on a saved registration, sent back so the server keeps
    // it (room allotments point at it). Not shown; missing for someone new.
    key: z.string().optional(),
    fullName: nameField(t, t("Enter the full name")),
    gender: z.string().refine(isIn(Object.keys(GENDERS)), t("Select a gender")),
    age: z
      .string()
      .trim()
      .refine(
        (v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100,
        t("Enter an age from 1 to 100")
      ),
    mobileCountry: z.string(),
    // Digits only, without the country code. Checked in superRefine, because
    // the valid length depends on the country picked beside it.
    mobile: z.string().trim(),
    relation: z.string(),
    // No longer asked. Kept so editing an older registration keeps its answer.
    needsAssistance: z.boolean(),
    assistanceNote: z.string(),
    // Only used when the party does not travel together. Checked in superRefine.
    arrivalDate: z.string(),
    arrivalSlot: z.string(),
    departureDate: z.string(),
    departureSlot: z.string(),
    arrivalMeal: z.string(),
    departureMeal: z.string(),
    // Asked per person only when the party does not all need a bed. Optional so
    // a draft saved before it existed still loads.
    needsAccommodation: z.boolean().optional(),
    // Aged YOUTH_MAX_AGE or under: "yes", "no" or unanswered (optional).
    // Optional so a draft saved before it existed still loads.
    youthConvention: z.string().optional(),
  })

/**
 * The schema with its messages in `lang`. RegistrationForm makes one per
 * language; the values and rules are the same in every one.
 */
export function makeRegistrationFormSchema(lang: Lang = "en") {
  const t = translator(lang)
  const memberSchema = makeMemberSchema(t)
  return z
    .object({
      type: z.enum(["individual", "family"]),
      groupName: z.string().trim(),
      mandal: z
        .string()
        .refine(isIn([...MANDALS, NO_MANDAL]), t("Select your mandal")),
      members: z.array(memberSchema),
      sameSchedule: z.boolean(),
      // The party's dates. Only asked for while everyone travels together —
      // checked in superRefine, since with split dates they are not on screen.
      arrivalDate: z.string(),
      arrivalSlot: z.string(),
      departureDate: z.string(),
      departureSlot: z.string(),
      // "yes" or "no" to the meal served in the arrival or departure slot
      // (SLOT_MEALS). Only asked when that slot has one; checked in superRefine.
      arrivalMeal: z.string(),
      departureMeal: z.string(),
      // Not asked of local mandals (isLocalMandal): checked in superRefine.
      travelMode: z.string(),
      vehicleCount: z.string().trim(),
      // One per vehicle, all optional. Longer than the count when the count
      // was lowered: kept so raising it again brings the numbers back, and
      // trimmed to the count on submit.
      vehicleNumbers: z.array(z.string().optional()),
      travelReference: z.string().trim(),
      // Train, bus or flight, with a pickup (and then required): when it reaches
      // Ahmedabad ("HH:MM"); and, for a train, at which station.
      travelTime: z.string(),
      travelStation: z.string().trim(),
      // Train, public bus or flight: "yes" or "no", required, unanswered until picked.
      // The journey's details are asked, and sent, only after a "yes".
      needsPickup: z.string(),
      needsDrop: z.boolean(),
      // Train, bus or flight, with a drop (and then required): the journey home, as for
      // the one in.
      // "train", "public_bus" or "flight": how they leave, which need not be how
      // they came.
      dropMode: z.string(),
      dropReference: z.string().trim(),
      dropStation: z.string().trim(),
      dropTime: z.string(),
      accommodationRequired: z.boolean(),
      notes: z.string().trim(),
      consent: z
        .boolean()
        .refine((v) => v, t("Please confirm the details to submit")),
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
      stashedMembers: z.array(
        z.custom<z.infer<ReturnType<typeof makeMemberSchema>>>(() => true)
      ),
      // From abroad (see `isOverseas`): a pickup from Ahmedabad airport,
      // optional, and the flight out, for the record only — no drop is
      // arranged. A flight is its day, time and number; the day is needed once
      // the pickup is ticked or anything about the flight out is given. A date
      // is "YYYY-MM-DD" and a time "HH:MM". The landing flight is kept but not
      // sent while hidden or unticked.
      indiaNeedsPickup: z.boolean(),
      indiaArrivalDate: z.string(),
      indiaArrivalTime: z.string(),
      indiaArrivalFlight: z.string(),
      indiaDepartureDate: z.string(),
      indiaDepartureTime: z.string(),
      indiaDepartureFlight: z.string(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: "custom", path, message })
      // Arriving or leaving in a slot with a meal: "will you take it?" needs an answer.
      const checkMeal = (
        path: (string | number)[],
        slot: string,
        answer: string
      ) => {
        if (mealOf(slot) && !MEAL_ANSWERS.includes(answer))
          issue(path, t("Choose yes or no"))
      }

      if (values.type === "family" && values.groupName.length < 2) {
        issue(["groupName"], t("Enter a family name, e.g. Patel family"))
      } else if (
        values.type === "family" &&
        hasNonLatinLetters(values.groupName)
      ) {
        issue(
          ["groupName"],
          t("Write the family name in English letters, e.g. Patel family")
        )
      }

      if (values.type === "individual" && values.members.length !== 1) {
        issue(
          ["members"],
          t("An individual registration has exactly one person")
        )
      }
      if (values.type === "family" && values.members.length < 2) {
        issue(
          ["members"],
          t("Add at least two people to a family registration")
        )
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
          first === 0
            ? t("Already added as the primary contact")
            : t("Already added as person {n}", { n: first + 1 })
        )
      })

      // A relation that implies a gender has to agree with the gender picked.
      // On the relation field; changing either field re-checks it.
      if (values.type === "family") {
        values.members.forEach((member, index) => {
          const expected =
            RELATION_GENDER[member.relation as keyof typeof RELATION_GENDER]
          if (
            index === 0 ||
            !expected ||
            !member.gender ||
            member.gender === expected
          )
            return
          issue(
            ["members", index, "relation"],
            t(
              "{relation} has to be {gender} — check the gender or the relation",
              {
                relation: t(member.relation),
                gender: t(GENDERS[expected]),
              }
            )
          )
        })
      }

      values.members.forEach((member, index) => {
        if (member.mobile === "") {
          if (index === 0) {
            issue(
              ["members", 0, "mobile"],
              t("The primary contact needs a mobile number")
            )
          }
          return
        }
        const error = mobileError(member.mobile, member.mobileCountry, t)
        if (error) {
          issue(["members", index, "mobile"], error)
          return
        }
        // The primary contact's number has to be verified: by OTP, by a
        // sanchalak or admin in person, or already on the registration being
        // edited. A number changed after verifying needs it again.
        // One registration per contact number.
        if (
          index === 0 &&
          values.takenMobile &&
          contactMobile(values) === values.takenMobile
        ) {
          issue(
            ["members", 0, "mobile"],
            t("Already registered as {code} — one registration per number", {
              code: values.takenCode,
            })
          )
          return
        }
        if (index === 0 && !isContactVerified(values)) {
          issue(
            ["members", 0, "mobile"],
            t("Verify this number with the code we send on WhatsApp")
          )
        }
      })

      // A family is looked after by an adult. Someone registering alone may be
      // younger, so this is for families only.
      const contactAge = Number(values.members[0]?.age)
      if (
        values.type === "family" &&
        contactAge >= 1 &&
        contactAge < MIN_FAMILY_CONTACT_AGE
      ) {
        issue(
          ["members", 0, "age"],
          t("A family's primary contact has to be {age} or older", {
            age: MIN_FAMILY_CONTACT_AGE,
          })
        )
      }

      if (!hasSplitDates(values)) {
        if (!isIn(STAY_DATE_VALUES)(values.arrivalDate))
          issue(["arrivalDate"], t("Select the arrival day"))
        if (!isIn(SLOT_VALUES)(values.arrivalSlot))
          issue(["arrivalSlot"], t("Select a time"))
        if (!isIn(STAY_DATE_VALUES)(values.departureDate))
          issue(["departureDate"], t("Select the departure day"))
        if (!isIn(SLOT_VALUES)(values.departureSlot))
          issue(["departureSlot"], t("Select a time"))
        checkMeal(["arrivalMeal"], values.arrivalSlot, values.arrivalMeal)
        checkMeal(["departureMeal"], values.departureSlot, values.departureMeal)

        const arrival = {
          date: values.arrivalDate,
          slot: values.arrivalSlot,
        } as StayPoint
        const departure = {
          date: values.departureDate,
          slot: values.departureSlot,
        } as StayPoint
        const datesPicked =
          isIn(STAY_DATE_VALUES)(values.arrivalDate) &&
          isIn(STAY_DATE_VALUES)(values.departureDate) &&
          isIn(SLOT_VALUES)(values.arrivalSlot) &&
          isIn(SLOT_VALUES)(values.departureSlot)
        if (datesPicked && compareStay(departure, arrival) <= 0) {
          issue(["departureDate"], t("Departure has to be after arrival"))
        }
      } else {
        values.members.forEach((member, index) => {
          const path = ["members", index]
          checkMeal(
            [...path, "arrivalMeal"],
            member.arrivalSlot,
            member.arrivalMeal
          )
          checkMeal(
            [...path, "departureMeal"],
            member.departureSlot,
            member.departureMeal
          )
          // Both checked, not one then the other, so every gap shows at once.
          const arrivalPicked =
            isIn(STAY_DATE_VALUES)(member.arrivalDate) &&
            isIn(SLOT_VALUES)(member.arrivalSlot)
          const departurePicked =
            isIn(STAY_DATE_VALUES)(member.departureDate) &&
            isIn(SLOT_VALUES)(member.departureSlot)
          if (!arrivalPicked)
            issue([...path, "arrivalDate"], t("Select arrival"))
          if (!departurePicked)
            issue([...path, "departureDate"], t("Select departure"))
          if (!arrivalPicked || !departurePicked) return
          const memberArrival = {
            date: member.arrivalDate,
            slot: member.arrivalSlot,
          } as StayPoint
          const memberDeparture = {
            date: member.departureDate,
            slot: member.departureSlot,
          } as StayPoint
          if (compareStay(memberDeparture, memberArrival) <= 0) {
            issue(
              [...path, "departureDate"],
              t("Departure has to be after arrival")
            )
          }
        })
      }

      // The airport pickup and drop are asked on step 1, before the event
      // dates: there a flight only has to fall within reach of the event. Step 3
      // then keeps the event dates between landing and flying out, on the date
      // fields shown there.
      if (isOverseas(values)) {
        const landing = values.indiaNeedsPickup ? values.indiaArrivalDate : ""
        const leaving = values.indiaDepartureDate
        const firstDay = EVENT.days[0]
        const lastDay = EVENT.days[EVENT.days.length - 1]
        if (values.indiaNeedsPickup && !landing) {
          issue(["indiaArrivalDate"], t("Pick the day you land"))
        }
        if (
          !leaving &&
          (values.indiaDepartureTime || values.indiaDepartureFlight.trim())
        ) {
          issue(["indiaDepartureDate"], t("Pick the day you fly out"))
        }
        if (landing && landing > lastDay) {
          issue(
            ["indiaArrivalDate"],
            t("The event ends on {date} — land on or before then", {
              date: formatDay(lastDay, lang),
            })
          )
        }
        if (leaving && leaving < firstDay) {
          issue(
            ["indiaDepartureDate"],
            t("The event starts on {date} — fly out on or after then", {
              date: formatDay(firstDay, lang),
            })
          )
        } else if (leaving && landing && leaving < landing) {
          issue(["indiaDepartureDate"], t("Has to be after you land"))
        }

        const people = hasSplitDates(values)
          ? values.members.map((m, i) => ({ ...m, path: ["members", i] }))
          : [{ ...values, path: [] as (string | number)[] }]
        for (const person of people) {
          if (landing && person.arrivalDate && person.arrivalDate < landing) {
            issue(
              [...person.path, "arrivalDate"],
              t("You land in India on {date} — arrive on or after then", {
                date: formatDay(landing, lang),
              })
            )
          }
          if (
            leaving &&
            person.departureDate &&
            person.departureDate > leaving
          ) {
            issue(
              [...person.path, "departureDate"],
              t(
                "Your flight out of India is on {date} — leave on or before then",
                { date: formatDay(leaving, lang) }
              )
            )
          }
        }
      }

      // Locals are not asked how they travel; everyone else picks one of the
      // modes on offer ("local" is set for them, never picked).
      if (
        !isLocalMandal(values.mandal) &&
        !isIn(TRAVEL_CHOICES)(values.travelMode)
      ) {
        issue(["travelMode"], t("Select how you are travelling"))
      }
      if (
        !isLocalMandal(values.mandal) &&
        offersPickup(values.travelMode) &&
        !isIn(MEAL_ANSWERS)(values.needsPickup)
      ) {
        issue(["needsPickup"], t("Select Yes or No"))
      }
      // A pickup or a drop needs its journey: the train's number, station and
      // time; the bus's details and time; or the flight number and time.
      if (!isLocalMandal(values.mandal) && offersPickup(values.travelMode)) {
        // A drop is offered only with a pickup.
        const drop = values.needsPickup === "yes" && values.needsDrop
        if (drop && !offersPickup(values.dropMode)) {
          issue(["dropMode"], t("Select how you are leaving"))
        }
        const legs = [
          {
            wanted: values.needsPickup === "yes",
            mode: values.travelMode,
            fields: ["travelReference", "travelStation", "travelTime"] as const,
            timeMessage: t("Pick the arrival time"),
          },
          {
            // Leaving may be by another way than arriving: its own mode.
            wanted: drop && offersPickup(values.dropMode),
            mode: values.dropMode,
            fields: ["dropReference", "dropStation", "dropTime"] as const,
            timeMessage: t("Pick the departure time"),
          },
        ]
        for (const { wanted, mode, fields, timeMessage } of legs) {
          if (!wanted) continue
          const train = mode === "train"
          const [reference, station, time] = fields
          if (!values[reference].trim()) {
            issue([reference], t(REFERENCE_REQUIRED[mode as DropMode]))
          }
          if (train && !values[station]) issue([station], t("Pick the station"))
          if (!values[time]) issue([time], timeMessage)
        }
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
            max < MAX_VEHICLES.family
              ? t("Enter 1 to {max} — no more vehicles than people", { max })
              : t("Enter 1 to {max}", { max })
          )
        }
        // Optional, but a number that is there has to be a real plate, and each
        // vehicle only once.
        const firstWithPlate = new Map<string, number>()
        values.vehicleNumbers
          .slice(0, vehicleSlots(values))
          .forEach((number, index) => {
            const value = (number ?? "").trim()
            if (value === "") return
            if (!isVehiclePlate(value)) {
              issue(
                ["vehicleNumbers", index],
                t("Enter a number like GJ-05-AB-1234")
              )
              return
            }
            const first = firstWithPlate.get(normalizePlate(value))
            if (first !== undefined)
              issue(
                ["vehicleNumbers", index],
                t("Same as vehicle {n}", { n: first + 1 })
              )
            else firstWithPlate.set(normalizePlate(value), index)
          })
      }
    })
}

/** The schema in English: its messages for the desk, its shape for the types. */
export const registrationFormSchema = makeRegistrationFormSchema()

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>

/**
 * The most vehicles one registration can bring: one person drives one, a
 * family up to four. Mirrors the server's limit (upasana-be src/lib/event.ts).
 */
export const MAX_VEHICLES = { individual: 1, family: 4 } as const

/** A family's primary contact has to be at least this old. Mirrors the server. */
export const MIN_FAMILY_CONTACT_AGE = 18

type VehicleValues = Pick<
  RegistrationFormValues,
  "type" | "vehicleCount" | "members"
>

/** No more vehicles than people: one for an individual, up to four for a family. */
export function maxVehicles(
  values: Pick<RegistrationFormValues, "type" | "members">
) {
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
export const normalizePlate = (plate: string) =>
  plate.toUpperCase().replace(/[\s.-]/g, "")

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
  if (!contact?.mobile || mobileError(contact.mobile, contact.mobileCountry))
    return undefined
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
    | "members"
    | "keptMobile"
    | "verifiedInPerson"
    | "verifiedMobile"
    | "mobileVerificationToken"
  >
) {
  const mobile = contactMobile(values)
  if (!mobile) return false
  if (values.keptMobile && mobile === values.keptMobile) return true
  if (values.verifiedInPerson) return true
  return mobile === values.verifiedMobile && !!values.mobileVerificationToken
}

/**
 * Whether the form asks about landing in India: the mandal is abroad. Asked
 * on the first step, right after the mandal is picked.
 */
export function isOverseas(values: Pick<RegistrationFormValues, "mandal">) {
  return OVERSEAS_MANDALS.includes(values.mandal)
}

/** A flight as saved: only the parts given. */
const indiaFlight = (
  date: string,
  time: string,
  flight: string
): IndiaFlight => ({
  date,
  time: orUndefined(time),
  flight: orUndefined(flight.trim().toUpperCase()),
})

/**
 * The airport pickup and flight out as saved: only for someone from abroad
 * who ticked the pickup or gave the day they fly out.
 */
export function indiaTravelOf(
  values: RegistrationFormValues
): IndiaTravel | undefined {
  const { indiaNeedsPickup: needsPickup, indiaDepartureDate: leaving } = values
  if (!isOverseas(values) || (!needsPickup && !leaving)) return undefined
  return {
    needsPickup,
    // No drop is arranged any more; the flight out is for the record.
    needsDrop: false,
    arrival: needsPickup
      ? indiaFlight(
          values.indiaArrivalDate,
          values.indiaArrivalTime,
          values.indiaArrivalFlight
        )
      : undefined,
    departure: leaving
      ? indiaFlight(
          values.indiaDepartureDate,
          values.indiaDepartureTime,
          values.indiaDepartureFlight
        )
      : undefined,
  }
}

/** Smallest believable age gaps, for the "check the age" hints. */
const RELATION_AGE_GAP: Partial<
  Record<string, { older: boolean; years: number }>
> = {
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
export function relationAgeHints(
  values: Pick<RegistrationFormValues, "type" | "members">,
  t: Translate
) {
  const hints = new Map<number, string>()
  if (values.type !== "family") return hints
  const contact = values.members[0]
  const contactAge = Number(contact?.age)
  if (!contactAge) return hints
  values.members.forEach((member, index) => {
    const gap = RELATION_AGE_GAP[member.relation]
    const age = Number(member.age)
    if (index === 0 || !gap || !age) return
    const fits = gap.older
      ? age >= contactAge + gap.years
      : age <= contactAge - gap.years
    if (fits) return
    const who =
      contact.fullName.trim().split(/\s+/)[0] || t("the primary contact")
    const vars = {
      relation: t(member.relation).toLowerCase(),
      years: gap.years,
      who,
      age: contactAge,
    }
    hints.set(
      index,
      gap.older
        ? t(
            "Check the age: a {relation} is usually at least {years} years older than {who} ({age}).",
            vars
          )
        : t(
            "Check the age: a {relation} is usually at least {years} years younger than {who} ({age}).",
            vars
          )
    )
  })
  return hints
}

const PARTY_DATES = [
  "arrivalDate",
  "arrivalSlot",
  "departureDate",
  "departureSlot",
]

/**
 * Which fields' rules read the field that just changed — passed to
 * `keepErrorsFresh`, so a conflict between two fields shows whichever one was
 * edited last. Keep in step with the cross-field rules in the schema above.
 */
export function relatedFields(
  changed: string,
  values: RegistrationFormValues
): string[] {
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
export function hasSplitDates(
  values: Pick<RegistrationFormValues, "members" | "sameSchedule">
) {
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
    (p) =>
      !!p.arrivalDate && !!p.departureDate && p.departureDate <= p.arrivalDate
  )
}

/**
 * This person leaves the day they arrive, so there is no night to give them
 * a bed for. False until both their days are picked.
 */
export function isSameDayFor(values: DatesValues, index: number) {
  const p = hasSplitDates(values) ? values.members[index] : values
  return (
    !!p?.arrivalDate && !!p.departureDate && p.departureDate <= p.arrivalDate
  )
}

type AccommodationValues = DatesValues &
  Pick<RegistrationFormValues, "accommodationRequired" | "mandal">

/**
 * Whether the form asks for "everyone" at once. `accommodationRequired` is
 * that box; with one person it is simply their answer.
 */
export const accommodationPerPerson = (values: AccommodationValues) =>
  values.members.length > 1 && !values.accommodationRequired

/**
 * For each person, whether they get a bed as the form stands: everyone when
 * the box for everyone is ticked, otherwise each person's own tick. Never
 * someone with no night here.
 */
export function bedsWanted(values: AccommodationValues) {
  // Locals go home at night: they are not asked, and get no bed.
  if (isLocalMandal(values.mandal)) return values.members.map(() => false)
  const perPerson = accommodationPerPerson(values)
  return values.members.map(
    (member, index) =>
      (perPerson
        ? !!member.needsAccommodation
        : values.accommodationRequired) && !isSameDayFor(values, index)
  )
}

/** Accommodation as it is saved: anyone in the party has a bed coming. */
export function needsAccommodation(values: AccommodationValues) {
  return bedsWanted(values).some(Boolean)
}

/** The fields each step owns, so Continue validates only what is on screen. */
export const STEP_FIELDS = [
  ["type", "groupName", "mandal", "indiaArrivalDate", "indiaDepartureDate"],
  ["members"],
  [
    "arrivalDate",
    "arrivalSlot",
    "departureDate",
    "departureSlot",
    "arrivalMeal",
    "departureMeal",
    "members",
    "travelMode",
    "needsPickup",
    "travelReference",
    "travelStation",
    "travelTime",
    "needsDrop",
    "dropMode",
    "dropReference",
    "dropStation",
    "dropTime",
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
    youthConvention: "",
    arrivalDate: "",
    arrivalSlot: "",
    departureDate: "",
    departureSlot: "",
    arrivalMeal: "",
    departureMeal: "",
    needsAccommodation: false,
  }
}

export const DEFAULT_VALUES: RegistrationFormValues = {
  type: "individual",
  groupName: "",
  mandal: "",
  members: [emptyMember()],
  sameSchedule: true,
  arrivalDate: "",
  arrivalSlot: "",
  departureDate: "",
  departureSlot: "",
  arrivalMeal: "",
  departureMeal: "",
  travelMode: "",
  vehicleCount: "1",
  vehicleNumbers: [""],
  travelReference: "",
  travelTime: "",
  travelStation: "",
  needsPickup: "",
  needsDrop: false,
  dropMode: "",
  dropReference: "",
  dropStation: "",
  dropTime: "",
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
  indiaNeedsPickup: false,
  indiaArrivalDate: "",
  indiaArrivalTime: "",
  indiaArrivalFlight: "",
  indiaDepartureDate: "",
  indiaDepartureTime: "",
  indiaDepartureFlight: "",
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
    meal: mealTaken(values.arrivalSlot, values.arrivalMeal),
  }
  const departure: StayPoint = {
    date: values.departureDate as StayDate,
    slot: values.departureSlot as TimeSlot,
    meal: mealTaken(values.departureSlot, values.departureMeal),
  }
  // Locals are not asked: they travel from home.
  const mode: TravelMode = isLocalMandal(values.mandal)
    ? "local"
    : (values.travelMode as TravelMode)
  const split = hasSplitDates(values)
  const pickup = offersPickup(mode) && values.needsPickup === "yes"
  // A drop is offered only with a pickup.
  const drop = pickup && values.needsDrop
  const type: RegistrationType = values.type

  const beds = bedsWanted(values)
  const members = values.members.map((member, index) => ({
    needsAccommodation: beds[index],
    // Empty for someone new: the server assigns their id.
    id: member.key ?? "",
    fullName: member.fullName.trim(),
    gender: member.gender as Gender,
    age: Number(member.age),
    mobile: member.mobile
      ? toE164(member.mobileCountry, member.mobile)
      : undefined,
    // Optional: left unpicked, it is simply not sent.
    relation:
      index > 0 && type === "family" ? orUndefined(member.relation) : undefined,
    isPrimary: index === 0,
    needsAssistance: member.needsAssistance,
    assistanceNote: member.needsAssistance
      ? orUndefined(member.assistanceNote.trim())
      : undefined,
    attendsYouthConvention: asksYouthConvention(member.age)
      ? yesNoAnswer(member.youthConvention)
      : undefined,
    arrival: !split
      ? arrival
      : {
          date: member.arrivalDate as StayDate,
          slot: member.arrivalSlot as TimeSlot,
          meal: mealTaken(member.arrivalSlot, member.arrivalMeal),
        },
    departure: !split
      ? departure
      : {
          date: member.departureDate as StayDate,
          slot: member.departureSlot as TimeSlot,
          meal: mealTaken(member.departureSlot, member.departureMeal),
        },
  }))

  // With split dates, the booking spans from the first person in to the last
  // person out, which is what the accommodation team plans the room around.
  const bookingArrival = !split
    ? arrival
    : members.map((m) => m.arrival).sort(compareStay)[0]
  const bookingDeparture = !split
    ? departure
    : members
        .map((m) => m.departure)
        .sort(compareStay)
        .at(-1)!

  return {
    type,
    groupName: type === "individual" ? undefined : values.groupName,
    mandal: values.mandal,
    members,
    arrival: bookingArrival,
    departure: bookingDeparture,
    travel: {
      mode,
      vehicleCount:
        mode === "personal_vehicle" ? vehicleSlots(values) : undefined,
      // Only the boxes on screen, without the blank ones.
      vehicleNumbers:
        mode === "personal_vehicle"
          ? values.vehicleNumbers
              .slice(0, vehicleSlots(values))
              .map((number) => (number ?? "").trim().toUpperCase())
              .filter(Boolean)
          : undefined,
      // By train, bus or flight, the details are asked only with a pickup.
      reference:
        mode === "personal_vehicle" ||
        mode === "local" ||
        (offersPickup(mode) && !pickup)
          ? undefined
          : orUndefined(asTyped(mode, values.travelReference)),
      arrivalTime: pickup ? orUndefined(values.travelTime) : undefined,
      station:
        mode === "train" && pickup
          ? orUndefined(values.travelStation)
          : undefined,
      needsPickup: pickup,
      needsDrop: drop,
      departureMode:
        drop && offersPickup(values.dropMode) ? values.dropMode : undefined,
      departureReference: drop
        ? orUndefined(asTyped(values.dropMode, values.dropReference))
        : undefined,
      departureStation:
        drop && values.dropMode === "train"
          ? orUndefined(values.dropStation)
          : undefined,
      departureTime: drop ? orUndefined(values.dropTime) : undefined,
    },
    accommodationRequired: beds.some(Boolean),
    indiaTravel: indiaTravelOf(values),
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
export function fromRegistration(
  registration: Registration
): RegistrationFormValues {
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
      youthConvention:
        member.attendsYouthConvention == null
          ? ""
          : member.attendsYouthConvention
            ? "yes"
            : "no",
      arrivalDate: split ? member.arrival.date : "",
      arrivalSlot: split ? member.arrival.slot : "",
      departureDate: split ? member.departure.date : "",
      departureSlot: split ? member.departure.slot : "",
      arrivalMeal: split ? mealAnswer(member.arrival) : "",
      departureMeal: split ? mealAnswer(member.departure) : "",
      needsAccommodation: wantsBed(registration, member),
    }
  })
  // "Everyone" stays ticked only when everyone who stays a night has a bed; a
  // party where only some do opens on the per-person ticks.
  const everyone = registration.members.every(
    (m, i) =>
      members[i].needsAccommodation || m.departure.date <= m.arrival.date
  )
  const count = registration.travel.vehicleCount ?? 1
  const numbers = registration.travel.vehicleNumbers ?? []
  return {
    ...DEFAULT_VALUES,
    type: registration.type,
    groupName: registration.groupName ?? "",
    mandal: registration.mandal,
    members,
    sameSchedule: !split,
    arrivalDate: registration.arrival.date,
    arrivalSlot: registration.arrival.slot,
    departureDate: registration.departure.date,
    departureSlot: registration.departure.slot,
    arrivalMeal: mealAnswer(registration.arrival),
    departureMeal: mealAnswer(registration.departure),
    travelMode: registration.travel.mode,
    vehicleCount: String(count),
    vehicleNumbers: [
      ...numbers,
      ...Array<string>(Math.max(1, count) - numbers.length).fill(""),
    ].slice(0, Math.max(1, count, numbers.length)),
    travelReference: registration.travel.reference ?? "",
    travelTime: registration.travel.arrivalTime ?? "",
    travelStation: registration.travel.station ?? "",
    needsPickup: offersPickup(registration.travel.mode)
      ? registration.travel.needsPickup
        ? "yes"
        : "no"
      : "",
    needsDrop: registration.travel.needsDrop ?? false,
    // Before it was asked, leaving was the way they came.
    dropMode:
      registration.travel.departureMode ??
      (registration.travel.needsDrop && offersPickup(registration.travel.mode)
        ? registration.travel.mode
        : ""),
    dropReference: registration.travel.departureReference ?? "",
    dropStation: registration.travel.departureStation ?? "",
    dropTime: registration.travel.departureTime ?? "",
    accommodationRequired: registration.accommodationRequired && everyone,
    ...fromIndiaTravel(registration.indiaTravel),
    notes: registration.notes ?? "",
    keptMobile: registration.members[0]?.mobile ?? "",
  }
}

/** A saved airport pickup and flight out back as form values. */
function fromIndiaTravel(india?: IndiaTravel) {
  return {
    indiaNeedsPickup: india?.needsPickup ?? false,
    indiaArrivalDate: india?.arrival?.date ?? "",
    indiaArrivalTime: india?.arrival?.time ?? "",
    indiaArrivalFlight: india?.arrival?.flight ?? "",
    indiaDepartureDate: india?.departure?.date ?? "",
    indiaDepartureTime: india?.departure?.time ?? "",
    indiaDepartureFlight: india?.departure?.flight ?? "",
  }
}
