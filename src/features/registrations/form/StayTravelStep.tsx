import * as React from "react"
import {
  RiCheckLine,
  RiCheckboxCircleFill,
  RiEraserLine,
  RiFileCopyLine,
  RiHotelBedLine,
} from "@remixicon/react"
import { cn } from "cn"
import { Controller, get, useFormContext } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox, ChoiceGroup } from "@/components/ui/choice"
import { DigitsInput, Field, Input, RequiredMark } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/select"
import {
  EVENT,
  STAY_DATES,
  TIME_SLOTS,
  formatStayDate,
  isLocalMandal,
  mealOf,
  type StayDate,
  type TimeSlot,
} from "@/config/event"

import { TravelModeIcon } from "../components"
import { compareStay, isPresentOn, nightsBetween } from "../stay"
import { TRAVEL_MODES, type TravelMode } from "../types"
import {
  hasSplitDates,
  isSameDayFor,
  isSameDayVisit,
  maxVehicles,
  TRAVEL_CHOICES,
  vehicleSlots,
  type RegistrationFormValues,
} from "./schema"

const TRAVEL_DESCRIPTIONS: Record<Exclude<TravelMode, "local">, string> = {
  personal_vehicle: "Car or two-wheeler. Parking is on site.",
  mandal_bus: "Bus arranged by your mandal.",
  train: "Arriving at Ahmedabad Junction.",
  flight: "Arriving at Ahmedabad airport.",
  public_bus: "GSRTC or private bus.",
  other: "Anything else.",
}

/**
 * "Will you take breakfast?" for someone arriving or leaving in a slot with a
 * meal, so the kitchen can count. Required: Yes or No, each a pill with a
 * tick box.
 */
function MealQuestion({
  name,
  meal,
}: {
  name:
    | "arrivalMeal"
    | "departureMeal"
    | `members.${number}.arrivalMeal`
    | `members.${number}.departureMeal`
  meal: string
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()
  const error: string | undefined = get(errors, name)?.message
  const picked = watch(name)

  return (
    <div className="flex flex-col gap-1">
      <div
        role="radiogroup"
        aria-label={`Will you take ${meal}?`}
        aria-invalid={!!error || undefined}
        // Always two rows — the question, then Yes and No under it — so the
        // arriving and leaving boxes look the same whatever the meal's name.
        className="flex flex-col items-start gap-1.5 rounded-md bg-muted/60 px-3 py-2"
      >
        <span className="text-xs/relaxed">
          Will you take {meal}?
          <RequiredMark />
        </span>
        <div className="flex gap-1">
          {(["yes", "no"] as const).map((answer) => {
            const checked = picked === answer
            return (
              <label
                key={answer}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-md border bg-background py-1 pr-3 pl-2 text-xs/relaxed transition-colors select-none sm:py-0.5",
                  "hover:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring/30",
                  checked
                    ? "border-primary bg-primary/10 text-primary hover:bg-primary/10"
                    : error
                      ? "border-destructive/60"
                      : "border-border"
                )}
              >
                <input
                  type="radio"
                  value={answer}
                  className="sr-only"
                  {...register(name)}
                />
                {/* A tick box inside the pill, filled once it is picked. */}
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors sm:size-3.5",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40 bg-background"
                  )}
                >
                  {checked && <RiCheckLine className="size-3 sm:size-2.5" />}
                </span>
                {answer === "yes" ? "Yes" : "No"}
              </label>
            )
          })}
        </div>
      </div>
      {error && <p className="text-2xs/relaxed text-destructive">{error}</p>}
    </div>
  )
}

/**
 * A date select and a time-slot select, side by side, and below them the
 * meal question when the slot has a meal.
 */
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
  const { register, watch, setValue } = useFormContext<RegistrationFormValues>()
  const dateName = `${prefix}Date` as const
  const slotName = `${prefix}Slot` as const
  const mealName = `${prefix}Meal` as const
  const meal = mealOf(watch(slotName))

  return (
    <div className="flex flex-col gap-2">
      <Field label={label} required error={error}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
            {...register(slotName, {
              // A yes to breakfast is not a yes to lunch: a new time asks again.
              onChange: () => setValue(mealName, ""),
            })}
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
      {meal && <MealQuestion name={mealName} meal={meal} />}
    </div>
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
  // A nearby mandal: travel and stay are not asked (see isLocalMandal).
  const mandal = watch("mandal")
  const local = isLocalMandal(mandal)
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

  const forEveryone = watch("accommodationRequired")
  const party = members.length > 1
  const dates = { members, sameSchedule, arrivalDate, departureDate }

  /**
   * Unticking "for everyone" starts everyone who stays a night ticked, so
   * only the people who do not need a bed have to be unticked — unless some
   * were already picked, which is kept.
   */
  const onEveryoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) return
    const current = getValues("members")
    if (current.some((m) => m.needsAccommodation)) return
    current.forEach((_, index) => {
      if (!isSameDayFor(getValues(), index)) {
        setValue(`members.${index}.needsAccommodation`, true)
      }
    })
  }

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
        setValue("arrivalMeal", first.arrivalMeal)
        setValue("departureMeal", first.departureMeal)
      }
      return
    }
    getValues("members").forEach((member, index) => {
      if (member.arrivalDate) return
      setValue(`members.${index}.arrivalDate`, getValues("arrivalDate"))
      setValue(`members.${index}.arrivalSlot`, getValues("arrivalSlot"))
      setValue(`members.${index}.departureDate`, getValues("departureDate"))
      setValue(`members.${index}.departureSlot`, getValues("departureSlot"))
      setValue(`members.${index}.arrivalMeal`, getValues("arrivalMeal"))
      setValue(`members.${index}.departureMeal`, getValues("departureMeal"))
    })
  }

  const STAY_FIELDS = [
    "arrivalDate",
    "arrivalSlot",
    "arrivalMeal",
    "departureDate",
    "departureSlot",
    "departureMeal",
  ] as const

  /**
   * "Same as above" copies the previous person's arrival and departure onto
   * this one, so only the people whose dates differ need editing by hand;
   * "Clear" empties them again. Both go through setValue, which keepErrorsFresh
   * hears like any other change, so an error already shown on these fields
   * clears as soon as the copy fixes it.
   */
  const copyFromAbove = (index: number) => {
    const above = getValues(`members.${index - 1}`)
    for (const field of STAY_FIELDS) {
      setValue(`members.${index}.${field}`, above[field], { shouldDirty: true })
    }
  }
  const clearStay = (index: number) => {
    for (const field of STAY_FIELDS) {
      setValue(`members.${index}.${field}`, "", { shouldDirty: true })
    }
  }
  const hasStay = (member: (typeof members)[number] | undefined) =>
    !!member && STAY_FIELDS.some((field) => member[field])

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-sm font-medium">Dates</h3>
          <p className="text-xs/relaxed text-muted-foreground">
            The event runs {formatStayDate(EVENT.days[0]).split(" · ")[0]} to{" "}
            {formatStayDate(EVENT.days[EVENT.days.length - 1]).split(" · ")[0]}.
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              const above = index > 0 ? members[index - 1] : undefined
              const filled = hasStay(member)
              const aboveHasDates = hasStay(above)
              return (
                <div
                  key={index}
                  className="group/person flex flex-col gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <p className="text-xs/relaxed font-medium">
                      {member.fullName || `Person ${index + 1}`}
                    </p>
                    {/* Shows on hover with a mouse; always on touch screens,
                        which have no hover. "Clear" once this person has any
                        dates; otherwise "Same as above", once the person above
                        has some to copy. */}
                    {index > 0 && (filled || aboveHasDates) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          filled ? clearStay(index) : copyFromAbove(index)
                        }
                        title={
                          filled
                            ? `Clear ${member.fullName || `person ${index + 1}`}'s arriving and leaving`
                            : `Copy ${above?.fullName || `person ${index}`}'s arriving and leaving`
                        }
                        className="text-muted-foreground opacity-0 transition-opacity group-hover/person:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                      >
                        {filled ? <RiEraserLine /> : <RiFileCopyLine />}
                        {filled ? "Clear" : "Same as above"}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {/* Locals come and go from home: no travel or stay to ask about. */}
      {local ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs/relaxed text-muted-foreground">
          {mandal} is close by, so travel and accommodation are not needed.
        </p>
      ) : (
        <>
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
                    options={TRAVEL_CHOICES.map((mode) => ({
                      value: mode,
                      label: TRAVEL_MODES[mode],
                      description: TRAVEL_DESCRIPTIONS[mode],
                      icon: <TravelModeIcon mode={mode} />,
                    }))}
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
                      For the parking passes. Leave blank if you do not know
                      them yet.
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              label={
                party
                  ? `${weNeed} accommodation for everyone`
                  : `${weNeed} accommodation from Mandir`
              }
              description={
                sameDay
                  ? "Not needed — you arrive and leave on the same day, so there is no night's stay."
                  : party
                    ? "Untick if only some of you need it. The accommodation team allots rooms or dormitory beds after registration closes."
                    : "The accommodation team allots rooms or dormitory beds after registration closes."
              }
              disabled={sameDay}
              {...register("accommodationRequired", {
                onChange: onEveryoneChange,
              })}
            />

            {/* The party, below the box: ticks to pick who while "for everyone"
            is unticked (nobody ticked: nobody needs a bed); once it is
            ticked, a read-only pill per person showing who has a bed coming. */}
            {party && !sameDay && (
              <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs/relaxed font-medium">
                    {forEveryone
                      ? "Accommodation for"
                      : "Who needs accommodation?"}
                  </p>
                  {!forEveryone && (
                    <p className="text-2xs/relaxed text-muted-foreground">
                      Leave everyone unticked if nobody does.
                    </p>
                  )}
                </div>
                {forEveryone ? (
                  <ul className="flex flex-wrap gap-2">
                    {members.map((member, index) => {
                      const noNight = isSameDayFor(dates, index)
                      return (
                        <li
                          key={index}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm border py-0.5 pr-1 pl-1.5 text-2xs",
                            noNight
                              ? "border-border text-muted-foreground"
                              : "border-primary/30 bg-primary/5"
                          )}
                        >
                          <RiHotelBedLine
                            aria-hidden
                            className={cn(
                              "size-3.5 shrink-0",
                              noNight ? "text-muted-foreground" : "text-primary"
                            )}
                          />
                          {member.fullName || `Person ${index + 1}`}
                          {noNight ? (
                            <span className="pr-0.5">· same day, no night</span>
                          ) : (
                            <RiCheckboxCircleFill
                              aria-label="has a bed coming"
                              className="size-3.5 shrink-0 text-primary"
                            />
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  members.map((member, index) => {
                    const noNight = isSameDayFor(dates, index)
                    return (
                      <Checkbox
                        key={index}
                        id={`members.${index}.needsAccommodation`}
                        label={member.fullName || `Person ${index + 1}`}
                        description={
                          noNight
                            ? "Arrives and leaves the same day — no night's stay"
                            : undefined
                        }
                        disabled={noNight}
                        {...register(`members.${index}.needsAccommodation`)}
                      />
                    )
                  })
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
