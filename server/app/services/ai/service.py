"""
AIService — the single entry point the pipeline calls into.
"""
from functools import lru_cache
from typing import Optional

from app.core.config import get_settings
from app.services.ai.base import AIExtractionResult, AIProvider, AIProviderError


class AIService:
    def __init__(self, provider: AIProvider):
        self._provider = provider

    async def extract_questions(
        self, *, document_text: str, source_hint: Optional[str] = None
    ) -> AIExtractionResult:
        if not document_text.strip():
            raise AIProviderError("No extractable text found in this PDF.")
        return await self._provider.extract_questions(
            document_text=document_text, source_hint=source_hint
        )


def _build_provider() -> AIProvider:
    settings = get_settings()

    if not settings.is_ai_configured:
        raise AIProviderError(
            "AI provider is not configured. Set GEMINI_API_KEY in server/.env "
            "(see the setup guide) and restart the server."
        )

    if settings.AI_PROVIDER == "gemini":
        from app.services.ai.gemini_provider import GeminiProvider

        return GeminiProvider(api_key=settings.GEMINI_API_KEY, model=settings.GEMINI_MODEL)

    raise AIProviderError(f"Unknown AI_PROVIDER: {settings.AI_PROVIDER}")


@lru_cache
def get_ai_service() -> AIService:
    return AIService(provider=_build_provider())
