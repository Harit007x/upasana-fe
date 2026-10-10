/**
 * Accommodation, shaped as upasana-be sends it (src/lib/accommodation.ts).
 *
 * A place has rooms; each person who sleeps over gets one allotment, to one
 * room. Their nights come from their own arrival and departure, so a room's
 * beds are counted night by night.
 */

export const PLACE_KINDS = { guest_house: "Guest house", hotel: "Hotel" } as const
export type PlaceKind = keyof typeof PLACE_KINDS

export const ROOM_KINDS = { gents: "Gents", ladies: "Ladies", family: "Family" } as const
export type RoomKind = keyof typeof ROOM_KINDS

export type Room = {
  /** Stable: allotments point at it, so relabelling a room keeps its people. */
  id: string
  label: string
  beds: number
  kind: RoomKind
  groundFloor: boolean
}

export type Place = {
  id: string
  name: string
  kind: PlaceKind
  address: string
  area?: string
  mapUrl?: string
  coordinatorName?: string
  /** E.164. */
  coordinatorMobile?: string
  notes?: string
  sortOrder: number
  rooms: Room[]
}

export type Allotment = {
  id: string
  registrationId: string
  /** `Member.id` on the registration. */
  memberId: string
  placeId: string
  roomId: string
  allottedByName: string
  allottedAt: string
}

/** Whether a registration was sent its room details, and whether they still hold. */
export type NoticeState = {
  registrationId: string
  sentAt?: string
  sentByName?: string
  upToDate: boolean
}

export type AccommodationData = {
  places: Place[]
  allotments: Allotment[]
  notices: NoticeState[]
  /** WhatsApp is set up on the server, so room details can be sent from here. */
  whatsApp: boolean
}

/** Where a registration's people stay, as sent to them. */
export type StayNotice = {
  places: {
    name: string
    address: string
    area?: string
    mapUrl?: string
    coordinatorName?: string
    coordinatorMobile?: string
    rooms: { label: string; people: string[] }[]
  }[]
}

/** What the place editor saves. A room without an id is new. */
export type PlaceInput = Omit<Place, "id" | "sortOrder" | "rooms"> & {
  rooms: (Omit<Room, "id"> & { id?: string })[]
}
