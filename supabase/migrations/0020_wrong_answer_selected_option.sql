-- =============================================================================
-- PlacePrep -- Wrong Answer Notebook: track the student's last selected
-- (wrong) option, so the notebook can show "Your answer" alongside the
-- correct one instead of only aggregate miss counts.
-- Run AFTER 0019. Safe to re-run.
-- =============================================================================
--
-- `wrong_answer_marks` has always been a pure tally (times_wrong,
-- last_attempt_at, resolved) -- it never stored WHICH option the student
-- picked, even though that's captured per-response in
-- `quiz_attempts.responses` (jsonb) at submission time. This adds a place
-- to persist it so the Wrong Answer Notebook can show "Selected answer"
-- without an N+1 fetch back into `quiz_attempts` per entry (see
-- `api/v1/endpoints/quizzes.py::submit_quiz`, which already loops over
-- every wrong response once to build the `wrong_answer_marks` upsert --
-- this just adds one more field to that same, already-batched write).

alter table public.wrong_answer_marks
  add column if not exists last_selected_option_ids jsonb not null default '[]'::jsonb;

comment on column public.wrong_answer_marks.last_selected_option_ids is
  'question_options.id values the student picked on their most recent wrong attempt of this question (usually one, more if it was multi-select). Empty array for entries recorded before this column existed.';
