import { useFormContext } from "react-hook-form"

import { Checkbox } from "@/components/ui/choice"
import { Badge } from "@/components/ui/primitives"
import { Field, RequiredMark, Textarea } from "@/components/ui/input"
import { TIME_SLOTS, formatStayDate, type TimeSlot } from "@/config/event"
import { formatMobile, toE164 } from "@/lib/phone"

import { GENDERS, REGISTRATION_TYPES, TRAVEL_MODES, type Gender, type TravelMode } from "../types"
import {
  hasSplitDates,
  needsAccommodation,
  vehicleSlots,
  type RegistrationFormValues,
} from "./schema"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5 text-xs/relaxed sm:grid-cols-[8rem_1fr] sm:py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const stayText = (date: string, slot: string) =>
  date && slot
    ? `${formatStayDate(date)}, ${TIME_SLOTS[slot as TimeSlot].split(" (")[0].toLowerCase()}`
    : "—"

/** Step 4: everything on one screen before it is sent. */
export function ReviewStep({ onEditStep }: { onEditStep: (step: number) => void }) {
  const {
    register,
    getValues,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()
  const values = getValues()
  const mode = values.travelMode as TravelMode

  const editButton = (step: number) => (
    <button
      type="button"
      onClick={() => onEditStep(step)}
      className="-mr-2 rounded-md px-2 py-1.5 text-2xs text-primary hover:underline"
    >
      Edit
    </button>
  )

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">Registration</h3>
          {editButton(0)}
        </div>
        <dl className="divide-y divide-border">
          <Row label="Type">{REGISTRATION_TYPES[values.type]}</Row>
          {values.type !== "individual" && <Row label="Name">{values.groupName}</Row>}
          <Row label="Mandal">{values.mandal}</Row>
          <Row label="From">{values.city}</Row>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">
            People ({values.members.length})
          </h3>
          {editButton(1)}
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {values.members.map((member, index) => (
            <li key={index} className="flex flex-col gap-0.5 px-3 py-2.5 sm:py-2">
              <span className="text-xs/relaxed font-medium break-words">
                {member.fullName}
                {index === 0 && (
                  <span className="font-normal text-muted-foreground"> · contact</span>
                )}
                {member.relation && index > 0 && values.type === "family" && (
                  <span className="font-normal text-muted-foreground"> · {member.relation}</span>
                )}
              </span>
              <span className="text-2xs/relaxed text-muted-foreground tabular-nums">
                {GENDERS[member.gender as Gender]} · {member.age} yrs
                {member.mobile &&
                  ` · ${formatMobile(toE164(member.mobileCountry, member.mobile))}`}
                {member.needsAssistance && " · needs assistance"}
                {index === 0 && values.verifiedInPerson && " · verified in person"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">Stay and travel</h3>
          {editButton(2)}
        </div>
        <dl className="divide-y divide-border">
          {!hasSplitDates(values) ? (
            <>
              <Row label="Arriving">{stayText(values.arrivalDate, values.arrivalSlot)}</Row>
              <Row label="Leaving">{stayText(values.departureDate, values.departureSlot)}</Row>
            </>
          ) : (
            values.members.map((member, index) => (
              <Row key={index} label={member.fullName}>
                {stayText(member.arrivalDate, member.arrivalSlot)} →{" "}
                {stayText(member.departureDate, member.departureSlot)}
              </Row>
            ))
          )}
          <Row label="Travel">
            {TRAVEL_MODES[mode]}
            {mode === "personal_vehicle" && (() => {
              const count = vehicleSlots(values)
              const numbers = values.vehicleNumbers
                .slice(0, count)
                .map((number) => (number ?? "").trim().toUpperCase())
                .filter(Boolean)
              return ` · ${count} ${count === 1 ? "vehicle" : "vehicles"}${numbers.length ? ` · ${numbers.join(", ")}` : ""}`
            })()}
            {mode !== "personal_vehicle" && values.travelReference && ` · ${values.travelReference}`}
            {(mode === "train" || mode === "flight") && values.needsPickup && (
              <Badge variant="info" className="ml-2 align-middle">
                Pickup needed
              </Badge>
            )}
            {(mode === "train" || mode === "flight") && values.needsDrop && (
              <Badge variant="info" className="ml-2 align-middle">
                Drop needed
              </Badge>
            )}
          </Row>
          <Row label="Accommodation">
            {needsAccommodation(values) ? (
              <Badge variant="info" className="align-middle">
                Needed
              </Badge>
            ) : (
              "Not needed"
            )}
          </Row>
        </dl>
      </section>

      <Field label="Anything else we should know? (optional)">
        <Textarea
          id="notes"
          placeholder="Food preferences, seva you would like to offer, people you are travelling with…"
          {...register("notes")}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Checkbox
          id="consent"
          label={
            <>
              These details are correct
              <RequiredMark />
            </>
          }
          description="I agree to follow the Mandir's guidelines during the event."
          {...register("consent")}
        />
        {errors.consent && (
          <p className="text-2xs/relaxed text-destructive">
            {errors.consent.message}
          </p>
        )}
      </div>
    </div>
  )
}
