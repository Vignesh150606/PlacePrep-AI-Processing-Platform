"""
Base schema that serializes to camelCase JSON while keeping snake_case
Python field names — so response models read naturally in Python
(`profile.full_name`) but match the camelCase shape of the shared
TypeScript types (`profile.fullName`) on the wire, with no per-field
aliasing to keep in sync by hand.
"""
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
