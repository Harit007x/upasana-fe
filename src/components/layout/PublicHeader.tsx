import {
  RiCalendarLine,
  RiCalendarScheduleLine,
  RiMapPinLine,
  RiUserAddLine,
} from "@remixicon/react"
import { cn } from "cn"
import { NavLink } from "react-router"

import { EVENT, formatEventRange } from "@/config/event"

/**
 * The public pages, as tabs along the bottom of the banner. "Register" stays
 * lit on /register/edit too: changing a registration is part of registering.
 */
const PUBLIC_NAV = [
  { to: "/schedule", label: "Schedule", icon: RiCalendarScheduleLine },
  { to: "/register", label: "Register", icon: RiUserAddLine },
]

/** The event banner on the pages devotees open without signing in. */
export function PublicHeader({
  eyebrow,
  children,
}: {
  /** The small line above the event name, e.g. "Registration open". */
  eyebrow: string
  children?: React.ReactNode
}) {
  return (
    <header className="border-b border-border bg-primary/5 pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-6 pb-3 sm:px-6 sm:pt-8 sm:pb-4">
        <span className="text-2xs font-medium tracking-wider text-primary uppercase">
          {eyebrow}
        </span>
        <h1 className="font-heading text-2xl font-semibold text-balance">
          {EVENT.name}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs/relaxed text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <RiCalendarLine className="size-3.5" />
            {formatEventRange()} · 5 days
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RiMapPinLine className="size-3.5" />
            {EVENT.venue}
          </span>
        </div>
        {children}
      </div>
      <nav
        aria-label="Event pages"
        className="mx-auto flex w-full max-w-2xl gap-1 px-4 sm:px-6"
      >
        {PUBLIC_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-xs/relaxed text-muted-foreground transition-colors hover:text-foreground",
                isActive && "border-primary font-medium text-foreground"
              )
            }
          >
            <Icon className="size-4 sm:size-3.5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
