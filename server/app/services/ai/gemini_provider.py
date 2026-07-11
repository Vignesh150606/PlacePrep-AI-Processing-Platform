"""
Gemini implementation of `AIProvider` (Step 3/4).

This is the *only* file in the codebase that imports the `google.genai`
SDK. Everything upstream (the pipeline, the API endpoints) talks to
`AIProvider`, not to Gemini -- see base.py for why.

PROMPT REDESIGN (Sprint 4 fix #2): the previous prompt asked for a JSON
array with the same fields but had three gaps that plausibly explained the
"extracts zero questions" bug report:
  1. No instruction covering the extremely common "questions in one section,
     answers in a separate Answer Key section" layout.
  2. No explicit "never skip a question" / "never summarize" instruction.
  3. No page_number field, so provenance was incomplete even for
     correctly-extracted questions.
This version fixes all three, and is chunk-aware (Sprint 4 fix #4) so a
single call is never asked to process more than one chunk's worth of text.
"""
import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.services.ai.base import (
    AIExtractionResult,
    AIProvider,
    AIProviderError,
    ExtractedOption,
    ExtractedQuestion,
)

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are an expert at extracting placement/interview \
preparation questions from raw text pulled out of a PDF or a photographed/\
scanned question paper (question papers, previous-year sets, interview \
experience writeups). You will be given ONE PORTION of a possibly larger \
document, and must extract every question that portion contains.

STRICT RULES -- follow all of them:
1. Extract EVERY multiple-choice question in the given text. Never skip one \
because it looks similar to a previous one, and never summarize a run of \
questions instead of extracting each ("the next 5 questions follow the same \
pattern" is NOT acceptable output -- extract all 5 individually).
2. Never invent a question, option, or answer that is not present in the \
source text.
3. If a separate "Answer Key" / "Answers" / "Solutions" section is provided \
below (under ANSWER KEY, if present), use it to determine each question's \
correct option by matching question numbers -- do not guess an answer from \
the question text alone if the key disagrees or the text alone is \
ambiguous. If a question's number has no entry in the answer key and the \
correct option truly cannot be determined, still include the question with \
your best-effort option marked correct but LOWER its confidence \
substantially (0.3 or below) to flag it for human review -- never omit the \
question entirely just because you're unsure of the answer.
4. Return ONLY a JSON array (no markdown fences, no prose before or after, \
no trailing commas). Each element must have EXACTLY this shape:

{
  "type": "mcq" | "multi-select" | "coding" | "subjective",
  "question_text": string,
  "options": [{"label": string, "text": string, "is_correct": boolean}],
  "correct_explanation": string | null,
  "topic": string | null,
  "subject": string | null,
  "difficulty": "easy" | "medium" | "hard",
  "company": string | null,
  "page_number": number | null,
  "tags": string[],
  "confidence": number between 0 and 1
}

FIELD NOTES:
- "options" is only for "mcq"/"multi-select" types; use an empty array for \
"coding"/"subjective".
- "confidence" reflects YOUR certainty that question_text, options, and the \
correct answer were all extracted accurately from the source text -- not \
how hard the question is. Lower it whenever the source text is garbled \
(e.g. OCR noise from a phone-photo upload), ambiguous, or the answer had to \
be inferred without a matching answer-key entry.
- "correct_explanation" should be filled from the source text if a \
rationale is given; otherwise null -- never fabricate a plausible-sounding \
explanation for a fact you're not extracting from the text.
- "subject" is a broad area (e.g. "Data Structures", "DBMS", "Aptitude"). \
"topic" is more specific (e.g. "Binary Trees", "Normalization").
- "page_number" is the 1-indexed page (within the FULL original document, \
not just this portion) the question appears to start on, if the text \
includes any page markers/headers/footers that let you infer it; otherwise \
null. Use the page-range hint given below as a sanity bound. For a single \
photographed/screenshotted image (not a multi-page PDF), always use 1.
- If the given text portion contains no extractable questions (e.g. it's \
purely an answer key, a cover page, or instructions), return [].
"""


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str):
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def extract_questions(
        self,
        *,
        document_text: str,
        source_hint: Optional[str] = None,
        chunk_index: int = 0,
        chunk_total: int = 1,
        page_offset_hint: Optional[str] = None,
        answer_key_text: Optional[str] = None,
    ) -> AIExtractionResult:
        prompt = self._build_prompt(
            document_text,
            source_hint=source_hint,
            chunk_index=chunk_index,
            chunk_total=chunk_total,
            page_offset_hint=page_offset_hint,
            answer_key_text=answer_key_text,
        )

        raw_text = await self._call_with_retry(prompt)
        parsed = self._parse_json_array(raw_text)

        questions: List[ExtractedQuestion] = []
        for item in parsed:
            question = self._coerce_question(item)
            if question is not None:
                questions.append(question)

        return AIExtractionResult(
            questions=questions,
            provider_name=self.name,
            model_name=self._model,
            raw_response_excerpt=raw_text[:2000] if raw_text else None,
        )

    def _build_prompt(
        self,
        document_text: str,
        *,
        source_hint: Optional[str],
        chunk_index: int,
        chunk_total: int,
        page_offset_hint: Optional[str],
        answer_key_text: Optional[str],
    ) -> str:
        truncated = document_text[:60_000]
        hint_line = f"Source filename: {source_hint}\n" if source_hint else ""
        chunk_line = (
            f"This is portion {chunk_index + 1} of {chunk_total} of the full document.\n"
            if chunk_total > 1
            else ""
        )
        page_line = f"Page-range hint for this portion: {page_offset_hint}\n" if page_offset_hint else ""
        key_block = (
            f"\nANSWER KEY (from elsewhere in the same document -- use this to determine correct options):\n\"\"\"\n{answer_key_text[:4000]}\n\"\"\"\n"
            if answer_key_text
            else ""
        )

        return (
            f"{_SYSTEM_PROMPT}\n\n"
            f"{hint_line}{chunk_line}{page_line}"
            f"{key_block}\n"
            f"Source text portion:\n\"\"\"\n{truncated}\n\"\"\""
        )

    async def _call_with_retry(self, prompt: str, attempt: int = 1) -> str:
        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=self._model,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
        except Exception as exc:  # noqa: BLE001 -- any SDK/network failure
            raise AIProviderError(f"Gemini request failed: {exc}") from exc

        text = getattr(response, "text", None)
        if not text:
            raise AIProviderError("Gemini returned an empty response.")

        if attempt == 1 and self._extract_json_array_text(text) is None:
            logger.warning("Gemini response was not valid JSON on first attempt; retrying once.")
            stricter = prompt + "\n\nReminder: respond with ONLY the raw JSON array, nothing else."
            return await self._call_with_retry(stricter, attempt=2)

        return text

    @staticmethod
    def _extract_json_array_text(text: str) -> Optional[str]:
        stripped = text.strip()
        stripped = re.sub(r"^```(json)?", "", stripped).strip()
        stripped = re.sub(r"```$", "", stripped).strip()
        try:
            json.loads(stripped)
            return stripped
        except json.JSONDecodeError:
            return None

    def _parse_json_array(self, raw_text: str) -> List[Dict[str, Any]]:
        cleaned = self._extract_json_array_text(raw_text)
        if cleaned is None:
            raise AIProviderError("Gemini response was not valid JSON after retry.")

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise AIProviderError(f"Failed to parse Gemini JSON: {exc}") from exc

        if not isinstance(data, list):
            raise AIProviderError("Gemini response JSON was not an array.")

        return data

    def _coerce_question(self, item: Dict[str, Any]) -> Optional[ExtractedQuestion]:
        try:
            options = [
                ExtractedOption(
                    label=str(opt.get("label", "")),
                    text=str(opt.get("text", "")),
                    is_correct=bool(opt.get("is_correct", False)),
                )
                for opt in item.get("options", []) or []
                if isinstance(opt, dict)
            ]
            page_number = item.get("page_number")
            return ExtractedQuestion(
                type=item.get("type", "mcq"),
                question_text=item.get("question_text", ""),
                options=options,
                correct_explanation=item.get("correct_explanation"),
                topic=item.get("topic"),
                subject=item.get("subject"),
                difficulty=item.get("difficulty", "medium"),
                company=item.get("company"),
                page_number=int(page_number) if isinstance(page_number, (int, float)) else None,
                tags=[str(t) for t in item.get("tags", []) or []],
                confidence=float(item.get("confidence", 0.5)),
            )
        except (ValidationError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed extracted question: %s", exc)
            return None
