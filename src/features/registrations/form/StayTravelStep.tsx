import * as React from "react"
import {
  RiCheckboxCircleFill,
  RiEraserLine,
  RiFileCopyLine,
  RiHotelBedLine,
} from "@remixicon/react"
import { cn } from "cn"
import { Controller, useFormContext } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox, ChoiceGroup } from "@/components/ui/choice"
import { TimePicker } from "@/components/ui/date-time"
import { DigitsInput, Field, Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/select"
import {
  EVENT,
  STAY_DATES,
  TIME_SLOTS,
  TRAIN_STATIONS,
  formatStayDate,
  isLocalMandal,
  mealOf,
  type StayDate,
  type TimeSlot,
} from "@/config/event"
import { useT } from "@/i18n/context"

import { TravelModeIcon } from "../components"
import { compareStay, isPresentOn, nightsBetween } from "../stay"
import { TRAVEL_MODES, type TravelMode } from "../types"
import {
  hasSplitDates,
  isSameDayFor,
  isSameDayVisit,
  maxVehicles,
  offersPickup,
  DROP_MODES,
  TRAVEL_CHOICES,
  type DropMode,
  vehicleSlots,
  type RegistrationFormValues,
} from "./schema"
import { YesNoQuestion } from "./YesNoQuestion"

const DROP_DESCRIPTIONS: Record<DropMode, string> = {
  train: "From an Ahmedabad station.",
  public_bus: "From an Ahmedabad bus stand.",
  flight: "From Ahmedabad airport.",
}

const TRAVEL_DESCRIPTIONS: Record<(typeof TRAVEL_CHOICES)[number], string> = {
  personal_vehicle: "Car or two-wheeler. Parking is on site.",
  mandal_bus: "Bus arranged by your mandal.",
  train: "Arriving at Ahmedabad Junction.",
  flight: "Arriving at Ahmedabad airport.",
  public_bus: "GSRTC or private bus.",
  other: "Anything else.",
}

/**
 * "Will you take breakfast?" for someone arriving or leaving in a slot with a
 * meal, so the kitchen can count. Required.
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
  const { t } = useT()
  return (
    <YesNoQuestion
      name={name}
      question={t("Will you take {meal}?", { meal: t(meal) })}
      required
    />
  )
}

/**
 * The train, bus or flight into Ahmedabad (for a pickup) or out of it (for
 * a drop): the train's number, name and station, the bus's operator and
 * stop, or the flight number; and the time. All required once the pickup or drop is wanted.
 */
function Journey({
  mode,
  leg,
}: {
  mode: DropMode
  leg: "arrival" | "departure"
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()
  const { t } = useT()
  const arriving = leg === "arrival"
  const names = arriving
    ? ({
        reference: "travelReference",
        station: "travelStation",
        time: "travelTime",
      } as const)
    : ({
        reference: "dropReference",
        station: "dropStation",
        time: "dropTime",
      } as const)
  const timeLabel = arriving ? t("Arrival time") : t("Departure time")
  const referenceError = errors[names.reference]?.message
  const stationError = errors[names.station]?.message
  const timeError = errors[names.time]?.message

  const time = (
    <Field label={timeLabel} required error={timeError}>
      <Controller
        control={control}
        name={names.time}
        render={({ field }) => (
          <TimePicker
            id={names.time}
            aria-label={`${t(TRAVEL_MODES[mode])} ${timeLabel.toLowerCase()}`}
            value={field.value}
            onChange={field.onChange}
            invalid={!!timeError}
          />
        )}
      />
    </Field>
  )

  if (mode === "flight") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Field label={t("Flight number")} required error={referenceError}>
          <Input
            id={names.reference}
            aria-invalid={!!referenceError}
            placeholder={arriving ? "6E 2131" : "6E 2132"}
            autoComplete="off"
            className="uppercase placeholder:normal-case"
            {...register(names.reference)}
          />
        </Field>
        {time}
      </div>
    )
  }

  if (mode === "public_bus") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Field label={t("Bus details")} required error={referenceError}>
          <Input
            id={names.reference}
            aria-invalid={!!referenceError}
            placeholder={
              arriving
                ? t("GSRTC Volvo from Rajkot, reaching Geeta Mandir")
                : t("GSRTC Volvo to Rajkot, from Geeta Mandir")
            }
            {...register(names.reference)}
          />
        </Field>
        {time}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("Train number and name")} required error={referenceError}>
        <Input
          id={names.reference}
          aria-invalid={!!referenceError}
          placeholder={arriving ? "12009 Shatabdi Exp" : "12010 Shatabdi Exp"}
          {...register(names.reference)}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Field
          label={
            arriving ? t("Arriving at station") : t("Leaving from station")
          }
          required
          error={stationError}
        >
          <NativeSelect
            id={names.station}
            aria-invalid={!!stationError}
            {...register(names.station)}
          >
            <option value="" disabled>
              {t("Select station")}
            </option>
            {TRAIN_STATIONS.map((station) => (
              <option key={station} value={station}>
                {t(station)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {time}
      </div>
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
  const { t, lang } = useT()
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
            aria-label={`${label} – ${t("Day")}`}
            aria-invalid={!!error}
            {...register(dateName)}
          >
            <option value="" disabled>
              {t("Day")}
            </option>
            {STAY_DATES.map((date) => (
              <option key={date} value={date}>
                {formatStayDate(date, lang)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            id={slotName}
            aria-label={`${label} – ${t("Time")}`}
            aria-invalid={!!error}
            {...register(slotName, {
              // A yes to breakfast is not a yes to lunch: a new time asks again.
              onChange: () => setValue(mealName, ""),
            })}
          >
            <option value="" disabled>
              {t("Time")}
            </option>
            {Object.entries(TIME_SLOTS).map(([value, slotLabel]) => (
              <option key={value} value={value}>
                {t(slotLabel)}
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
  const { t, lang } = useT()

  const members = watch("members")
  const sameSchedule = watch("sameSchedule")
  const travelMode = watch("travelMode")
  const [registrationType, vehicleCount] = watch(["type", "vehicleCount"])
  // Someone registering alone speaks for themselves: "I need", not "We need".
  const alone = registrationType === "individual"
  // Train and public bus: a required Yes or No, asked before anything else
  // about the journey; the details follow only a Yes.
  const wantsPickup = watch("needsPickup") === "yes"
  const wantsDrop = wantsPickup && watch("needsDrop")
  const dropMode = watch("dropMode")
  const pickupQuestion = (
    <YesNoQuestion
      name="needsPickup"
      required
      question={t("Do you need a pickup in Ahmedabad?")}
      description={
        alone
          ? t("If yes, the transport team will contact you a day before.")
          : t(
              "If yes, the transport team will contact the primary contact a day before."
            )
      }
    />
  )
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
          <h3 className="font-heading text-sm font-medium">{t("Dates")}</h3>
          <p className="text-xs/relaxed text-muted-foreground">
            {t("The event runs {first} to {last}.", {
              first: formatStayDate(EVENT.days[0], lang).split(" · ")[0],
              last: formatStayDate(
                EVENT.days[EVENT.days.length - 1],
                lang
              ).split(" · ")[0],
            })}
          </p>
        </div>

        {/* Above the dates, so ticking it swaps what is below rather than moving itself. */}
        {members.length > 1 && (
          <Checkbox
            id="sameSchedule"
            label={t("Everyone arrives and leaves together")}
            description={t(
              "Untick if someone in the party comes later or leaves earlier."
            )}
            {...register("sameSchedule", { onChange: onSameScheduleChange })}
          />
        )}

        {!split && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StayPicker
                prefix="arrival"
                label={t("Arriving")}
                error={arrivalError}
              />
              <StayPicker
                prefix="departure"
                label={t("Leaving")}
                error={departureError}
              />
            </div>

            {validRange && (
              <p className="text-xs/relaxed text-muted-foreground tabular-nums">
                {t("{nights} nights · attending {days} of {total} event days", {
                  nights: nightsBetween(arrival, departure),
                  days: eventDays,
                  total: EVENT.days.length,
                })}
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
                      {member.fullName || t("Person {n}", { n: index + 1 })}
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
                            ? t("Clear {name}'s arriving and leaving", {
                                name:
                                  member.fullName ||
                                  t("person {n}", { n: index + 1 }),
                              })
                            : t("Copy {name}'s arriving and leaving", {
                                name:
                                  above?.fullName ||
                                  t("person {n}", { n: index }),
                              })
                        }
                        className="text-muted-foreground opacity-0 transition-opacity group-hover/person:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                      >
                        {filled ? <RiEraserLine /> : <RiFileCopyLine />}
                        {filled ? t("Clear") : t("Same as above")}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <StayPicker
                      prefix={`members.${index}.arrival`}
                      label={t("Arriving")}
                      error={memberErrors?.arrivalDate?.message}
                    />
                    <StayPicker
                      prefix={`members.${index}.departure`}
                      label={t("Leaving")}
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
          {t(
            "{mandal} is close by, so travel and accommodation are not needed.",
            {
              mandal: t(mandal),
            }
          )}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h3 className="font-heading text-sm font-medium">{t("Travel")}</h3>
            <Controller
              control={control}
              name="travelMode"
              render={({ field, fieldState }) => (
                <Field
                  label={t("How are you travelling?")}
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
                      label: t(TRAVEL_MODES[mode]),
                      description: t(TRAVEL_DESCRIPTIONS[mode]),
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
                    label={t("Number of vehicles")}
                    hint={t("Up to {max} for {people} people.", {
                      max: vehicleLimit,
                      people: members.length,
                    })}
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
                        ? t("Vehicle number (optional)")
                        : t("Vehicle numbers (optional)")}
                    </span>
                    <span className="text-2xs/relaxed text-muted-foreground">
                      {t(
                        "For the parking passes. Leave blank if you do not know them yet."
                      )}
                    </span>
                  </div>
                  {vehicles === 1 ? (
                    // One vehicle: the heading above already names the box.
                    <div className="flex flex-col gap-1.5 sm:max-w-sm">
                      {vehicleNumberInput(0, t("Vehicle number"))}
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
                          label={t("Vehicle {n}", { n: index + 1 })}
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

            {offersPickup(travelMode) && (
              <div className="flex flex-col gap-4">
                {pickupQuestion}
                {/* What the transport team needs for the pickup, asked only once it is wanted. */}
                {wantsPickup && <Journey mode={travelMode} leg="arrival" />}
                {/* A drop is offered only to those who are also picked up. */}
                {wantsPickup && (
                  <>
                    <Checkbox
                      id="needsDrop"
                      label={
                        alone
                          ? t("I need a drop when leaving")
                          : t("We need a drop when leaving")
                      }
                      description={t(
                        "To the station, bus stand or airport, in time for your journey home."
                      )}
                      {...register("needsDrop")}
                    />
                    {/* Leaving may not be the way they came: asked, then its details. */}
                    {wantsDrop && (
                      <Controller
                        control={control}
                        name="dropMode"
                        render={({ field, fieldState }) => (
                          <Field
                            label={t("How are you leaving?")}
                            required
                            error={fieldState.error?.message}
                          >
                            <ChoiceGroup
                              name={field.name}
                              value={field.value as DropMode | ""}
                              onChange={field.onChange}
                              invalid={!!fieldState.error}
                              className="grid-cols-1 sm:grid-cols-3"
                              options={DROP_MODES.map((mode) => ({
                                value: mode,
                                label: t(TRAVEL_MODES[mode]),
                                description: t(DROP_DESCRIPTIONS[mode]),
                                icon: <TravelModeIcon mode={mode} />,
                              }))}
                            />
                          </Field>
                        )}
                      />
                    )}
                    {wantsDrop && offersPickup(dropMode) && (
                      <Journey mode={dropMode} leg="departure" />
                    )}
                  </>
                )}
              </div>
            )}

            {travelMode === "other" && (
              <Field label={t("Details (optional)")}>
                <Input
                  id="travelReference"
                  placeholder={t("How are you travelling?")}
                  {...register("travelReference")}
                />
              </Field>
            )}

            {travelMode === "mandal_bus" && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs/relaxed text-muted-foreground">
                {t(
                  "Your mandal coordinator shares the bus timing and pickup point."
                )}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="font-heading text-sm font-medium">{t("Stay")}</h3>
            <Checkbox
              id="accommodationRequired"
              label={
                party
                  ? t("We need accommodation for everyone")
                  : alone
                    ? t("I need accommodation from Mandir")
                    : t("We need accommodation from Mandir")
              }
              description={
                sameDay
                  ? t(
                      "Not needed — you arrive and leave on the same day, so there is no night's stay."
                    )
                  : party
                    ? t(
                        "Untick if only some of you need it. The accommodation team allots rooms or dormitory beds after registration closes."
                      )
                    : t(
                        "The accommodation team allots rooms or dormitory beds after registration closes."
                      )
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
                      ? t("Accommodation for")
                      : t("Who needs accommodation?")}
                  </p>
                  {!forEveryone && (
                    <p className="text-2xs/relaxed text-muted-foreground">
                      {t("Leave everyone unticked if nobody does.")}
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
                          {member.fullName || t("Person {n}", { n: index + 1 })}
                          {noNight ? (
                            <span className="pr-0.5">
                              · {t("same day, no night")}
                            </span>
                          ) : (
                            <RiCheckboxCircleFill
                              aria-label={t("has a bed coming")}
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
                        label={
                          member.fullName || t("Person {n}", { n: index + 1 })
                        }
                        description={
                          noNight
                            ? t(
                                "Arrives and leaves the same day — no night's stay"
                              )
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
