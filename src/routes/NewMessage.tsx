import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiSendPlaneLine,
} from "@remixicon/react"
import { cn } from "cn"
import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { PageHeader } from "@/components/layout/AppShell"
import { LoadError } from "@/components/LoadError"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { Field, Textarea } from "@/components/ui/input"
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives"
import { NativeSelect } from "@/components/ui/select"
import {
  useEstimate,
  useSendBroadcast,
  useTemplateCatalogue,
  type BroadcastInput,
  type Estimate,
  type TemplateCatalogue,
  type VariableSource,
  type VariableSpec,
} from "@/features/broadcasts/api"
import { MessageBubble } from "@/features/broadcasts/components"
import {
  CATEGORY_NAMES,
  LANGUAGE_NAMES,
  cleanParam,
  renderBody,
  showNumber,
  valueFor,
} from "@/features/broadcasts/format"
import { useRegistrations } from "@/features/registrations/api"
import { Chip, FilterPicker } from "@/features/reports/FilterBar"
import {
  FILTERS,
  STATUS_SETS,
  applyReport,
  describeReport,
  filterValueLabel,
  readReport,
  withFlightDays,
  writeReport,
  type Person,
  type Report,
} from "@/features/reports/model"

const number = new Intl.NumberFormat("en-IN")
const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

/** People listed under "See who". The send itself always covers everyone. */
const SHOWN_PEOPLE = 100

/** Digits only, the way the server compares numbers. */
const digitsOf = (mobile: string) => mobile.replace(/\D/g, "")

/**
 * Who it goes to, as the server will decide it: everyone picked who has a
 * mobile, each number once, the first person with it named. The server
 * repeats this from the registrations themselves; this copy is for the count.
 */
function recipientsOf(people: Person[]) {
  const seen = new Set<string>()
  const recipients: Person[] = []
  let noNumber = 0
  let duplicate = 0
  for (const person of people) {
    const mobile = person.member.mobile
    if (!mobile) {
      noNumber++
      continue
    }
    const digits = digitsOf(mobile)
    if (seen.has(digits)) {
      duplicate++
      continue
    }
    seen.add(digits)
    recipients.push(person)
  }
  return { recipients, noNumber, duplicate }
}

/** What fills each blank when a template is first picked. */
function defaultVariables(
  catalogue: TemplateCatalogue,
  template: string,
  count: number
): VariableSpec[] {
  // The announcement: "Jay Shree Swaminarayan {{1}}, … {{2}}" — name, then the text.
  if (template === catalogue.announcement && count === 2) {
    return [{ source: "firstName" }, { source: "text", text: "" }]
  }
  return Array.from({ length: count }, () => ({ source: "text", text: "" }))
}

function ConfirmDialog({
  estimate,
  onClose,
  onSend,
  sending,
  error,
}: {
  estimate: Estimate | null
  onClose: () => void
  onSend: () => void
  sending: boolean
  error?: string
}) {
  if (!estimate) return null
  const { skipped } = estimate
  const left = [
    skipped.noNumber && `${number.format(skipped.noNumber)} without a number`,
    skipped.duplicate &&
      `${number.format(skipped.duplicate)} sharing a number already on the list`,
    skipped.invalid &&
      `${number.format(skipped.invalid)} with a number WhatsApp can't use`,
    skipped.notFound &&
      `${number.format(skipped.notFound)} no longer registered`,
  ].filter(Boolean)
  const overLimit = estimate.total > estimate.dailyLimit

  return (
    <Dialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader
          title={`Send to ${number.format(estimate.total)} ${estimate.total === 1 ? "number" : "numbers"}?`}
        />
        <DialogBody className="gap-3">
          <p className="text-xs/relaxed">
            About{" "}
            <span className="font-medium">
              {rupees.format(estimate.costInr)} + GST
            </span>{" "}
            ({CATEGORY_NAMES[estimate.category] ?? estimate.category}), billed
            by Meta to the card on the WhatsApp account. It can't be unsent.
          </p>
          {left.length > 0 && (
            <p className="text-2xs/relaxed text-muted-foreground">
              Left out: {left.join(" · ")}.
            </p>
          )}
          {overLimit && (
            <p className="rounded-md bg-amber-500/10 p-2.5 text-2xs/relaxed text-amber-800 dark:text-amber-300">
              Meta lets this number message about{" "}
              {number.format(estimate.dailyLimit)} different people a day.
              Messages past that fail, and the send pauses after 10 failures in
              a row. Consider narrowing the filters, or sending over several
              days.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <p className="text-2xs text-muted-foreground">
              What {estimate.previewFor} will get:
            </p>
            <MessageBubble body={estimate.preview} />
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            size="lg"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button size="lg" onClick={onSend} disabled={sending}>
            <RiSendPlaneLine />
            {sending ? "Starting…" : `Send to ${number.format(estimate.total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `/admin/messages/new`: one WhatsApp template to the registered devotees the
 * filters pick — the same filters as Reports, kept in the URL so a report can
 * be opened here as it is. Admin only. Every person with a mobile gets it
 * once; dummy registrations never.
 */
export function NewMessage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Dummy registrations are never messaged: their numbers are made up.
  const report = React.useMemo(
    () => ({ ...readReport(params), dummy: false }),
    [params]
  )
  const setReport = (next: Partial<Report>) =>
    setParams(writeReport({ ...report, ...next, dummy: false, name: null }), {
      replace: true,
    })
  const [picker, setPicker] = React.useState<string | null>(null)
  const [showPeople, setShowPeople] = React.useState(false)

  const registrations = useRegistrations()
  const catalogue = useTemplateCatalogue()

  const everyone = React.useMemo(
    () =>
      (registrations.data ?? []).flatMap((registration) =>
        registration.members.map((member) => ({ registration, member }))
      ),
    [registrations.data]
  )
  const filters = React.useMemo(
    () => withFlightDays(FILTERS, everyone),
    [everyone]
  )
  const people = React.useMemo(
    () => applyReport(registrations.data ?? [], report),
    [registrations.data, report]
  )
  const { recipients, noNumber, duplicate } = React.useMemo(
    () => recipientsOf(people),
    [people]
  )

  // The message: which template, in which language, filled how.
  const [templateName, setTemplateName] = React.useState("")
  const [languageCode, setLanguageCode] = React.useState("")
  const [variables, setVariables] = React.useState<VariableSpec[]>([])
  const templates = catalogue.data?.templates ?? []
  const template =
    templates.find((t) => t.name === templateName) ?? templates[0]
  const language =
    template?.languages.find((l) => l.code === languageCode) ??
    template?.languages.find((l) => l.code === "en") ??
    template?.languages[0]

  // Picking a template (or one loading for the first time) resets its blanks.
  const blanksKey = `${template?.name}:${language?.variables}`
  const [shapedFor, setShapedFor] = React.useState("")
  if (catalogue.data && template && language && shapedFor !== blanksKey) {
    setShapedFor(blanksKey)
    setVariables(
      defaultVariables(catalogue.data, template.name, language.variables)
    )
  }

  const setVariable = (index: number, spec: VariableSpec) =>
    setVariables((current) =>
      current.map((value, i) => (i === index ? spec : value))
    )

  const missingText = variables.some(
    (v) => v.source === "text" && !cleanParam(v.text)
  )
  const first = recipients[0]
  const preview =
    language &&
    renderBody(
      language.body,
      variables.map((spec) =>
        first
          ? valueFor(spec, first.registration, first.member)
          : spec.source === "text"
            ? cleanParam(spec.text) || "…"
            : `[${catalogue.data?.sources[spec.source] ?? spec.source}]`
      )
    )

  const estimate = useEstimate()
  const send = useSendBroadcast()
  const input = (): BroadcastInput | null =>
    template && language
      ? {
          template: template.name,
          language: language.code,
          variables,
          picks: recipients.map(({ registration, member }) => ({
            registrationId: registration.id,
            memberId: member.id,
          })),
          summary: describeReport(report, filters).join(" · "),
        }
      : null
  const [confirming, setConfirming] = React.useState(false)

  const review = () => {
    const body = input()
    if (!body) return
    send.reset()
    estimate.mutate(body, { onSuccess: () => setConfirming(true) })
  }
  const start = () => {
    const body = input()
    if (!body) return
    send.mutate(body, {
      onSuccess: ({ id }) => navigate(`/admin/messages/${id}`),
    })
  }

  const header = (
    <PageHeader
      title="New message"
      description="Pick the devotees with filters, choose the message, and send it on WhatsApp."
      actions={
        <Link
          to="/admin/messages"
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          <RiArrowLeftLine />
          All sends
        </Link>
      }
    />
  )

  if (registrations.isError || catalogue.isError) {
    const error = registrations.error ?? catalogue.error
    return (
      <>
        {header}
        <LoadError
          title={
            catalogue.isError
              ? "Could not load the WhatsApp templates"
              : "Could not load registrations"
          }
          error={error}
          onRetry={() => {
            void registrations.refetch()
            void catalogue.refetch()
          }}
        />
      </>
    )
  }

  return (
    <>
      {header}

      {/* 1 — who */}
      <Card className="gap-3">
        <h2 className="font-heading text-sm font-medium">1. Who gets it</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            label="Registrations"
            value={STATUS_SETS[report.status].label}
            onEdit={() => setPicker("status")}
          />
          {filters
            .filter((f) => report.filters[f.key])
            .map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                value={filterValueLabel(f, report.filters[f.key])}
                onEdit={() => setPicker(f.key)}
                onRemove={() =>
                  setReport({ filters: { ...report.filters, [f.key]: "" } })
                }
              />
            ))}
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setPicker("")}
            className="text-primary"
          >
            <RiAddLine />
            Filter
          </Button>
        </div>

        {registrations.isPending ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-2xl font-semibold tabular-nums">
                {number.format(recipients.length)}
              </span>
              <span className="text-sm text-muted-foreground">
                WhatsApp {recipients.length === 1 ? "number" : "numbers"}
              </span>
            </p>
            <p className="text-2xs/relaxed text-muted-foreground tabular-nums">
              {number.format(people.length)}{" "}
              {people.length === 1 ? "person" : "people"} match
              {noNumber > 0 && ` · ${number.format(noNumber)} without a number`}
              {duplicate > 0 &&
                ` · ${number.format(duplicate)} share a number already counted`}
            </p>
            {recipients.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPeople((open) => !open)}
                className="mt-1 inline-flex w-fit items-center gap-1 text-2xs text-primary hover:underline"
              >
                <RiArrowDownSLine
                  className={cn(
                    "size-3.5 transition-transform",
                    showPeople && "rotate-180"
                  )}
                />
                {showPeople ? "Hide the list" : "See who"}
              </button>
            )}
            {showPeople && (
              <ul className="mt-1 divide-y divide-border rounded-md border border-border">
                {recipients
                  .slice(0, SHOWN_PEOPLE)
                  .map(({ registration, member }) => (
                    <li
                      key={`${registration.id}:${member.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-2xs"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{member.fullName}</span>
                        <span className="text-muted-foreground">
                          {registration.mandal} · {registration.code}
                        </span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {showNumber(digitsOf(member.mobile ?? ""))}
                      </span>
                    </li>
                  ))}
                {recipients.length > SHOWN_PEOPLE && (
                  <li className="px-3 py-2 text-2xs text-muted-foreground">
                    and {number.format(recipients.length - SHOWN_PEOPLE)} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* 2 — what */}
      <Card className="gap-3">
        <h2 className="font-heading text-sm font-medium">2. The message</h2>
        {catalogue.isPending ? (
          <Skeleton className="h-40" />
        ) : !template || !language ? (
          <EmptyState
            title="No message templates to send yet"
            description={`WhatsApp only lets us start a chat with a message Meta has approved. Create one in WhatsApp Manager → Message templates (Utility), or "${catalogue.data?.announcement}" for writing your own text, and it shows up here once approved.`}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Template">
                <NativeSelect
                  value={template.name}
                  onChange={(e) => {
                    setTemplateName(e.target.value)
                    setLanguageCode("")
                  }}
                >
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name === catalogue.data.announcement
                        ? `Your own text (${t.name})`
                        : t.name}
                      {" · "}
                      {CATEGORY_NAMES[t.category] ?? t.category}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Language"
                hint={
                  template.languages.length === 1
                    ? "This template is approved in one language only."
                    : undefined
                }
              >
                <NativeSelect
                  value={language.code}
                  onChange={(e) => setLanguageCode(e.target.value)}
                >
                  {template.languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {LANGUAGE_NAMES[l.code] ?? l.code}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            {variables.map((spec, index) => (
              <div
                key={`${blanksKey}:${index}`}
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <Field label={`Blank {{${index + 1}}}`}>
                  <NativeSelect
                    value={spec.source}
                    onChange={(e) => {
                      const source = e.target.value as VariableSource
                      setVariable(
                        index,
                        source === "text" ? { source, text: "" } : { source }
                      )
                    }}
                  >
                    {(
                      Object.entries(catalogue.data.sources) as [
                        VariableSource,
                        string,
                      ][]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                {spec.source === "text" && (
                  <>
                    <Textarea
                      rows={4}
                      maxLength={catalogue.data.maxTextLength}
                      value={spec.text}
                      onChange={(e) =>
                        setVariable(index, {
                          source: "text",
                          text: e.target.value,
                        })
                      }
                      placeholder="Type the message"
                      aria-label={`Text for blank ${index + 1}`}
                    />
                    <p className="flex justify-between gap-2 text-2xs/relaxed text-muted-foreground">
                      <span>
                        WhatsApp doesn't allow line breaks here; they become
                        spaces.
                      </span>
                      <span className="tabular-nums">
                        {spec.text.length}/{catalogue.data.maxTextLength}
                      </span>
                    </p>
                  </>
                )}
              </div>
            ))}

            <div className="flex flex-col gap-1.5">
              <p className="text-2xs text-muted-foreground">
                Preview
                {first ? `, as ${first.member.fullName} will get it` : ""}:
              </p>
              <MessageBubble
                header={language.header}
                body={preview ?? ""}
                footer={language.footer}
                buttons={language.buttons}
              />
            </div>
          </div>
        )}
      </Card>

      {/* 3 — send */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {estimate.error && (
          <p role="alert" className="text-xs text-destructive sm:mr-auto">
            {estimate.error.message}
          </p>
        )}
        <Button
          size="lg"
          onClick={review}
          disabled={
            !template ||
            recipients.length === 0 ||
            missingText ||
            estimate.isPending
          }
        >
          <RiSendPlaneLine />
          {estimate.isPending ? "Checking…" : "Review and send"}
        </Button>
      </div>
      {missingText && recipients.length > 0 && template && (
        <p className="-mt-2 text-right text-2xs text-muted-foreground">
          Type the text for every blank first.
        </p>
      )}

      <FilterPicker
        target={picker}
        onClose={() => setPicker(null)}
        filters={filters}
        report={report}
        dummyCount={0}
        onApply={setReport}
      />
      <ConfirmDialog
        estimate={confirming ? (estimate.data ?? null) : null}
        onClose={() => setConfirming(false)}
        onSend={start}
        sending={send.isPending}
        error={send.error?.message}
      />
    </>
  )
}
