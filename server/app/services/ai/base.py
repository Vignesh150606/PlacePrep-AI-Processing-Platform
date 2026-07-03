"""
Abstract AI provider interface (Step 2 of the AI Processing Platform).

`AIService` (see service.py) never imports a vendor SDK directly — it only
depends on the `AIProvider` interface below. Swapping Gemini for OpenAI,
Claude, or a local Llama model later means writing one new class in this
package and adding one branch in `service.py`'s provider lookup; nothing in
`app/services/pipeline.py` (the actual upload -> ... -> stored pipeline)
changes at all.
"""
from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel, Field


class ExtractedOption(BaseModel):
    label: str
    text: str
    is_correct: bool = False


class ExtractedQuestion(BaseModel):
    """One question as a provider returns it — untrusted until the
    pipeline's validation step (Step 5) checks it against this schema and
    its own business rules. Every field is optional/defaulted on purpose:
    a provider returning a partial or slightly malformed object should
    fail Pydantic validation cleanly (caught and logged) rather than crash
    the whole batch.
    """

    type: str = Field(default="mcq", description="mcq | multi-select | coding | subjective")
    question_text: str
    options: List[ExtractedOption] = Field(default_factory=list)
    correct_explanation: Optional[str] = None
    topic: Optional[str] = None
    subject: Optional[str] = None
    difficulty: str = Field(default="medium", description="easy | medium | hard")
    company: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    # The provider's own self-reported confidence in this extraction. Never
    # trusted alone for auto-approval — the pipeline's classification step
    # (Step 7) is what actually decides publish-vs-review, but a provider
    # that can't estimate this at all should send 0.5, not 1.0.
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class AIExtractionResult(BaseModel):
    questions: List[ExtractedQuestion] = Field(default_factory=list)
    provider_name: str
    model_name: str
    # Kept for debugging/audit only — never persisted to the questions
    # table, just surfaced in job error_message on failure.
    raw_response_excerpt: Optional[str] = None


class AIProviderError(Exception):
    """Raised by a provider on an unrecoverable call failure: missing/bad
    API key, network error, rate limit, or a response that still isn't
    parseable JSON after the provider's own internal retry. The pipeline
    catches this, marks the job failed, and records the message."""


class AIProvider(ABC):
    """One implementation per vendor."""

    name: str

    @abstractmethod
    async def extract_questions(
        self, *, document_text: str, source_hint: Optional[str] = None
    ) -> AIExtractionResult:
        """Extract structured questions from raw PDF text.

        `document_text` is plain text already pulled out of the PDF by
        `app.services.pdf_text` — extraction stays provider-agnostic on
        purpose, since not every future provider will accept a PDF file
        directly. `source_hint` is the original filename, passed along as
        extra prompt context (helps infer `company` from something like
        "Amazon_SDE1_2026.pdf").
        """
        raise NotImplementedError
