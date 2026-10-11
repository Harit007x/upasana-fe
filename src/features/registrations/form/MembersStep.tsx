import { RiAddLine, RiCheckLine, RiDeleteBinLine } from "@remixicon/react"
import * as React from "react"
import { useFieldArray, useFormContext } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/choice"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { DigitsInput, Field, Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/primitives"
import { PhoneInput } from "@/components/ui/phone-input"
import { NativeSelect } from "@/components/ui/select"
import { DEFAULT_COUNTRY_CODE, formatMobile, toE164 } from "@/lib/phone"

import { GENDERS, RELATIONS } from "../types"
import { MobileVerification } from "./MobileVerification"
import { matchGenderToRelation } from "./relation"
import { useFormOptions } from "./form-options"
import {
  emptyMember,
  relationAgeHints,
  type MemberFormValues,
  type RegistrationFormValues,
} from "./schema"

/** Whether a card has anything typed into it — an empty one is removed without asking. */
const isFilledIn = (member: MemberFormValues | undefined) =>
  !!member &&
  !!(
    member.fullName.trim() ||
    member.age ||
    member.gender ||
    member.mobile ||
    member.relation
  )

/** Step 2: one card per person. The first person is the contact for the whole booking. */
export function MembersStep() {
  const {
    control,
    register,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<RegistrationFormValues>()

  // "Gender changed to Male" under the person whose relation just set it, for
  // three seconds. Keyed by the card's id, not its index, so removing someone
  // above cannot move the note onto the wrong person.
  // A new note (a fresh object) restarts the three seconds.
  const [genderNote, setGenderNote] = React.useState<{
    id: string
    text: string
  }>()
  React.useEffect(() => {
    if (!genderNote) return
    const timer = setTimeout(() => setGenderNote(undefined), 3000)
    return () => clearTimeout(timer)
  }, [genderNote])

  const onRelationChange = (index: number, id: string, relation: string) => {
    const gender = matchGenderToRelation(
      { getValues, setValue },
      index,
      relation
    )
    if (gender)
      setGenderNote({ id, text: `Gender changed to ${GENDERS[gender]}` })
  }
  const { fields, append, remove } = useFieldArray({ control, name: "members" })
  const type = watch("type")
  const members = watch("members")

  const listError = errors.members?.message ?? errors.members?.root?.message

  const { mode } = useFormOptions()
  // Remove asks first once a card has details in it: one tap should not lose
  // a person's name, age and number.
  const [removing, setRemoving] = React.useState<number>()
  const askRemove = (index: number) =>
    isFilledIn(getValues(`members.${index}`))
      ? setRemoving(index)
      : remove(index)
  const ageHints = relationAgeHints({ type, members })

  const addMember = () => {
    // A new person inherits the party's dates if someone has already split
    // them, so the per-person table on the next step is not half empty.
    const first = getValues("members.0")
    append({
      ...emptyMember(),
      arrivalDate: first?.arrivalDate ?? "",
      arrivalSlot: first?.arrivalSlot ?? "",
      departureDate: first?.departureDate ?? "",
      departureSlot: first?.departureSlot ?? "",
      arrivalMeal: first?.arrivalMeal ?? "",
      departureMeal: first?.departureMeal ?? "",
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs/relaxed text-muted-foreground">
        {type === "individual"
          ? "Your details as they appear on your ID."
          : "Add everyone who is coming, including children. The first person is the contact for this registration."}
      </p>

      {fields.map((field, index) => {
        const memberErrors = errors.members?.[index]
        const isPrimary = index === 0
        return (
          <fieldset
            key={field.id}
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <legend className="sr-only">Person {index + 1}</legend>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-heading text-xs font-medium">
                  {members[index]?.fullName || `Person ${index + 1}`}
                </span>
                {isPrimary && <Badge>Primary contact</Badge>}
              </div>
              {!isPrimary && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => askRemove(index)}
                  aria-label={`Remove person ${index + 1}`}
                >
                  <RiDeleteBinLine />
                  Remove
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field
                label="Full name"
                required
                error={memberErrors?.fullName?.message}
                className="col-span-2"
              >
                <Input
                  id={`members.${index}.fullName`}
                  placeholder="First and last name"
                  autoComplete={isPrimary ? "name" : "off"}
                  aria-invalid={!!memberErrors?.fullName}
                  {...register(`members.${index}.fullName`)}
                />
              </Field>
              <Field
                label="Gender"
                required
                error={memberErrors?.gender?.message}
              >
                <NativeSelect
                  id={`members.${index}.gender`}
                  aria-invalid={!!memberErrors?.gender}
                  {...register(`members.${index}.gender`)}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {Object.entries(GENDERS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                {/* role="status" so a screen reader announces the change too. */}
                <p
                  role="status"
                  className="min-h-0 text-2xs/relaxed text-primary empty:hidden"
                >
                  {genderNote?.id === field.id && (
                    <span className="inline-flex items-center gap-1">
                      <RiCheckLine className="size-3 shrink-0" />
                      {genderNote.text}
                    </span>
                  )}
                </p>
              </Field>
              <Field label="Age" required error={memberErrors?.age?.message}>
                <DigitsInput
                  id={`members.${index}.age`}
                  maxLength={3}
                  placeholder="Years"
                  aria-invalid={!!memberErrors?.age}
                  {...register(`members.${index}.age`)}
                />
              </Field>

              {isPrimary && mode === "edit-self" ? (
                // Changing the contact's number online would let anyone with
                // the old number hand the booking to another. The desk can.
                <Field
                  label="Mobile"
                  hint="To change the contact number, ask your mandal sanchalak or the desk."
                  className="col-span-2"
                >
                  <Input
                    id={`members.${index}.mobile`}
                    readOnly
                    aria-readonly
                    className="bg-muted/50 tabular-nums"
                    value={
                      members[0]?.mobile
                        ? formatMobile(
                            toE164(members[0].mobileCountry, members[0].mobile)
                          )
                        : ""
                    }
                  />
                </Field>
              ) : (
                <Field
                  label={isPrimary ? "Mobile" : "Mobile (optional)"}
                  required={isPrimary}
                  error={memberErrors?.mobile?.message}
                  className="col-span-2"
                >
                  <PhoneInput
                    id={`members.${index}.mobile`}
                    countryCode={
                      members[index]?.mobileCountry ?? DEFAULT_COUNTRY_CODE
                    }
                    placeholder="9876543210"
                    invalid={!!memberErrors?.mobile}
                    // A number valid for one country can be wrong for the next;
                    // after Continue, relatedFields re-checks it on a code change.
                    codeProps={register(`members.${index}.mobileCountry`)}
                    numberProps={register(`members.${index}.mobile`)}
                  />
                </Field>
              )}

              {type === "family" && !isPrimary && (
                <Field
                  label="Relation to primary contact (optional)"
                  error={memberErrors?.relation?.message}
                  className="col-span-2"
                >
                  <NativeSelect
                    id={`members.${index}.relation`}
                    aria-invalid={!!memberErrors?.relation}
                    {...register(`members.${index}.relation`, {
                      // Son, Mother, …: set the gender to match instead of
                      // flagging it. Runs before the field is validated, so
                      // the relation never shows a mismatch for this.
                      onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                        onRelationChange(index, field.id, event.target.value),
                    })}
                  >
                    {/* Selectable, not a disabled placeholder, so a pick can be undone. */}
                    <option value="">Not specified</option>
                    {RELATIONS.map((relation) => (
                      <option key={relation} value={relation}>
                        {relation}
                      </option>
                    ))}
                  </NativeSelect>
                  {/* A hint, not an error: usually a typo, never a reason to block. */}
                  {!memberErrors?.relation && ageHints.get(index) && (
                    <p className="text-2xs/relaxed text-amber-700 dark:text-amber-400">
                      {ageHints.get(index)}
                    </p>
                  )}
                </Field>
              )}
            </div>

            {isPrimary && mode !== "edit-self" && <MobileVerification />}

            <Checkbox
              id={`members.${index}.needsAssistance`}
              label="Needs special assistance"
              description="Senior, wheelchair, medical condition or diet the hosts should plan for."
              {...register(`members.${index}.needsAssistance`)}
            />
            {members[index]?.needsAssistance && (
              <Input
                id={`members.${index}.assistanceNote`}
                placeholder="e.g. Wheelchair user, needs a ground-floor room"
                aria-label="Assistance details"
                {...register(`members.${index}.assistanceNote`)}
              />
            )}
          </fieldset>
        )
      })}

      {listError && (
        <p className="text-2xs/relaxed text-destructive">{listError}</p>
      )}

      {type !== "individual" && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={addMember}
          className="self-start"
        >
          <RiAddLine />
          Add another person
        </Button>
      )}

      <Dialog
        open={removing !== undefined}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <DialogContent>
          <DialogHeader
            title={`Remove ${(removing !== undefined && members[removing]?.fullName.trim()) || `person ${(removing ?? 0) + 1}`}?`}
            description="Their details are taken off this registration."
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setRemoving(undefined)}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              size="lg"
              onClick={() => {
                if (removing !== undefined) remove(removing)
                setRemoving(undefined)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
