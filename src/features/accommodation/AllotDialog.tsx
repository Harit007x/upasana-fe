import { RiErrorWarningLine, RiLoader4Line, RiWheelchairLine } from "@remixicon/react"
import { cn } from "cn"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/choice"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/input"
import { Badge } from "@/components/ui/primitives"
import { NativeSelect } from "@/components/ui/select"
import { displayName } from "@/features/registrations/format"
import { GENDERS, type Registration } from "@/features/registrations/types"

import { useAllot, useRelease } from "./api"
import { RoomKindBadge } from "./components"
import {
  formatNights,
  nightsOf,
  roomFit,
  sortRooms,
  stayFor,
  suggestPlaces,
  wantsGroundFloor,
  type AccommodationIndex,
} from "./rules"

/**
 * Giving a registration's people a room: pick who, pick a place, pick a room.
 *
 * Everyone still without a room starts ticked, so a family goes in together
 * unless someone is unticked. Places where their mandal already stays come
 * first; rooms that would break a rule (gender, one family, beds on some
 * night) are hidden behind "Show rooms that don't fit", each with the reason.
 * Stays open after saving while anyone is still without a room, so a family
 * split across two rooms is done in one go.
 */
export function AllotDialog({
  registration,
  index,
  open,
  onOpenChange,
}: {
  registration: Registration
  index: AccommodationIndex
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <AllotContent
          registration={registration}
          index={index}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}

function AllotContent({
  registration,
  index,
  onDone,
}: {
  registration: Registration
  index: AccommodationIndex
  onDone: () => void
}) {
  const allot = useAllot()
  const release = useRelease()
  const stay = stayFor(registration, index)

  const [picked, setPicked] = React.useState<Set<string>>(
    () => new Set(stay.missing.map((m) => m.id))
  )
  const members = registration.members.filter((m) => picked.has(m.id))
  const suggestions = suggestPlaces(
    registration,
    members.length ? members : stay.sleepers,
    index
  )
  const [placeId, setPlaceId] = React.useState(
    () => suggestions[0]?.place.id ?? ""
  )
  const [roomId, setRoomId] = React.useState<string>()
  const [showAll, setShowAll] = React.useState(false)

  const place = index.placeById.get(placeId)
  const rooms = place
    ? sortRooms(place.rooms).map((room) => ({
        room,
        ...roomFit(place, room, registration, members, index),
      }))
    : []
  const fitting = rooms.filter((r) => !r.problem)
  const shown = showAll ? [...fitting, ...rooms.filter((r) => r.problem)] : fitting
  const chosen = fitting.find((r) => r.room.id === roomId)

  const allottable =
    registration.accommodationRequired &&
    (registration.status === "confirmed" || registration.status === "checked_in")
  const pickedWithRoom = members.filter((m) => index.bedOf(registration.id, m.id))
  const groundFloorWarning =
    chosen && !chosen.room.groundFloor
      ? members.filter(wantsGroundFloor)
      : []
  const busy = allot.isPending || release.isPending
  const error = allot.error ?? release.error

  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked)
    if (on) next.add(id)
    else next.delete(id)
    setPicked(next)
  }

  const save = () => {
    if (!chosen || !place) return
    allot.mutate(
      {
        registrationId: registration.id,
        memberIds: members.map((m) => m.id),
        placeId: place.id,
        roomId: chosen.room.id,
      },
      {
        onSuccess: () => {
          const left = stay.missing.filter((m) => !picked.has(m.id))
          if (left.length === 0) return onDone()
          // Others still need a room: carry on with them.
          setPicked(new Set(left.map((m) => m.id)))
          setRoomId(undefined)
        },
      }
    )
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader
        title={`Rooms for ${displayName(registration)}`}
        description={`${registration.code} · ${registration.mandal}`}
      />
      <DialogBody>
        {!allottable && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-2xs/relaxed text-amber-800 dark:text-amber-300">
            {!registration.accommodationRequired
              ? "They did not ask for accommodation. Tick it on the registration first."
              : "Confirm this registration before giving it rooms."}
          </p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs/relaxed font-medium">Who</legend>
          {registration.members.map((m) => {
            const bed = index.bedOf(registration.id, m.id)
            const sleeps = nightsOf(m).length > 0
            return (
              <Checkbox
                key={m.id}
                id={`allot-${m.id}`}
                checked={picked.has(m.id)}
                disabled={!sleeps}
                onChange={(e) => toggle(m.id, e.target.checked)}
                label={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {m.fullName}
                    {m.needsAssistance && (
                      <RiWheelchairLine
                        className="size-3.5 text-amber-700 dark:text-amber-400"
                        aria-label="Needs assistance"
                      />
                    )}
                  </span>
                }
                description={
                  <>
                    {GENDERS[m.gender]} · {m.age} · {formatNights(m)}
                    <br />
                    {!sleeps
                      ? "Leaves the day they arrive — no bed needed"
                      : bed
                        ? `In ${bed.place.name} · Room ${bed.room.label}`
                        : "No room yet"}
                  </>
                }
              />
            )
          })}
        </fieldset>

        <Field label="Place">
          <NativeSelect
            id="allot-place"
            value={placeId}
            onChange={(e) => {
              setPlaceId(e.target.value)
              setRoomId(undefined)
            }}
          >
            {suggestions.map(({ place: p, free, sameMandal }) => (
              <option key={p.id} value={p.id}>
                {p.name} — {Math.max(0, free)} beds free
                {sameMandal > 0 ? ` · ${sameMandal} from ${registration.mandal}` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {place && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-xs/relaxed font-medium">
              Room
              <span className="text-2xs font-normal text-muted-foreground">
                {members.length === 0
                  ? "Pick who first"
                  : `${fitting.length} of ${rooms.length} fit ${members.length === 1 ? "them" : `these ${members.length}`}`}
              </span>
            </legend>
            {members.length > 0 && fitting.length === 0 && (
              <p className="text-2xs/relaxed text-muted-foreground">
                No room here fits everyone ticked. Try another place, or untick
                someone to split the party.
              </p>
            )}
            {members.length > 0 &&
              shown.map(({ room, problem, free, others }) => (
                <label
                  key={room.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border border-border p-2.5 transition-colors has-checked:border-primary has-checked:bg-primary/5",
                    problem && "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="radio"
                    name="allot-room"
                    value={room.id}
                    checked={roomId === room.id}
                    disabled={!!problem}
                    onChange={() => setRoomId(room.id)}
                    className="mt-1 size-4 shrink-0 accent-primary sm:size-3.5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 text-xs/relaxed font-medium">
                      Room {room.label}
                      <RoomKindBadge kind={room.kind} />
                      {room.groundFloor && <Badge variant="outline">Ground floor</Badge>}
                    </span>
                    <span
                      className={cn(
                        "text-2xs/relaxed text-muted-foreground",
                        problem && "text-destructive"
                      )}
                    >
                      {problem ??
                        `${free} of ${room.beds} ${room.beds === 1 ? "bed" : "beds"} free on their nights`}
                      {others.length > 0 &&
                        ` · ${[...new Set(others.map((o) => o.registration.code))].join(", ")}`}
                    </span>
                  </span>
                </label>
              ))}
            {members.length > 0 && rooms.length > fitting.length && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="self-start text-2xs text-primary hover:underline"
              >
                {showAll
                  ? "Hide rooms that don't fit"
                  : `Show ${rooms.length - fitting.length} rooms that don't fit`}
              </button>
            )}
          </fieldset>
        )}

        {groundFloorWarning.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-2xs/relaxed text-amber-800 dark:text-amber-300">
            <RiErrorWarningLine className="mt-px size-3.5 shrink-0" />
            {groundFloorWarning.map((m) => m.fullName).join(", ")}{" "}
            {groundFloorWarning.length === 1 ? "needs" : "need"} the ground floor
            {" "}(assistance or 60+), and Room {chosen?.room.label} is not on it.
          </p>
        )}
        {error && <p className="text-2xs/relaxed text-destructive">{error.message}</p>}
      </DialogBody>
      <DialogFooter className="flex-wrap">
        {pickedWithRoom.length > 0 && (
          <Button
            variant="destructive"
            className="mr-auto"
            disabled={busy}
            onClick={() =>
              release.mutate(
                {
                  registrationId: registration.id,
                  memberIds: pickedWithRoom.map((m) => m.id),
                },
                { onSuccess: () => setPicked(new Set()) }
              )
            }
          >
            Take {pickedWithRoom.length === 1 ? pickedWithRoom[0].fullName.split(" ")[0] : `${pickedWithRoom.length}`} out
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Close
        </Button>
        <Button disabled={!chosen || !allottable || busy} onClick={save}>
          {allot.isPending && <RiLoader4Line className="animate-spin" />}
          {chosen
            ? `Put ${members.length === 1 ? members[0].fullName.split(" ")[0] : `${members.length}`} in Room ${chosen.room.label}`
            : "Pick a room"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
