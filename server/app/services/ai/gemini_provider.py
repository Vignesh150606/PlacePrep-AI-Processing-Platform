"""
Gemini implementation of `AIProvider` (Step 3/4).

This is the *only* file in the codebase that imports the `google.genai`
SDK. Everything upstream (the pipeline, the API endpoints) talks to
`AIProvider`, not to Gemini — see base.py for why.
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
preparation questions from raw text pulled out of a PDF (question papers, \
previous-year sets, interview experience writeups).

Return ONLY a JSON array (no markdown fences, no prose before or after). \
Each element must have exactly this shape:

{
  "type": "mcq" | "multi-select" | "coding" | "subjective",
  "question_text": string,
  "options": [{"label": string, "text": string, "is_correct": boolean}],
  "correct_explanation": string | null,
  "topic": string | null,
  "subject": string | null,
  "difficulty": "easy" | "medium" | "hard",
  "company": string | null,
  "tags": string[],
  "confidence": number between 0 and 1
}

Rules:
- "options" is only for "mcq"/"multi-select" types; use an empty array for \
"coding"/"subjective".
- "confidence" reflects YOUR certainty that question_text, options, and the \
correct answer were all extracted accurately from the source text — not \
how hard the question is. Lower it whenever the source text is garbled, \
ambiguous, or you had to guess at a correct option.
- "subject" is a broad area (e.g. "Data Structures", "DBMS", "Aptitude"). \
"topic" is more specific (e.g. "Binary Trees", "Normalization").
- If the text contains no extractable questions, return [].
- Never invent questions that are not present in the source text.
"""


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str):
        # Imported lazily so the whole app doesn't fail to boot if the
        # google-genai package is present but no key is configured yet —
        # AIService itself already guards on `settings.is_ai_configured`
        # before ever constructing this class.
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def extract_questions(
        self, *, document_text: str, source_hint: Optional[str] = None
    ) -> AIExtractionResult:
        prompt = self._build_prompt(document_text, source_hint)

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

    def _build_prompt(self, document_text: str, source_hint: Optional[str]) -> str:
        # Gemini Flash's context window comfortably fits a normal question
        # paper, but truncate defensively — an oversized prompt should
        # degrade to "extract what fits", never crash the request.
        truncated = document_text[:60_000]
        hint_line = f"Source filename: {source_hint}\n" if source_hint else ""
        return f"{_SYSTEM_PROMPT}\n\n{hint_line}Source text:\n\"\"\"\n{truncated}\n\"\"\""

    async def _call_with_retry(self, prompt: str, attempt: int = 1) -> str:
        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=self._model,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
        except Exception as exc:  # noqa: BLE001 — any SDK/network failure
            raise AIProviderError(f"Gemini request failed: {exc}") from exc

        text = getattr(response, "text", None)
        if not text:
            raise AIProviderError("Gemini returned an empty response.")

        # One internal retry with a stricter reminder if the model wrapped
        # the JSON in prose/markdown despite the JSON response_mime_type —
        # this happens occasionally and is worth one extra call before
        # surfacing a hard failure to the pipeline (Step 5: "retry when
        # appropriate").
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
            return ExtractedQuestion(
                type=item.get("type", "mcq"),
                question_text=item.get("question_text", ""),
                options=options,
                correct_explanation=item.get("correct_explanation"),
                topic=item.get("topic"),
                subject=item.get("subject"),
                difficulty=item.get("difficulty", "medium"),
                company=item.get("company"),
                tags=[str(t) for t in item.get("tags", []) or []],
                confidence=float(item.get("confidence", 0.5)),
            )
        except (ValidationError, TypeError, ValueError) as exc:
            logger.warning("Skipping malformed extracted question: %s", exc)
            return None
