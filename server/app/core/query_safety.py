"""
Safety helper for hand-built PostgREST `.or_()` filter strings.

`.or_()` on the supabase-py/postgrest-py query builder takes a raw string
that PostgREST itself parses with its own filter grammar -- commas
separate sibling conditions, parentheses nest them, and
`column.operator.value` triples are dot-separated. That's different from
`.eq()`/`.ilike()` (2-arg form), where the value is bound to one named
query parameter and PostgREST doesn't split it further. A value embedded
in an `.or_()` string, by contrast, IS parsed by that same grammar --
so if user-supplied text (a search box) is interpolated into it
unescaped, a comma or parenthesis in the input becomes structurally
significant, letting someone inject an *additional* filter condition
into the query instead of just searching for their own text. This is the
PostgREST-filter equivalent of SQL injection, and it was present, unescaped,
in five places in this codebase (resources/search/community/admin/alumni
search filters) before this pass.

`postgrest-py` already ships the fix for exactly this -- `sanitize_param`,
used internally elsewhere in the library for filter values -- which
quotes a value if it contains any of PostgREST's reserved characters, so
PostgREST's parser treats it as one escaped literal instead of syntax.
This just gives it a name and a docstring at the call sites that build a
raw `.or_()` string from user input, so the next person adding a search
filter finds this instead of copy-pasting the unescaped
`f"...{search}..."` pattern that was here before.
"""
from postgrest.utils import sanitize_param


def safe_filter_value(value: str) -> str:
    """Escape a piece of user-supplied text before interpolating it into
    a hand-built `.or_()` filter string. Safe (a no-op) on plain text;
    only wraps the value in quotes if it contains a PostgREST-reserved
    character (`,` `:` `(` `)`)."""
    return sanitize_param(value)
