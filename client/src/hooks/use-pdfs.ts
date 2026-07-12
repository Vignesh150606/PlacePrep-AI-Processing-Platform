import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PDFResource, PdfProcessingStatus } from "@placeprep/shared";
import { apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api-client";

interface PdfListResponse {
  items: PDFResource[];
  total: number;
}

const HAS_IN_FLIGHT_JOB = (items: PDFResource[] | undefined) =>
  (items ?? []).some((p) => p.processingStatus === "queued" || p.processingStatus === "processing");

/** Phase 7: optional `status` filter so the admin "Pending Approval" queue
 * can query just that slice instead of filtering a full page client-side.
 * Polling still applies while anything in the current view is in flight. */
export function usePdfs(status?: PdfProcessingStatus) {
  return useQuery({
    queryKey: ["pdfs", status ?? "all"],
    queryFn: () => apiGet<PdfListResponse>(status ? `/pdfs?status=${status}` : "/pdfs"),
    refetchInterval: (query) => (HAS_IN_FLIGHT_JOB(query.state.data?.items) ? 3000 : false),
  });
}

export function useUploadPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; title?: string; description?: string; companyId?: string }) => {
      const formData = new FormData();
      formData.append("file", input.file);
      if (input.title) formData.append("title", input.title);
      if (input.description) formData.append("description", input.description);
      if (input.companyId) formData.append("company_id", input.companyId);
      return apiUpload<PDFResource>("/pdfs/upload", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdfs"] });
    },
  });
}

/** Phase 7: admin approves a pending-approval upload -- this is what
 * actually starts AI extraction (see server module docstring). */
export function useApprovePdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pdfId: string) => apiPost<PDFResource>(`/pdfs/${pdfId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdfs"] });
      queryClient.invalidateQueries({ queryKey: ["processing"] });
    },
  });
}

/** Phase 7: admin rejects a pending-approval upload with a required reason. */
export function useRejectPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pdfId, reason }: { pdfId: string; reason: string }) =>
      apiPost<PDFResource>(`/pdfs/${pdfId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdfs"] });
    },
  });
}

export function useRetryPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pdfId: string) => apiPost<PDFResource>(`/pdfs/${pdfId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdfs"] });
      queryClient.invalidateQueries({ queryKey: ["processing"] });
    },
  });
}

export function useSetKeepPermanent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pdfId, keepPermanent }: { pdfId: string; keepPermanent: boolean }) =>
      apiPatch<PDFResource>(`/pdfs/${pdfId}/keep-permanent`, { keepPermanent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdfs"] });
    },
  });
}
