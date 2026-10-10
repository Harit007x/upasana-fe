import {
  RiCheckLine,
  RiFileCopyLine,
  RiLoader4Line,
  RiMapPinLine,
  RiPhoneLine,
  RiWhatsappLine,
} from "@remixicon/react"
import * as React from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/primitives"
import { formatCreatedAt } from "@/features/registrations/format"
import type { Registration } from "@/features/registrations/types"
import { formatMobile } from "@/lib/phone"

import { useSendNotice } from "./api"
import type { RegistrationStay } from "./rules"
import { ROOM_KINDS, type NoticeState, type RoomKind, type StayNotice } from "./types"

export function RoomKindBadge({ kind }: { kind: RoomKind }) {
  return <Badge variant={kind === "family" ? "secondary" : "outline"}>{ROOM_KINDS[kind]}</Badge>
}

/** Accommodation at a glance: asked for, waiting, partly or fully allotted. */
export function StayStatusBadge({ stay }: { stay: RegistrationStay }) {
  switch (stay.status) {
    case "not_needed":
      return <span className="text-muted-foreground">Not needed</span>
    case "unconfirmed":
      return <Badge variant="outline">Needed · confirm first</Badge>
    case "to_allot":
      return <Badge variant="warning">Needed · no room yet</Badge>
    case "partly":
      return (
        <Badge variant="warning">
          {stay.allotted.length} of {stay.sleepers.length} have a room
        </Badge>
      )
    case "allotted":
      return <Badge variant="info">Room allotted</Badge>
  }
}

/** "Sent 10 Oct, 4:41 am by Harit", or that it has changed since, or not sent. */
export function NoticeLine({ notice }: { notice?: NoticeState }) {
  if (!notice?.sentAt) return <span className="text-muted-foreground">Room details not sent</span>
  if (!notice.upToDate) {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        Rooms changed since the details were sent — send again
      </span>
    )
  }
  return (
    <span className="text-muted-foreground">
      Room details sent {formatCreatedAt(notice.sentAt)}
      {notice.sentByName && ` by ${notice.sentByName}`}
    </span>
  )
}

/** Each place and room, and who is in it. */
export function StayDetails({ notice }: { notice: StayNotice }) {
  return (
    <div className="flex flex-col gap-3">
      {notice.places.map((place) => (
        <div key={place.name} className="flex flex-col gap-1 text-xs/relaxed">
          <p className="font-medium">{place.name}</p>
          <p className="text-2xs/relaxed text-muted-foreground">{place.address}</p>
          <ul className="flex flex-col gap-0.5">
            {place.rooms.map((room) => (
              <li key={room.label}>
                <span className="font-medium">Room {room.label}</span> · {room.people.join(", ")}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs/relaxed">
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
            {place.coordinatorMobile && (
              <a
                href={`tel:${place.coordinatorMobile}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <RiPhoneLine className="size-3.5" />
                {place.coordinatorName ? `${place.coordinatorName}, ` : ""}
                {formatMobile(place.coordinatorMobile)}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Sends a registration its room details on WhatsApp. Without WhatsApp on the
 * server, shows the message to send from your own phone — "Open WhatsApp"
 * fills it in — and then "Mark as sent" records it.
 */
export function SendRoomDetails({
  registration,
  notice,
  size = "lg",
}: {
  registration: Registration
  notice?: NoticeState
  size?: "lg" | "sm"
}) {
  const send = useSendNotice()
  const [manual, setManual] = React.useState<{ message: string; whatsappUrl: string }>()
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const again = notice?.sentAt && !notice.upToDate
  const done = notice?.sentAt && notice.upToDate

  return (
    <>
      <Button
        size={size}
        variant={done ? "outline" : "default"}
        disabled={send.isPending}
        onClick={() =>
          send.mutate(
            { registrationId: registration.id },
            { onSuccess: (result) => !result.sent && setManual(result) }
          )
        }
      >
        {send.isPending ? <RiLoader4Line className="animate-spin" /> : <RiWhatsappLine />}
        {again ? "Send again" : done ? "Resend" : "Send room details"}
      </Button>
      {send.isError && !manual && (
        <p className="w-full text-2xs/relaxed text-destructive">{send.error.message}</p>
      )}

      <Dialog open={!!manual} onOpenChange={(open) => !open && setManual(undefined)}>
        <DialogContent>
          <DialogHeader
            title="Send from your phone"
            description={`WhatsApp is not set up on the server yet. Send this to ${registration.members[0]?.fullName ?? "the contact"} yourself, then mark it as sent.`}
          />
          <DialogBody>
            <pre className="rounded-md bg-muted p-3 font-sans text-xs/relaxed whitespace-pre-wrap">
              {manual?.message}
            </pre>
            <div className="flex flex-wrap gap-2">
              <a
                href={manual?.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                <RiWhatsappLine />
                Open WhatsApp
              </a>
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(manual?.message ?? "")
                    setCopied(true)
                  } catch {
                    // Clipboard blocked: the message is on screen to select.
                  }
                }}
              >
                {copied ? <RiCheckLine /> : <RiFileCopyLine />}
                {copied ? "Copied" : "Copy message"}
              </Button>
            </div>
            {send.isError && (
              <p className="text-2xs/relaxed text-destructive">{send.error.message}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManual(undefined)}>
              Not now
            </Button>
            <Button
              disabled={send.isPending}
              onClick={() =>
                send.mutate(
                  { registrationId: registration.id, manual: true },
                  { onSuccess: () => setManual(undefined) }
                )
              }
            >
              Mark as sent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
