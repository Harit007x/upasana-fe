import { useFormContext } from "react-hook-form"

import { Checkbox } from "@/components/ui/choice"
import { Badge } from "@/components/ui/primitives"
import { RequiredMark } from "@/components/ui/input"
import { isLocalMandal, type StayDate, type TimeSlot } from "@/config/event"
import { useT } from "@/i18n/context"
import type { Lang } from "@/i18n/translate"
import { formatMobile, toE164 } from "@/lib/phone"
import { formatTime } from "@/lib/time"

import {
  GENDERS,
  REGISTRATION_TYPES,
  TRAVEL_MODES,
  type Gender,
  type TravelMode,
} from "../types"
import { formatIndiaFlight, formatStay } from "../format"
import {
  fullNameOf,
  hasSplitDates,
  indiaTravelOf,
  bedsWanted,
  needsAccommodation,
  offersPickup,
  asksYouthConvention,
  vehicleSlots,
  type RegistrationFormValues,
} from "./schema"

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 text-xs/relaxed sm:grid-cols-[8rem_minmax(0,1fr)] sm:py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const stayText = (date: string, slot: string, meal: string, lang: Lang) =>
  date && slot
    ? formatStay(
        {
          date: date as StayDate,
          slot: slot as TimeSlot,
          meal: meal === "" ? undefined : meal === "yes",
        },
        lang
      )
    : "—"

/** Step 4: everything on one screen before it is sent. */
export function ReviewStep({
  onEditStep,
}: {
  onEditStep: (step: number) => void
}) {
  const {
    register,
    getValues,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()
  const { t, lang } = useT()
  const values = getValues()
  const beds = bedsWanted(values)
  const mode = values.travelMode as TravelMode
  const india = indiaTravelOf(values)
  const pickup = offersPickup(mode) && values.needsPickup === "yes"
  const drop = pickup && values.needsDrop
  // "Train · 12010 Shatabdi Exp · Sabarmati · leaves 6:45 pm": how they leave,
  // which need not be how they came, and its details.
  const journeyHome =
    drop && offersPickup(values.dropMode)
      ? [
          t(TRAVEL_MODES[values.dropMode]),
          values.dropReference,
          values.dropMode === "train" && t(values.dropStation),
          values.dropTime &&
            t("leaves {time}", { time: formatTime(values.dropTime) }),
        ]
          .filter(Boolean)
          .join(" · ")
      : ""

  const editButton = (step: number) => (
    <button
      type="button"
      onClick={() => onEditStep(step)}
      className="-mr-2 rounded-md px-2 py-1.5 text-2xs text-primary hover:underline"
    >
      {t("Edit")}
    </button>
  )

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">
            {t("Registration")}
          </h3>
          {editButton(0)}
        </div>
        <dl className="divide-y divide-border">
          <Row label={t("Type")}>{t(REGISTRATION_TYPES[values.type])}</Row>
          {values.type !== "individual" && (
            <Row label={t("Name")}>{values.groupName}</Row>
          )}
          <Row label={t("Satsang mandal")}>{t(values.mandal)}</Row>
          {india?.arrival && (
            <Row label={t("Airport pickup")}>
              {formatIndiaFlight(india.arrival, lang)}
            </Row>
          )}
          {india?.departure && (
            <Row label={t("Flight out")}>
              {formatIndiaFlight(india.departure, lang)}
            </Row>
          )}
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">
            {t("People ({n})", { n: values.members.length })}
          </h3>
          {editButton(1)}
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {values.members.map((member, index) => (
            <li
              key={index}
              className="flex flex-col gap-0.5 px-3 py-2.5 sm:py-2"
            >
              <span className="text-xs/relaxed font-medium break-words">
                {fullNameOf(member)}
                {index === 0 && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {t("contact")}
                  </span>
                )}
                {member.relation && index > 0 && values.type === "family" && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {t(member.relation)}
                  </span>
                )}
              </span>
              <span className="text-2xs/relaxed text-muted-foreground tabular-nums">
                {t(GENDERS[member.gender as Gender])} ·{" "}
                {t("{age} yrs", { age: member.age })}
                {member.mobile &&
                  ` · ${formatMobile(toE164(member.mobileCountry, member.mobile))}`}
                {member.needsAssistance && ` · ${t("needs assistance")}`}
                {asksYouthConvention(member.age) &&
                  member.youthConvention &&
                  ` · ${t("Youth Convention: {answer}", {
                    answer:
                      member.youthConvention === "yes" ? t("Yes") : t("No"),
                  })}`}
                {index === 0 &&
                  values.verifiedInPerson &&
                  ` · ${t("verified in person")}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">
            {isLocalMandal(values.mandal)
              ? t("Dates")
              : t("Mahotsav - Stay & Travel")}
          </h3>
          {editButton(2)}
        </div>
        <dl className="divide-y divide-border">
          {!hasSplitDates(values) ? (
            <>
              <Row label={t("Arriving")}>
                {stayText(
                  values.arrivalDate,
                  values.arrivalSlot,
                  values.arrivalMeal,
                  lang
                )}
              </Row>
              <Row label={t("Leaving")}>
                {stayText(
                  values.departureDate,
                  values.departureSlot,
                  values.departureMeal,
                  lang
                )}
              </Row>
            </>
          ) : (
            values.members.map((member, index) => (
              <Row key={index} label={fullNameOf(member)}>
                {stayText(
                  member.arrivalDate,
                  member.arrivalSlot,
                  member.arrivalMeal,
                  lang
                )}{" "}
                →{" "}
                {stayText(
                  member.departureDate,
                  member.departureSlot,
                  member.departureMeal,
                  lang
                )}
              </Row>
            ))
          )}
          {isLocalMandal(values.mandal) ? (
            <Row label={t("Travel and stay")}>{t("Local — not needed")}</Row>
          ) : (
            <>
              <Row label={t("Travel")}>
                {t(TRAVEL_MODES[mode])}
                {mode === "personal_vehicle" &&
                  (() => {
                    const count = vehicleSlots(values)
                    const numbers = values.vehicleNumbers
                      .slice(0, count)
                      .map((number) => (number ?? "").trim().toUpperCase())
                      .filter(Boolean)
                    return ` · ${count === 1 ? t("1 vehicle") : t("{n} vehicles", { n: count })}${numbers.length ? ` · ${numbers.join(", ")}` : ""}`
                  })()}
                {/* By train or bus, the details come only with a pickup. */}
                {mode !== "personal_vehicle" &&
                  (!offersPickup(mode) || pickup) &&
                  values.travelReference &&
                  ` · ${values.travelReference}`}
                {mode === "train" &&
                  pickup &&
                  values.travelStation &&
                  ` · ${t(values.travelStation)}`}
                {pickup &&
                  values.travelTime &&
                  ` · ${t("arrives {time}", { time: formatTime(values.travelTime) })}`}
                {pickup && (
                  <Badge variant="info" className="ml-2 align-middle">
                    {t("Pickup needed")}
                  </Badge>
                )}
                {drop && (
                  <Badge variant="info" className="ml-2 align-middle">
                    {t("Drop needed")}
                  </Badge>
                )}
              </Row>
              {journeyHome && (
                <Row label={t("Journey home")}>{journeyHome}</Row>
              )}
              <Row label={t("Accommodation")}>
                {needsAccommodation(values) ? (
                  <>
                    <Badge variant="info" className="align-middle">
                      {t("Needed")}
                    </Badge>
                    {/* Only some of the party: say who. */}
                    {beds.includes(false) && (
                      <span className="ml-2">
                        {t("for {names}", {
                          names: values.members
                            .map((m, i) =>
                              beds[i]
                                ? fullNameOf(m) || t("Person {n}", { n: i + 1 })
                                : ""
                            )
                            .filter(Boolean)
                            .join(", "),
                        })}
                      </span>
                    )}
                  </>
                ) : (
                  t("Not needed")
                )}
              </Row>
            </>
          )}
        </dl>
      </section>

      <div className="flex flex-col gap-1.5">
        <Checkbox
          id="consent"
          label={
            <>
              {t("These details are correct")}
              <RequiredMark />
            </>
          }
          description={t(
            "I agree to follow the Mandir's guidelines during the event."
          )}
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
