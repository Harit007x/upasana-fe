import {
  RiArrowLeftLine,
  RiDownload2Line,
  RiEditLine,
  RiErrorWarningLine,
  RiMapPinLine,
  RiPhoneLine,
  RiPrinterLine,
  RiWheelchairLine,
} from "@remixicon/react"
import { cn } from "cn"
import * as React from "react"
import { Link, useParams } from "react-router"

import { PageHeader } from "@/components/layout/AppShell"
import { LoadError } from "@/components/LoadError"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives"
import { useAccommodation } from "@/features/accommodation/api"
import { RoomKindBadge } from "@/features/accommodation/components"
import {
  NIGHTS,
  formatNight,
  formatNights,
  indexAccommodation,
  placeNights,
  roomProblem,
  sortRooms,
  type AccommodationIndex,
} from "@/features/accommodation/rules"
import { PLACE_KINDS, ROOM_KINDS, type Place } from "@/features/accommodation/types"
import { useRegistrations } from "@/features/registrations/api"
import { GENDERS } from "@/features/registrations/types"
import { isAdmin, useSession } from "@/lib/auth-client"
import { formatMobile } from "@/lib/phone"

/** One row per person, for the guest house's own list. */
function downloadCsv(place: Place, index: AccommodationIndex) {
  const header = ["Room", "Type", "Name", "Gender", "Age", "Mobile", "Code", "Mandal", "Arrival", "Departure", "Nights", "Assistance"]
  const rows = sortRooms(place.rooms).flatMap((room) =>
    index.occupantsOf(place.id, room.id).map(({ registration: r, member: m, nights }) => [
      room.label,
      ROOM_KINDS[room.kind],
      m.fullName,
      GENDERS[m.gender],
      m.age,
      m.mobile ? formatMobile(m.mobile) : r.members[0]?.mobile ? `${formatMobile(r.members[0].mobile)} (contact)` : "",
      r.code,
      r.mandal,
      `${m.arrival.date} ${m.arrival.slot}`,
      `${m.departure.date} ${m.departure.slot}`,
      nights.length,
      m.needsAssistance ? (m.assistanceNote ?? "Yes") : "",
    ])
  )
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${place.name.replace(/[^\w]+/g, "-").toLowerCase()}-rooms.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * `/accommodation/places/:id`: one place, room by room — who is in each and
 * on which nights, with anything that no longer fits flagged. Prints as the
 * list to hand the guest house.
 */
export function AccommodationPlace() {
  const { id = "" } = useParams()
  const { data: session } = useSession()
  const registrations = useRegistrations()
  const accommodation = useAccommodation()

  const index = React.useMemo(
    () =>
      accommodation.data && registrations.data
        ? indexAccommodation(accommodation.data, registrations.data)
        : undefined,
    [accommodation.data, registrations.data]
  )

  const back = (
    <Link
      to="/accommodation"
      className="inline-flex items-center gap-1 self-start text-2xs text-muted-foreground hover:text-foreground print:hidden"
    >
      <RiArrowLeftLine className="size-3" />
      Accommodation
    </Link>
  )

  if (registrations.isError || accommodation.isError) {
    return (
      <>
        {back}
        <LoadError
          title="Could not load this place"
          error={registrations.error ?? accommodation.error}
          onRetry={() => {
            void registrations.refetch()
            void accommodation.refetch()
          }}
        />
      </>
    )
  }
  if (!index) {
    return (
      <>
        {back}
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-96" />
      </>
    )
  }

  const place = index.placeById.get(id)
  if (!place) {
    return (
      <>
        {back}
        <EmptyState title="Place not found" description="It may have been removed." />
      </>
    )
  }

  const nights = placeNights(place, index)
  const scoped = session?.user.role === "sanchalak"

  return (
    <>
      {back}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {place.name}
            <Badge variant="outline">{PLACE_KINDS[place.kind]}</Badge>
          </span>
        }
        description={`${place.address}${place.area && !place.address.includes(place.area) ? ` · ${place.area}` : ""} · ${place.rooms.length} rooms · ${nights[0]?.beds ?? 0} beds`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="lg" onClick={() => window.print()}>
              <RiPrinterLine />
              Print
            </Button>
            <Button variant="outline" size="lg" onClick={() => downloadCsv(place, index)}>
              <RiDownload2Line />
              CSV
            </Button>
            {isAdmin(session?.user.role) && (
              <Link
                to={`/accommodation/places/${place.id}/edit`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <RiEditLine />
                Edit place
              </Link>
            )}
          </div>
        }
      />

      <Card className="gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs/relaxed">
          {place.mapUrl && (
            <a
              href={place.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <RiMapPinLine className="size-3.5" />
              Open in Maps
            </a>
          )}
          {place.coordinatorName || place.coordinatorMobile ? (
            <span className="inline-flex items-center gap-1">
              <RiPhoneLine className="size-3.5 text-muted-foreground" />
              {place.coordinatorName ?? "Coordinator"}
              {place.coordinatorMobile && (
                <a href={`tel:${place.coordinatorMobile}`} className="tabular-nums hover:underline">
                  {formatMobile(place.coordinatorMobile)}
                </a>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">No coordinator yet</span>
          )}
        </div>
        {place.notes && <p className="text-2xs/relaxed text-muted-foreground">{place.notes}</p>}
        {!scoped && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {nights.map((n) => (
              <div key={n.night} className="flex flex-col gap-0.5">
                <dt className="text-2xs text-muted-foreground">{formatNight(n.night)}</dt>
                <dd
                  className={cn(
                    "text-xs/relaxed tabular-nums",
                    n.used > n.beds && "font-medium text-destructive"
                  )}
                >
                  {n.used} of {n.beds} beds
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {place.rooms.length === 0 ? (
        <EmptyState title="No rooms yet" description="An admin adds them from Edit place." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {sortRooms(place.rooms).map((room) => {
            const occupants = index.occupantsOf(place.id, room.id)
            const problem = roomProblem(room, occupants)
            return (
              <li
                key={room.id}
                className={cn(
                  "flex break-inside-avoid flex-col gap-2 rounded-lg border border-border bg-card p-3",
                  problem && "border-destructive/40"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5 text-xs/relaxed font-medium">
                    Room {room.label}
                    <RoomKindBadge kind={room.kind} />
                    {room.groundFloor && <Badge variant="outline">Ground floor</Badge>}
                  </span>
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {room.beds} {room.beds === 1 ? "bed" : "beds"}
                  </span>
                </div>
                {!scoped && (
                  <div className="flex gap-1" aria-label="Beds used each night">
                    {NIGHTS.map((night) => {
                      const used = occupants.filter((o) => o.nights.includes(night)).length
                      return (
                        <span
                          key={night}
                          title={`${formatNight(night)}: ${used} of ${room.beds}`}
                          className={cn(
                            "flex-1 rounded-sm px-1 py-0.5 text-center text-3xs tabular-nums",
                            used === 0
                              ? "bg-muted text-muted-foreground"
                              : used > room.beds
                                ? "bg-destructive/15 text-destructive"
                                : used === room.beds
                                  ? "bg-primary/20 text-primary"
                                  : "bg-primary/10 text-primary"
                          )}
                        >
                          {formatNight(night).split(" ").slice(1).join(" ")} · {used}/{room.beds}
                        </span>
                      )
                    })}
                  </div>
                )}
                {occupants.length === 0 ? (
                  <p className="text-2xs/relaxed text-muted-foreground">Empty</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {occupants.map(({ registration: r, member: m }) => (
                      <li key={`${r.id}:${m.id}`} className="flex flex-col text-2xs/relaxed">
                        <span className="flex flex-wrap items-center gap-1">
                          <span className="font-medium text-foreground">{m.fullName}</span>
                          {m.needsAssistance && (
                            <RiWheelchairLine
                              className="size-3.5 text-amber-700 dark:text-amber-400"
                              aria-label={m.assistanceNote ?? "Needs assistance"}
                            />
                          )}
                          <Link to={`/registrations/${r.id}`} className="text-muted-foreground tabular-nums hover:underline">
                            {r.code}
                          </Link>
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {GENDERS[m.gender]} · {m.age} · {formatNights(m)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {problem && (
                  <p className="flex items-start gap-1 text-2xs/relaxed text-destructive">
                    <RiErrorWarningLine className="mt-px size-3.5 shrink-0" />
                    {problem}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
