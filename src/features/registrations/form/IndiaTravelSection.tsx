import { RiFlightLandLine, RiFlightTakeoffLine } from "@remixicon/react"
import { Controller, useFormContext } from "react-hook-form"

import { Checkbox } from "@/components/ui/choice"
import { DatePicker, TimePicker } from "@/components/ui/date-time"
import { Field, Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/primitives"
import { EVENT } from "@/config/event"
import { useT } from "@/i18n/context"

import type { RegistrationFormValues } from "./schema"

/**
 * The flight in and the flight out of Ahmedabad airport, the only one the
 * transport team covers. Landing has a pickup to tick after the flight; it is
 * saved only when ticked, and then its day is required (needed to arrange
 * anything). There is no drop for the flight out: it is for the record, saved
 * when its day is given. Times and numbers only if known.
 */
function AirportLeg({
  leg,
  alone,
}: {
  leg: "Arrival" | "Departure"
  /** Registering alone: "I need", not "We need". */
  alone: boolean
}) {
  const { t } = useT()
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()
  const arriving = leg === "Arrival"
  const wanted = watch("indiaNeedsPickup") && arriving
  const dateError = errors[`india${leg}Date`]?.message
  const Icon = arriving ? RiFlightLandLine : RiFlightTakeoffLine
  const days = EVENT.days
  const firstDay = days[0]
  const lastDay = days[days.length - 1]
  const dateLabel = arriving ? t("Landing day") : t("Flight day")
  const timeLabel = arriving ? t("Landing time") : t("Flight time")

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs/relaxed font-medium">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {arriving ? t("When you land") : t("For your flight out")}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Field label={dateLabel} required={wanted} error={dateError}>
          <Controller
            control={control}
            name={`india${leg}Date`}
            render={({ field }) => (
              <DatePicker
                id={`india${leg}Date`}
                aria-label={dateLabel}
                value={field.value}
                onChange={field.onChange}
                invalid={!!dateError}
                // Landing is before the event ends; flying out after it starts.
                {...(arriving ? { max: lastDay } : { min: firstDay })}
                defaultMonth={arriving ? firstDay : lastDay}
                highlight={days}
                highlightLabel={t("Event days")}
              />
            )}
          />
        </Field>
        <Field label={timeLabel}>
          <Controller
            control={control}
            name={`india${leg}Time`}
            render={({ field }) => (
              <TimePicker
                id={`india${leg}Time`}
                aria-label={timeLabel}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </div>

      <Field label={t("Flight number")}>
        <Input
          id={`india${leg}Flight`}
          placeholder={arriving ? "AI 144" : "AI 191"}
          autoComplete="off"
          className="uppercase placeholder:normal-case"
          {...register(`india${leg}Flight`)}
        />
      </Field>

      {arriving && (
        <Checkbox
          id="indiaNeedsPickup"
          label={
            alone
              ? t("I need a pickup from Ahmedabad airport")
              : t("We need a pickup from Ahmedabad airport")
          }
          description={t("The transport team meets you at arrivals.")}
          {...register("indiaNeedsPickup")}
        />
      )}
    </div>
  )
}

/**
 * For devotees from abroad (see `isOverseas`): a pickup from Ahmedabad
 * airport, and the flight out. Both optional.
 */
export function IndiaTravelSection({ alone }: { alone: boolean }) {
  const { t } = useT()
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-heading text-sm font-medium">
          {t("Ahmedabad airport pickup")}
          <Badge variant="secondary">{t("Optional")}</Badge>
        </h3>
        <p className="text-xs/relaxed text-muted-foreground">
          {t(
            "Only at Ahmedabad airport (AMD). Landing elsewhere? Leave the pickup unticked."
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AirportLeg leg="Arrival" alone={alone} />
        <AirportLeg leg="Departure" alone={alone} />
      </div>
    </section>
  )
}
