import { RiLoader4Line, RiWhatsappLine } from "@remixicon/react"
import * as React from "react"
import { Link, useLocation, useSearchParams } from "react-router"

import { PublicHeader } from "@/components/layout/PublicHeader"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { Card, CardTitle, EmptyState, Skeleton } from "@/components/ui/primitives"
import { StayDetails } from "@/features/accommodation/components"
import {
  useMyRegistrations,
  useSendOtp,
  useVerifyOtp,
} from "@/features/registrations/api"
import { DevCodeNote, RegistrationConfirmation } from "@/features/registrations/components"
import { RegistrationForm } from "@/features/registrations/form/RegistrationForm"
import type { Registration } from "@/features/registrations/types"
import {
  DEFAULT_COUNTRY_CODE,
  formatMobile,
  mobileError,
  toE164,
} from "@/lib/phone"

type Auth = { mobile: string; token: string }

/** Statuses a devotee can no longer change online, and why. */
const LOCKED: Partial<Record<Registration["status"], string>> = {
  checked_in: "Already checked in — ask at the desk to change anything.",
  cancelled: "Cancelled — contact your mandal sanchalak to restore it.",
}

/**
 * `/register/edit`: a devotee changing a registration they made.
 *
 * No account: the primary contact's number is the key. A code on WhatsApp
 * proves it is theirs, and opens the one registration that number is the
 * contact for, in the same form. The contact number
 * itself is fixed here; a confirmed registration goes back to pending for the
 * seva team to look over the change.
 */
export function EditMyRegistration() {
  // Arriving from "Edit my registration instead" on the new-registration form,
  // the number is already verified.
  const location = useLocation()
  const fromForm = (location.state as Auth | null) ?? undefined
  const [auth, setAuth] = React.useState<Auth | undefined>(fromForm)
  const [expired, setExpired] = React.useState(false)
  const [saved, setSaved] = React.useState<Registration>()
  const [, setParams] = useSearchParams()

  // One registration per contact number, so this is it.
  const mine = useMyRegistrations(auth)
  const chosen = mine.data?.[0]

  const startOver = () => {
    setAuth(undefined)
    setParams({}, { replace: true })
  }

  let body: React.ReactNode
  if (saved) {
    body = (
      <RegistrationConfirmation
        registration={saved}
        updated
        actions={
          <Link
            to="/register"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Back to registration
          </Link>
        }
      />
    )
  } else if (!auth) {
    body = (
      <VerifyNumber
        expired={expired}
        onVerified={(next) => {
          setExpired(false)
          setAuth(next)
        }}
      />
    )
  } else if (mine.isPending) {
    body = <Skeleton className="h-40" />
  } else if (mine.isError) {
    body = (
      <EmptyState
        title="Could not open your registrations"
        description={`${mine.error.message} Verify your number again to continue.`}
        action={
          <Button size="lg" onClick={startOver}>
            Verify again
          </Button>
        }
      />
    )
  } else if (!chosen) {
    body = (
      <EmptyState
        title="No registration under this number"
        description={`${formatMobile(auth.mobile)} is not the contact number on any registration. It may have been made with another family member's number.`}
        action={
          <Link to="/register" className={buttonVariants({ size: "lg" })}>
            Register now
          </Link>
        }
      />
    )
  } else if (LOCKED[chosen.status]) {
    body = (
      <EmptyState
        title={`${chosen.code} cannot be changed online`}
        description={LOCKED[chosen.status]!}
      />
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {chosen.stay && (
          <Card className="gap-3">
            <CardTitle>Where you are staying</CardTitle>
            <StayDetails notice={chosen.stay} />
          </Card>
        )}
        {chosen.stayChanging && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-2xs/relaxed text-amber-800 dark:text-amber-300">
            Your room details are being updated. We will send the new ones on
            WhatsApp.
          </p>
        )}
        <p className="rounded-md bg-muted px-3 py-2 text-2xs/relaxed text-muted-foreground">
          Changing{" "}
          <span className="font-mono font-medium text-foreground">
            {chosen.code}
          </span>
          .
          {chosen.status === "confirmed" &&
            " It is confirmed now; after you save, the seva team looks over your changes again."}
          {chosen.stay &&
            " Changing dates or people may change your rooms."}
        </p>
        <RegistrationForm
          key={chosen.id}
          source="self"
          editing={{ registration: chosen, as: "self", ownerToken: auth.token }}
          onRegistered={setSaved}
          onOwnerTokenExpired={() => {
            // The changes stay in this device's draft until they verify again.
            setExpired(true)
            startOver()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader eyebrow="Update your registration">
        <p className="max-w-prose text-xs/relaxed text-muted-foreground">
          Update dates, travel, or the people coming. You need the mobile number
          given as the contact when you registered.
        </p>
      </PublicHeader>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-5 pb-8 sm:px-6 sm:py-6">
        {body}
      </main>
    </div>
  )
}

/** The contact number, and a WhatsApp code to prove it is theirs. */
function VerifyNumber({
  expired,
  onVerified,
}: {
  expired: boolean
  onVerified: (auth: Auth) => void
}) {
  const sendOtp = useSendOtp()
  const verifyOtp = useVerifyOtp()
  const [country, setCountry] = React.useState<string>(DEFAULT_COUNTRY_CODE)
  const [mobile, setMobile] = React.useState("")
  const [numberError, setNumberError] = React.useState<string>()
  const [sentTo, setSentTo] = React.useState<string>()
  const [code, setCode] = React.useState("")
  const [devCode, setDevCode] = React.useState<string>()

  const e164 =
    mobile && !mobileError(mobile, country)
      ? toE164(country, mobile)
      : undefined

  const send = () => {
    const problem = mobile
      ? mobileError(mobile, country)
      : "Enter the contact number"
    setNumberError(problem)
    if (problem || !e164) return
    sendOtp.mutate(e164, {
      onSuccess: (result) => {
        setSentTo(e164)
        setCode("")
        setDevCode(result.devCode)
      },
    })
  }

  const verify = (value: string) => {
    if (!sentTo || value.length !== 6 || verifyOtp.isPending) return
    verifyOtp.mutate(
      { mobile: sentTo, code: value },
      {
        onSuccess: ({ verificationToken }) =>
          onVerified({ mobile: sentTo, token: verificationToken }),
      }
    )
  }

  const error = (sentTo ? verifyOtp.error : null) ?? sendOtp.error

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (sentTo && sentTo === e164) verify(code)
        else send()
      }}
    >
      {expired && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-2xs/relaxed text-amber-800 dark:text-amber-300">
          Your verification ran out before saving. Verify your number again —
          the changes you made are kept on this device.
        </p>
      )}
      <Field label="Contact mobile number" required error={numberError}>
        <PhoneInput
          id="edit-mobile"
          countryCode={country}
          placeholder="9876543210"
          invalid={!!numberError}
          codeProps={{
            value: country,
            onChange: (e) => setCountry(e.target.value),
          }}
          numberProps={{
            value: mobile,
            onChange: (e) => {
              setMobile(e.target.value)
              setNumberError(undefined)
            },
          }}
        />
      </Field>

      {sentTo && sentTo === e164 ? (
        <div className="flex flex-col gap-2">
          <p className="text-2xs/relaxed text-muted-foreground">
            Enter the code sent on WhatsApp to{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatMobile(sentTo)}
            </span>
            .
          </p>
          <div className="flex items-stretch gap-2">
            <Input
              id="edit-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={6}
              value={code}
              aria-label="Verification code"
              aria-invalid={!!verifyOtp.error}
              className="max-w-40 tracking-[0.3em] tabular-nums placeholder:tracking-normal"
              autoFocus
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 6)
                setCode(digits)
                verifyOtp.reset()
                if (digits.length === 6) verify(digits)
              }}
            />
            <Button
              type="submit"
              size="lg"
              disabled={code.length !== 6 || verifyOtp.isPending}
            >
              {verifyOtp.isPending && (
                <RiLoader4Line className="animate-spin" />
              )}
              Verify
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs/relaxed">
            <button
              type="button"
              onClick={send}
              disabled={sendOtp.isPending}
              className="text-primary hover:underline"
            >
              Resend code
            </button>
            {devCode && (
              <DevCodeNote code={devCode} />
            )}
          </div>
        </div>
      ) : (
        <Button
          type="submit"
          size="lg"
          disabled={sendOtp.isPending}
          className="self-start"
        >
          {sendOtp.isPending ? (
            <RiLoader4Line className="animate-spin" />
          ) : (
            <RiWhatsappLine />
          )}
          Send code on WhatsApp
        </Button>
      )}

      {error && (
        <p className="text-2xs/relaxed text-destructive">{error.message}</p>
      )}
    </form>
  )
}
