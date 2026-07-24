import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BulkParseResponse,
  Question,
  QuestionAuthoringInput,
  QuestionImportBatch,
} from "@placeprep/shared";
import { apiGet, apiPost, apiPatch, apiUpload } from "@/lib/api-client";

interface QuestionListResponse {
  items: Question[];
  total: number;
}

interface AssetUploadResponse {
  url: string;
  fileName: string;
  fileSizeBytes: number;
}

export interface BulkImportItemResult {
  index: number;
  imported: boolean;
  questionId?: string;
  reason?: string;
}

export interface BulkImportResponse {
  batchId: string;
  totalSubmitted: number;
  totalImported: number;
  totalDuplicate: number;
  totalError: number;
  results: BulkImportItemResult[];
}

/** Phase 13 -- Draft Management: the admin's own Manual Builder drafts. */
export function useMyDrafts() {
  return useQuery({
    queryKey: ["questions", "mine", "draft"],
    queryFn: () => apiGet<QuestionListResponse>("/questions?mine=true&status=draft"),
    staleTime: 10_000,
  });
}

/** Phase 13 -- My Submissions: a student's own questions, any status. */
export function useMySubmissions() {
  return useQuery({
    queryKey: ["questions", "mine", "all"],
    queryFn: () => apiGet<QuestionListResponse>("/questions?mine=true"),
    staleTime: 10_000,
  });
}

export function useUploadQuestionAsset() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload<AssetUploadResponse>("/questions/assets", formData);
    },
  });
}

export function useCreateManualQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionAuthoringInput & { publish: boolean }) =>
      apiPost<Question>("/questions", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions"] }),
  });
}

export function usePublishDraftQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch<Question>(`/questions/${id}/publish`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions"] }),
  });
}

export function useSubmitQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionAuthoringInput) => apiPost<Question>("/questions/submissions", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions"] }),
  });
}

export function useBulkParseQuestions() {
  return useMutation({
    mutationFn: (rawText: string) => apiPost<BulkParseResponse>("/questions/bulk-parse", { rawText }),
  });
}

export function useBulkImportQuestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { items: QuestionAuthoringInput[]; label?: string | null }) =>
      apiPost<BulkImportResponse>("/questions/bulk-import", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions"] }),
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ["questions", "import-batches"],
    queryFn: () => apiGet<QuestionImportBatch[]>("/questions/import-batches"),
    staleTime: 10_000,
  });
}
