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
        self, *, document_text: str, source_hint: Optional[str] = None
    ) -> AIExtractionResult:
        raise NotImplementedError
