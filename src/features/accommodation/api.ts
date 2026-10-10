import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

import type { AccommodationData, Allotment, Place, PlaceInput } from "./types"

/**
 * Accommodation data from upasana-be, through React Query.
 *
 *   GET    /accommodation                          desk roles; one mandal for a sanchalak
 *   POST   /accommodation/allotments               staff, admin
 *   POST   /accommodation/allotments/release       staff, admin
 *   POST   /accommodation/registrations/:id/notice staff, admin
 *   POST   /accommodation/notices/send-all         staff, admin
 *   POST/PATCH/DELETE /accommodation/places        admin
 *
 * Everything lives under one query: the screens need places, allotments and
 * notices together, and any change can touch all three.
 */

const key = ["accommodation"] as const

export function useAccommodation() {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<AccommodationData>("/accommodation"),
  })
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: key })
}

export function useAllot() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: {
      registrationId: string
      memberIds: string[]
      placeId: string
      roomId: string
    }) => api.post<Allotment[]>("/accommodation/allotments", input),
    onSuccess: refresh,
  })
}

export function useRelease() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: { registrationId: string; memberIds: string[] }) =>
      api.post<Allotment[]>("/accommodation/allotments/release", input),
    onSuccess: refresh,
  })
}

export type NoticeResult =
  | { sent: true; channel: "whatsapp" | "manual" }
  /** WhatsApp is not set up on the server: send it from your own phone. */
  | { sent: false; message: string; whatsappUrl: string }

/** Sends one registration its room details; `manual` records one sent by hand. */
export function useSendNotice() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ registrationId, manual }: { registrationId: string; manual?: boolean }) =>
      api.post<NoticeResult>(`/accommodation/registrations/${registrationId}/notice`, {
        manual: !!manual,
      }),
    onSuccess: refresh,
  })
}

export function useSendAllNotices() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: () =>
      api.post<{ sent: number; failed: string[]; incomplete: number }>(
        "/accommodation/notices/send-all"
      ),
    onSuccess: refresh,
  })
}

/** Adds a place (no `id`) or saves changes to one. */
export function useSavePlace(id?: string) {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: PlaceInput) =>
      id
        ? api.patch<Place>(`/accommodation/places/${id}`, input)
        : api.post<Place>("/accommodation/places", input),
    onSuccess: refresh,
  })
}

export function useDeletePlace() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/accommodation/places/${id}`),
    onSuccess: refresh,
  })
}
