import { RiFlightLandLine, RiFlightTakeoffLine } from "@remixicon/react"
import { Controller, useFormContext } from "react-hook-form"

import { Checkbox } from "@/components/ui/choice"
import { DatePicker, TimePicker } from "@/components/ui/date-time"
import { Field, Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/primitives"
import { EVENT } from "@/config/event"

import type { RegistrationFormValues } from "./schema"

/**
 * A pickup when landing, or a drop for the flight out — at Ahmedabad airport,
 * the only one the transport team covers. Ticking it asks for the flight:
 * the day (needed to arrange anything), and the time and number if known.
 */
function AirportLeg({
  leg,
  weNeed,
}: {
  leg: "Arrival" | "Departure"
  weNeed: string
}) {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()
  const arriving = leg === "Arrival"
  const wanted = watch(arriving ? "indiaNeedsPickup" : "indiaNeedsDrop")
  const dateError = errors[`india${leg}Date`]?.message
  const Icon = arriving ? RiFlightLandLine : RiFlightTakeoffLine
  const days = EVENT.days
  const firstDay = days[0]
  const lastDay = days[days.length - 1]
  const dateLabel = arriving ? "Landing day" : "Flight day"
  const timeLabel = arriving ? "Landing time" : "Flight time"

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs/relaxed font-medium">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {arriving ? "When you land" : "For your flight out"}
      </p>

      <Checkbox
        id={arriving ? "indiaNeedsPickup" : "indiaNeedsDrop"}
        label={
          arriving
            ? `${weNeed} a pickup from Ahmedabad airport`
            : `${weNeed} a drop to Ahmedabad airport`
        }
        description={
          arriving
            ? "The transport team meets you at arrivals."
            : "The transport team gets you to the airport in time."
        }
        {...register(arriving ? "indiaNeedsPickup" : "indiaNeedsDrop")}
      />

      {wanted && (
        <>
          <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
            <Field label={dateLabel} required error={dateError}>
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
                    highlightLabel="Event days"
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

          <Field label="Flight number">
            <Input
              id={`india${leg}Flight`}
              placeholder={arriving ? "AI 144" : "AI 191"}
              autoComplete="off"
              className="uppercase placeholder:normal-case"
              {...register(`india${leg}Flight`)}
            />
          </Field>
        </>
      )}
    </div>
  )
}

/**
 * For devotees from abroad (see `isOverseas`): a pickup from and a drop to
 * Ahmedabad airport. Optional; the flight is asked about only for what is
 * ticked.
 */
export function IndiaTravelSection({ weNeed }: { weNeed: string }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-heading text-sm font-medium">
          Ahmedabad airport pickup and drop
          <Badge variant="secondary">Optional</Badge>
        </h3>
        <p className="text-xs/relaxed text-muted-foreground">
          Only at Ahmedabad airport (AMD). Landing elsewhere? Leave these
          unticked.
        </p>
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <AirportLeg leg="Arrival" weNeed={weNeed} />
        <AirportLeg leg="Departure" weNeed={weNeed} />
      </div>
    </section>
  )
}
