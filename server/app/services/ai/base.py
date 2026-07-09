"""
Abstract AI provider interface (Step 2 of the AI Processing Platform).
"""
from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel, Field


class ExtractedOption(BaseModel):
    label: str
    text: str
    is_correct: bool = False


class ExtractedQuestion(BaseModel):
    type: str = Field(default="mcq", description="mcq | multi-select | coding | subjective")
    question_text: str
    options: List[ExtractedOption] = Field(default_factory=list)
    correct_explanation: Optional[str] = None
    topic: Optional[str] = None
    subject: Optional[str] = None
    difficulty: str = Field(default="medium", description="easy | medium | hard")
    company: Optional[str] = None
    page_number: Optional[int] = Field(default=None, description="1-indexed page in the source PDF, if determinable")
    tags: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class AIExtractionResult(BaseModel):
    questions: List[ExtractedQuestion] = Field(default_factory=list)
    provider_name: str
    model_name: str
    raw_response_excerpt: Optional[str] = None


class AIProviderError(Exception):
    """Raised by a provider on an unrecoverable call failure."""


class AIProvider(ABC):
    name: str

    @abstractmethod
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
        """
        chunk_index/chunk_total: which piece of a larger, chunked document
        this call covers (Sprint 4 fix #4) — 0/1 for an unchunked document.
        page_offset_hint: free-text hint about which pages this chunk roughly
        covers (e.g. "pages 4-9 of 12"), passed through to the prompt so the
        model's page_number guesses stay plausible even though it only sees
        one chunk's worth of text at a time.
        answer_key_text: raw text of a separately-listed "Answer Key" section
        detected by services/answer_key.py, if any — attached to every chunk's
        prompt (not just the chunk the key physically appeared in) so the
        model can correctly associate each question with its answer even
        when the key section landed in a different chunk (Sprint 4 fix).
        """
        raise NotImplementedError
