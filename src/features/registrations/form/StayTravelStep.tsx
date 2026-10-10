import * as React from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Checkbox, ChoiceGroup } from "@/components/ui/choice"
import { DigitsInput, Field, Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/select"
import {
  EVENT,
  STAY_DATES,
  TIME_SLOTS,
  formatStayDate,
  type StayDate,
  type TimeSlot,
} from "@/config/event"

import { TravelModeIcon } from "../components"
import { compareStay, isPresentOn, nightsBetween } from "../stay"
import { TRAVEL_MODES, type TravelMode } from "../types"
import {
  hasSplitDates,
  isSameDayVisit,
  maxVehicles,
  vehicleSlots,
  type RegistrationFormValues,
} from "./schema"

const TRAVEL_DESCRIPTIONS: Record<TravelMode, string> = {
  personal_vehicle: "Car or two-wheeler. Parking is on site.",
  mandal_bus: "Bus arranged by your mandal.",
  train: "Arriving at Ahmedabad Junction.",
  flight: "Arriving at Ahmedabad airport.",
  public_bus: "GSRTC or private bus.",
  other: "Anything else.",
}

/** A date select and a time-slot select, side by side. */
function StayPicker({
  prefix,
  label,
  error,
}: {
  prefix:
    | "arrival"
    | "departure"
    | `members.${number}.arrival`
    | `members.${number}.departure`
  label: string
  error?: string
}) {
  const { register } = useFormContext<RegistrationFormValues>()
  const dateName = `${prefix}Date` as const
  const slotName = `${prefix}Slot` as const

  return (
    <Field label={label} required error={error}>
      <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
        <NativeSelect
          id={dateName}
          aria-label={`${label} day`}
          aria-invalid={!!error}
          {...register(dateName)}
        >
          <option value="" disabled>
            Day
          </option>
          {STAY_DATES.map((date) => (
            <option key={date} value={date}>
              {formatStayDate(date)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          id={slotName}
          aria-label={`${label} time`}
          aria-invalid={!!error}
          {...register(slotName)}
        >
          <option value="" disabled>
            Time
          </option>
          {Object.entries(TIME_SLOTS).map(([value, slotLabel]) => (
            <option key={value} value={value}>
              {slotLabel}
            </option>
          ))}
        </NativeSelect>
      </div>
    </Field>
  )
}

/** Step 3: when the party comes and goes, and how they get here. */
export function StayTravelStep() {
  const {
    control,
    register,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()

  const members = watch("members")
  const sameSchedule = watch("sameSchedule")
  const travelMode = watch("travelMode")
  const [registrationType, vehicleCount] = watch(["type", "vehicleCount"])
  // Someone registering alone speaks for themselves: "I need", not "We need".
  const alone = registrationType === "individual"
  const weNeed = alone ? "I need" : "We need"
  const vehicles = vehicleSlots({
    type: registrationType,
    vehicleCount,
    members,
  })
  // No more vehicles than people, at most four: an individual is never asked.
  const vehicleLimit = maxVehicles({ type: registrationType, members })
  const asksVehicleCount = registrationType === "family"

  const vehicleNumberInput = (index: number, label?: string) => (
    <Input
      id={`vehicleNumbers.${index}`}
      placeholder="GJ-05-AB-1234"
      autoComplete="off"
      aria-label={label}
      className="uppercase placeholder:normal-case"
      aria-invalid={!!errors.vehicleNumbers?.[index]}
      {...register(`vehicleNumbers.${index}`)}
    />
  )

  /**
   * One box per vehicle. The list only grows: lowering the count hides the
   * extra boxes but keeps what was typed in them, so raising it again brings
   * the numbers back. Only the boxes on screen are submitted.
   */
  const onVehicleCountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const wanted = vehicleSlots({
      type: getValues("type"),
      vehicleCount: event.target.value,
      members: getValues("members"),
    })
    const numbers = getValues("vehicleNumbers")
    if (numbers.length < wanted) {
      setValue("vehicleNumbers", [
        ...numbers,
        ...Array<string>(wanted - numbers.length).fill(""),
      ])
    }
  }
  const [arrivalDate, arrivalSlot, departureDate, departureSlot] = watch([
    "arrivalDate",
    "arrivalSlot",
    "departureDate",
    "departureSlot",
  ])

  const arrivalError =
    errors.arrivalDate?.message ?? errors.arrivalSlot?.message
  const departureError =
    errors.departureDate?.message ?? errors.departureSlot?.message

  const datesComplete =
    arrivalDate && arrivalSlot && departureDate && departureSlot
  const arrival = {
    date: arrivalDate as StayDate,
    slot: arrivalSlot as TimeSlot,
  }
  const departure = {
    date: departureDate as StayDate,
    slot: departureSlot as TimeSlot,
  }
  const validRange = datesComplete && compareStay(departure, arrival) > 0
  const eventDays = validRange
    ? EVENT.days.filter((day) => isPresentOn({ arrival, departure }, day))
        .length
    : 0

  const split = hasSplitDates({ members, sameSchedule })

  // Nobody stays a night: no bed to ask for, so the box is unticked and off.
  const sameDay = isSameDayVisit({
    members,
    sameSchedule,
    arrivalDate,
    departureDate,
  })
  React.useEffect(() => {
    if (sameDay && getValues("accommodationRequired")) {
      setValue("accommodationRequired", false)
    }
  }, [sameDay, getValues, setValue])

  /**
   * Splitting starts every person on the party's dates, so only the
   * exceptions need editing. Going back to one set of dates starts it from the
   * first person's, so nothing typed is lost.
   */
  const onSameScheduleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const first = getValues("members.0")
      if (!getValues("arrivalDate") && first) {
        setValue("arrivalDate", first.arrivalDate)
        setValue("arrivalSlot", first.arrivalSlot)
        setValue("departureDate", first.departureDate)
        setValue("departureSlot", first.departureSlot)
      }
      return
    }
    getValues("members").forEach((member, index) => {
      if (member.arrivalDate) return
      setValue(`members.${index}.arrivalDate`, getValues("arrivalDate"))
      setValue(`members.${index}.arrivalSlot`, getValues("arrivalSlot"))
      setValue(`members.${index}.departureDate`, getValues("departureDate"))
      setValue(`members.${index}.departureSlot`, getValues("departureSlot"))
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-sm font-medium">Dates</h3>
          <p className="text-xs/relaxed text-muted-foreground">
            The event runs {formatStayDate(EVENT.days[0]).split(" · ")[0]} to{" "}
            {formatStayDate(EVENT.days[EVENT.days.length - 1]).split(" · ")[0]}.
            You can arrive the day before and leave the day after.
          </p>
        </div>

        {/* Above the dates, so ticking it swaps what is below rather than moving itself. */}
        {members.length > 1 && (
          <Checkbox
            id="sameSchedule"
            label="Everyone arrives and leaves together"
            description="Untick if someone in the party comes later or leaves earlier."
            {...register("sameSchedule", { onChange: onSameScheduleChange })}
          />
        )}

        {!split && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <StayPicker
                prefix="arrival"
                label="Arriving"
                error={arrivalError}
              />
              <StayPicker
                prefix="departure"
                label="Leaving"
                error={departureError}
              />
            </div>

            {validRange && (
              <p className="text-xs/relaxed text-muted-foreground tabular-nums">
                {nightsBetween(arrival, departure)} nights · attending{" "}
                {eventDays} of {EVENT.days.length} event days
              </p>
            )}
          </>
        )}

        {split && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            {members.map((member, index) => {
              const memberErrors = errors.members?.[index]
              return (
                <div
                  key={index}
                  className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <p className="text-xs/relaxed font-medium">
                    {member.fullName || `Person ${index + 1}`}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StayPicker
                      prefix={`members.${index}.arrival`}
                      label="Arriving"
                      error={memberErrors?.arrivalDate?.message}
                    />
                    <StayPicker
                      prefix={`members.${index}.departure`}
                      label="Leaving"
                      error={memberErrors?.departureDate?.message}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-heading text-sm font-medium">Travel</h3>
        <Controller
          control={control}
          name="travelMode"
          render={({ field, fieldState }) => (
            <Field
              label="How are you travelling?"
              required
              error={fieldState.error?.message}
            >
              <ChoiceGroup
                name={field.name}
                value={field.value as TravelMode | ""}
                onChange={field.onChange}
                invalid={!!fieldState.error}
                className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                options={(Object.keys(TRAVEL_MODES) as TravelMode[]).map(
                  (mode) => ({
                    value: mode,
                    label: TRAVEL_MODES[mode],
                    description: TRAVEL_DESCRIPTIONS[mode],
                    icon: <TravelModeIcon mode={mode} />,
                  })
                )}
              />
            </Field>
          )}
        />

        {travelMode === "personal_vehicle" && (
          <div className="flex flex-col gap-4">
            {/* One person, one vehicle: only a family is asked how many. */}
            {asksVehicleCount && (
              <Field
                label="Number of vehicles"
                hint={`Up to ${vehicleLimit} for ${members.length} people.`}
                error={errors.vehicleCount?.message}
                className="sm:max-w-48"
              >
                <DigitsInput
                  id="vehicleCount"
                  maxLength={1}
                  aria-invalid={!!errors.vehicleCount}
                  {...register("vehicleCount", {
                    onChange: onVehicleCountChange,
                  })}
                />
              </Field>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs/relaxed font-medium">
                  {vehicles === 1
                    ? "Vehicle number (optional)"
                    : "Vehicle numbers (optional)"}
                </span>
                <span className="text-2xs/relaxed text-muted-foreground">
                  For the parking passes. Leave blank if you do not know them
                  yet.
                </span>
              </div>
              {vehicles === 1 ? (
                // One vehicle: the heading above already names the box.
                <div className="flex flex-col gap-1.5 sm:max-w-sm">
                  {vehicleNumberInput(0, "Vehicle number")}
                  {errors.vehicleNumbers?.[0] && (
                    <p className="text-2xs/relaxed text-destructive">
                      {errors.vehicleNumbers[0].message}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: vehicles }, (_, index) => (
                    <Field
                      key={index}
                      label={`Vehicle ${index + 1}`}
                      error={errors.vehicleNumbers?.[index]?.message}
                    >
                      {vehicleNumberInput(index)}
                    </Field>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {(travelMode === "train" || travelMode === "flight") && (
          <div className="flex flex-col gap-4">
            <Field
              label={
                travelMode === "train"
                  ? "Train number and name (optional)"
                  : "Flight number (optional)"
              }
            >
              <Input
                id="travelReference"
                placeholder={
                  travelMode === "train" ? "12009 Shatabdi Exp" : "6E 2131"
                }
                {...register("travelReference")}
              />
            </Field>
            <Checkbox
              id="needsPickup"
              label={
                travelMode === "train"
                  ? `${weNeed} pickup from Ahmedabad Junction`
                  : `${weNeed} pickup from the airport`
              }
              description={`The transport team will contact ${alone ? "you" : "the primary contact"} a day before.`}
              {...register("needsPickup")}
            />
            <Checkbox
              id="needsDrop"
              label={
                travelMode === "train"
                  ? `${weNeed} a drop to Ahmedabad Junction when leaving`
                  : `${weNeed} a drop to the airport when leaving`
              }
              description="Arranged for the departure day and time above."
              {...register("needsDrop")}
            />
          </div>
        )}

        {(travelMode === "public_bus" || travelMode === "other") && (
          <Field label="Details (optional)">
            <Input
              id="travelReference"
              placeholder={
                travelMode === "public_bus"
                  ? "GSRTC Volvo from Rajkot"
                  : "How are you travelling?"
              }
              {...register("travelReference")}
            />
          </Field>
        )}

        {travelMode === "mandal_bus" && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs/relaxed text-muted-foreground">
            Your mandal coordinator shares the bus timing and pickup point.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-heading text-sm font-medium">Stay</h3>
        <Checkbox
          id="accommodationRequired"
          label={`${weNeed} accommodation from Mandir`}
          description={
            sameDay
              ? "Not needed — you arrive and leave on the same day, so there is no night's stay."
              : "The accommodation team allots rooms or dormitory beds after registration closes."
          }
          disabled={sameDay}
          {...register("accommodationRequired")}
        />
      </section>
    </div>
  )
}
