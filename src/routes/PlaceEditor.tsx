import { RiAddLine, RiDeleteBinLine, RiLoader4Line } from "@remixicon/react"
import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"

import { PageHeader } from "@/components/layout/AppShell"
import { BackLink } from "@/components/layout/BackLink"
import { LoadError } from "@/components/LoadError"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { DigitsInput, Field, Input, Textarea } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives"
import { NativeSelect } from "@/components/ui/select"
import {
  useAccommodation,
  useDeletePlace,
  useSavePlace,
} from "@/features/accommodation/api"
import {
  indexAccommodation,
  type AccommodationIndex,
} from "@/features/accommodation/rules"
import {
  PLACE_KINDS,
  FLOORS,
  ROOM_KINDS,
  type Place,
  type PlaceKind,
  type RoomKind,
} from "@/features/accommodation/types"
import { useRegistrations } from "@/features/registrations/api"
import {
  DEFAULT_COUNTRY_CODE,
  fromE164,
  mobileError,
  toE164,
} from "@/lib/phone"

type RoomDraft = {
  /** Local key for the list; `id` is the saved room's, missing on a new one. */
  key: string
  id?: string
  label: string
  beds: string
  /** Extra mattresses on top of the beds. */
  extraBeds: string
  kind: RoomKind
  /** 0 = ground floor … 4 = 4th floor. */
  floor: number
}

const newKey = () => crypto.randomUUID()

/** The next free room number after the highest numbered one. */
function nextNumber(rooms: RoomDraft[]) {
  const numbers = rooms.map((r) => Number(r.label)).filter(Number.isInteger)
  return numbers.length ? Math.max(...numbers) + 1 : 1
}

/**
 * `/accommodation/places/new` and `/accommodation/places/:id/edit` (admin):
 * a place's details and its rooms. Rooms with people in them cannot be
 * removed here; the server also refuses changes they would no longer fit
 * (fewer beds, another type) and says who to move first.
 */
export function PlaceEditor() {
  const { id } = useParams()
  const accommodation = useAccommodation()
  const registrations = useRegistrations()
  const index = React.useMemo(
    () =>
      accommodation.data && registrations.data
        ? indexAccommodation(accommodation.data, registrations.data)
        : undefined,
    [accommodation.data, registrations.data]
  )

  if (accommodation.isError || registrations.isError) {
    return (
      <LoadError
        title="Could not load this place"
        error={accommodation.error ?? registrations.error}
        onRetry={() => {
          void accommodation.refetch()
          void registrations.refetch()
        }}
      />
    )
  }
  if (!index) return <Skeleton className="h-96" />

  const place = id ? index.placeById.get(id) : undefined
  if (id && !place) {
    return (
      <EmptyState
        title="Place not found"
        description="It may have been removed."
      />
    )
  }
  return <PlaceForm key={place?.id ?? "new"} place={place} index={index} />
}

function PlaceForm({
  place,
  index,
}: {
  place?: Place
  index: AccommodationIndex
}) {
  const navigate = useNavigate()
  const save = useSavePlace(place?.id)
  const remove = useDeletePlace()
  const phone = place?.coordinatorMobile
    ? fromE164(place.coordinatorMobile)
    : undefined

  const [name, setName] = React.useState(place?.name ?? "")
  const [kind, setKind] = React.useState<PlaceKind>(
    place?.kind ?? "guest_house"
  )
  const [address, setAddress] = React.useState(place?.address ?? "")
  const [area, setArea] = React.useState(place?.area ?? "")
  const [mapUrl, setMapUrl] = React.useState(place?.mapUrl ?? "")
  const [coordinatorName, setCoordinatorName] = React.useState(
    place?.coordinatorName ?? ""
  )
  const [country, setCountry] = React.useState<string>(
    phone?.code ?? DEFAULT_COUNTRY_CODE
  )
  const [mobile, setMobile] = React.useState(phone?.national ?? "")
  const [notes, setNotes] = React.useState(place?.notes ?? "")
  const [rooms, setRooms] = React.useState<RoomDraft[]>(
    () =>
      place?.rooms.map((r) => ({
        ...r,
        key: r.id,
        beds: String(r.beds),
        extraBeds: String(r.extraBeds ?? 0),
      })) ?? []
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  // "Add several rooms"
  const [bulkCount, setBulkCount] = React.useState("1")
  const [bulkBeds, setBulkBeds] = React.useState("2")
  const [bulkExtra, setBulkExtra] = React.useState("0")
  const [bulkKind, setBulkKind] = React.useState<RoomKind>("family")
  const [bulkFloor, setBulkFloor] = React.useState(0)

  /** People in a saved room, on any night. */
  const peopleIn = (roomId?: string) =>
    place && roomId ? index.occupantsOf(place.id, roomId).length : 0
  const totalPeople = place
    ? place.rooms.reduce((sum, r) => sum + peopleIn(r.id), 0)
    : 0
  const totalBeds = rooms.reduce((sum, r) => sum + (Number(r.beds) || 0), 0)

  const updateRoom = (key: string, change: Partial<RoomDraft>) =>
    setRooms((list) =>
      list.map((r) => (r.key === key ? { ...r, ...change } : r))
    )

  // "Add more rooms": how many (1–100), numbered on from the highest.
  const bulkTotal = Math.min(100, Math.max(1, Number(bulkCount) || 1))
  const bulkStart = nextNumber(rooms)
  const bulkBedsEach = Number(bulkBeds) || 1
  const bulkExtraEach = Number(bulkExtra) || 0

  const addRooms = () => {
    const count = bulkTotal
    const start = bulkStart
    setRooms((list) => [
      ...list,
      ...Array.from({ length: count }, (_, i) => ({
        key: newKey(),
        label: String(start + i),
        beds: bulkBeds || "1",
        extraBeds: bulkExtra || "0",
        kind: bulkKind,
        floor: bulkFloor,
      })),
    ])
  }

  const validate = () => {
    const found: Record<string, string> = {}
    if (name.trim().length < 2) found.name = "Enter the place's name"
    if (address.trim().length < 3) found.address = "Enter the address"
    if (mapUrl.trim() && !/^https:\/\/\S+$/.test(mapUrl.trim())) {
      found.mapUrl = "Paste a link starting with https://"
    }
    if (mobile) {
      const problem = mobileError(mobile, country)
      if (problem) found.mobile = problem
    }
    const seen = new Set<string>()
    for (const room of rooms) {
      const label = room.label.trim().toLowerCase()
      const beds = Number(room.beds)
      if (!label) found[`room-${room.key}`] = "Give the room a number or name"
      else if (seen.has(label))
        found[`room-${room.key}`] = `Room ${room.label} is listed twice`
      else if (!Number.isInteger(beds) || beds < 1 || beds > 50) {
        found[`room-${room.key}`] = "Beds must be 1 to 50"
      } else if (Number(room.extraBeds || 0) > 20) {
        found[`room-${room.key}`] = "Extra mattresses must be 0 to 20"
      }
      seen.add(label)
    }
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    save.mutate(
      {
        name: name.trim(),
        kind,
        address: address.trim(),
        area: area.trim() || undefined,
        mapUrl: mapUrl.trim() || undefined,
        coordinatorName: coordinatorName.trim() || undefined,
        coordinatorMobile: mobile ? toE164(country, mobile) : undefined,
        notes: notes.trim() || undefined,
        rooms: rooms.map((room) => ({
          id: room.id,
          label: room.label.trim(),
          beds: Number(room.beds),
          extraBeds: Number(room.extraBeds || 0),
          kind: room.kind,
          floor: room.floor,
        })),
      },
      { onSuccess: (saved) => navigate(`/accommodation/places/${saved.id}`) }
    )
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mx-auto flex w-full max-w-3xl flex-col gap-5"
    >
      <BackLink
        to={place ? `/accommodation/places/${place.id}` : "/accommodation"}
      >
        {place ? place.name : "Accommodation"}
      </BackLink>
      <PageHeader
        title={place ? `Edit ${place.name}` : "Add a place"}
        description={`${rooms.length} rooms · ${totalBeds} beds`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>
            <Input
              id="place-name"
              value={name}
              aria-invalid={!!errors.name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Type">
            <NativeSelect
              id="place-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as PlaceKind)}
            >
              {Object.entries(PLACE_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Address"
            required
            error={errors.address}
            className="sm:col-span-2"
          >
            <Input
              id="place-address"
              value={address}
              aria-invalid={!!errors.address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          <Field label="Area">
            <Input
              id="place-area"
              placeholder="Memnagar"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </Field>
          <Field label="Google Maps link" error={errors.mapUrl}>
            <Input
              id="place-map"
              placeholder="https://maps.app.goo.gl/…"
              value={mapUrl}
              aria-invalid={!!errors.mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
            />
          </Field>
          <Field label="Coordinator">
            <Input
              id="place-coordinator"
              value={coordinatorName}
              onChange={(e) => setCoordinatorName(e.target.value)}
            />
          </Field>
          <Field label="Coordinator's mobile" error={errors.mobile}>
            <PhoneInput
              id="place-coordinator-mobile"
              countryCode={country}
              placeholder="9876543210"
              invalid={!!errors.mobile}
              codeProps={{
                value: country,
                onChange: (e) => setCountry(e.target.value),
              }}
              numberProps={{
                value: mobile,
                onChange: (e) => setMobile(e.target.value),
              }}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              id="place-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Rooms</CardTitle>
          <CardDescription>
            Gents and ladies rooms take only men or only women; a family room
            takes one registration's people; a general room takes anyone. Extra
            mattresses are used only when a room's beds run out. People who need
            assistance or are 60+ are offered the lowest floors first.
          </CardDescription>
        </CardHeader>

        {rooms.length === 0 ? (
          <p className="text-xs/relaxed text-muted-foreground">
            No rooms yet. Add them below.
          </p>
        ) : (
          <ul className="-mx-4 flex flex-col divide-y divide-border border-y border-border">
            {rooms.map((room) => {
              const people = peopleIn(room.id)
              const error = errors[`room-${room.key}`]
              return (
                <li key={room.key} className="flex flex-col gap-1 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label="Room number or name"
                      value={room.label}
                      aria-invalid={!!error}
                      onChange={(e) =>
                        updateRoom(room.key, { label: e.target.value })
                      }
                      className="w-24 sm:w-20"
                    />
                    <div className="flex items-center gap-1.5">
                      <DigitsInput
                        aria-label="Beds"
                        maxLength={2}
                        value={room.beds}
                        onChange={(e) =>
                          updateRoom(room.key, { beds: e.target.value })
                        }
                        className="w-16 sm:w-12"
                      />
                      <span className="text-2xs text-muted-foreground">
                        beds +
                      </span>
                      <DigitsInput
                        aria-label="Extra mattresses"
                        title="Extra mattresses, used only when the beds run out"
                        maxLength={2}
                        value={room.extraBeds}
                        onChange={(e) =>
                          updateRoom(room.key, { extraBeds: e.target.value })
                        }
                        className="w-14 sm:w-10"
                      />
                      <span className="text-2xs text-muted-foreground">
                        extra
                      </span>
                    </div>
                    <NativeSelect
                      aria-label="Room type"
                      value={room.kind}
                      onChange={(e) =>
                        updateRoom(room.key, {
                          kind: e.target.value as RoomKind,
                        })
                      }
                      className="w-32 sm:w-28"
                    >
                      {Object.entries(ROOM_KINDS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect
                      aria-label="Floor"
                      value={room.floor}
                      onChange={(e) =>
                        updateRoom(room.key, { floor: Number(e.target.value) })
                      }
                      className="w-36 sm:w-28"
                    >
                      {FLOORS.map((label, value) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                    <span className="ml-auto flex items-center gap-2">
                      {people > 0 && (
                        <span className="text-2xs text-muted-foreground tabular-nums">
                          {people} {people === 1 ? "person" : "people"}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove room ${room.label}`}
                        title={
                          people > 0
                            ? "Move its people to another room first"
                            : undefined
                        }
                        disabled={people > 0}
                        onClick={() =>
                          setRooms((list) =>
                            list.filter((r) => r.key !== room.key)
                          )
                        }
                      >
                        <RiDeleteBinLine />
                      </Button>
                    </span>
                  </div>
                  {error && (
                    <p className="text-2xs/relaxed text-destructive">{error}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Several rooms alike in one go: each box labelled in full, and a
            line saying exactly what the button will add. */}
        <div className="flex flex-col gap-3 rounded-md bg-muted/60 p-3">
          <p className="text-xs/relaxed font-medium">Add more rooms</p>
          {/* Equal columns, boxes aligned along the bottom: a label that
              wraps on a narrow screen never pushes its box out of line. */}
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5">
            <Field label="How many rooms">
              <DigitsInput
                id="bulk-count"
                maxLength={3}
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
              />
            </Field>
            <Field label="Beds in each">
              <DigitsInput
                id="bulk-beds"
                maxLength={2}
                value={bulkBeds}
                onChange={(e) => setBulkBeds(e.target.value)}
              />
            </Field>
            <Field label="Extra mattresses">
              <DigitsInput
                id="bulk-extra"
                maxLength={2}
                value={bulkExtra}
                onChange={(e) => setBulkExtra(e.target.value)}
              />
            </Field>
            <Field label="Type">
              <NativeSelect
                id="bulk-kind"
                value={bulkKind}
                onChange={(e) => setBulkKind(e.target.value as RoomKind)}
              >
                {Object.entries(ROOM_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Floor" className="col-span-2 sm:col-span-1">
              <NativeSelect
                id="bulk-floor"
                value={bulkFloor}
                onChange={(e) => setBulkFloor(Number(e.target.value))}
              >
                {FLOORS.map((label, value) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-2xs/relaxed text-muted-foreground">
              Adds{" "}
              {bulkTotal === 1
                ? `Room ${bulkStart}`
                : `Rooms ${bulkStart}–${bulkStart + bulkTotal - 1}`}
              : {ROOM_KINDS[bulkKind].toLowerCase()}, {bulkBedsEach}{" "}
              {bulkBedsEach === 1 ? "bed" : "beds"}
              {bulkExtraEach > 0 &&
                ` + ${bulkExtraEach} extra ${bulkExtraEach === 1 ? "mattress" : "mattresses"}`}
              {bulkTotal > 1 && " each"}, on the{" "}
              {FLOORS[bulkFloor].toLowerCase()}.
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={addRooms}
              className="shrink-0"
            >
              <RiAddLine />
              Add {bulkTotal === 1 ? "room" : `${bulkTotal} rooms`}
            </Button>
          </div>
        </div>
      </Card>

      {save.isError && (
        <p className="text-xs/relaxed text-destructive">{save.error.message}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {place && (
          <Button
            type="button"
            variant="destructive"
            size="lg"
            disabled={totalPeople > 0}
            title={
              totalPeople > 0 ? "Move everyone staying here first" : undefined
            }
            onClick={() => setConfirmDelete(true)}
          >
            <RiDeleteBinLine />
            Remove place
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Link
            to={place ? `/accommodation/places/${place.id}` : "/accommodation"}
            className="inline-flex h-11 items-center px-4 text-xs/relaxed text-muted-foreground hover:text-foreground sm:h-8"
          >
            Cancel
          </Link>
          <Button type="submit" size="lg" disabled={save.isPending}>
            {save.isPending && <RiLoader4Line className="animate-spin" />}
            {place ? "Save changes" : "Add place"}
          </Button>
        </div>
      </div>

      {place && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader
              title={`Remove ${place.name}?`}
              description="Its rooms go with it. Nobody is staying there."
            />
            <DialogBody>
              {remove.isError && (
                <p className="text-2xs/relaxed text-destructive">
                  {remove.error.message}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(place.id, {
                    onSuccess: () =>
                      navigate("/accommodation", { replace: true }),
                  })
                }
              >
                Remove place
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </form>
  )
}
