import * as React from "react"
import { Link, useSearchParams } from "react-router"

import { PublicHeader } from "@/components/layout/PublicHeader"
import { Button } from "@/components/ui/button"
import { RegistrationConfirmation } from "@/features/registrations/components"
import { RegistrationForm } from "@/features/registrations/form/RegistrationForm"
import type { Registration } from "@/features/registrations/types"
import { useT } from "@/i18n/context"
import { LanguagePicker, LanguageProvider } from "@/i18n/LanguageProvider"

/**
 * The public registration page devotees open from a shared link. No sign-in:
 * asking a grandmother in Rajkot to create an account first is how a
 * registration ends up on a paper slip instead.
 */
export function Register() {
  return (
    <LanguageProvider>
      <RegisterPage />
    </LanguageProvider>
  )
}

/** Most devotees read Gujarati first: the page offers it at the top. */
function RegisterPage() {
  const { t } = useT()
  const [, setParams] = useSearchParams()
  const [saved, setSaved] = React.useState<Registration>()
  const [formKey, setFormKey] = React.useState(0)

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader
        eyebrow={t("Registration open")}
        action={<LanguagePicker />}
      >
        <p className="max-w-prose text-xs/relaxed text-muted-foreground">
          {t(
            "Register yourself or your family. Add every person who is coming, including children, so the hosts can plan meals, seating and stay for everyone."
          )}
        </p>
        <p className="text-xs/relaxed text-muted-foreground">
          {t("Already registered?")}{" "}
          <Link
            to="/register/edit"
            className="font-medium text-primary hover:underline"
          >
            {t("Update your registration")}
          </Link>
        </p>
      </PublicHeader>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-5 sm:px-6 sm:py-6">
        {saved ? (
          <RegistrationConfirmation
            registration={saved}
            actions={
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setSaved(undefined)
                  setFormKey((k) => k + 1)
                  setParams({}, { replace: true })
                }}
              >
                {t("Register another person or family")}
              </Button>
            }
          />
        ) : (
          <RegistrationForm
            key={formKey}
            source="self"
            onRegistered={setSaved}
          />
        )}
      </main>
    </div>
  )
}
