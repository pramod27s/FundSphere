"""
Country names reduced to one canonical form, from the table CoreBackend also
reads (shared/countries.json), so the keyword channel, the Pinecone filter and
the eligibility checks all agree on which grants a country can apply to.

Grant countries come from an LLM extractor and are free text ("USA",
"All countries", "EU Member States", "associated countries"); canonical names
make them comparable. OPEN_TO_ALL stands for every "open to anyone" phrase, a
region name for a known group of countries, and UNRESOLVED_GROUP for a group
we can't resolve, which never rules a country out.
"""
import json
import re
from pathlib import Path

OPEN_TO_ALL = "any"
UNRESOLVED_GROUP = "unresolved group"

_TABLE_PATH = Path(__file__).resolve().parents[2] / "shared" / "countries.json"


def _clean(value) -> str:
    """Lowercase, whitespace collapsed, a leading 'the' dropped — as KeywordQuery does."""
    text = " ".join(str(value or "").lower().split())
    return text[4:] if text.startswith("the ") else text


def _load(path: Path) -> tuple[dict[str, str], dict[str, frozenset[str]], re.Pattern]:
    table = json.loads(path.read_text(encoding="utf-8"))
    aliases = {_clean(phrase): OPEN_TO_ALL for phrase in table["openToAll"]}
    for group in table["unresolvedGroups"]:
        aliases[_clean(group)] = UNRESOLVED_GROUP
    for canonical, names in table["countries"].items():
        for name in [canonical, *names]:
            aliases[_clean(name)] = _clean(canonical)
    members = {}
    for region, entry in table["regions"].items():
        for name in [region, *entry["aliases"]]:
            aliases[_clean(name)] = _clean(region)
        members[_clean(region)] = frozenset(_clean(m) for m in entry["members"])
    group_words = re.compile(r"\b(" + "|".join(re.escape(w) for w in table["groupWords"]) + r")\b")
    return aliases, members, group_words


# Every known spelling -> its canonical name ("usa" -> "united states",
# "all countries" -> "any", "eu member states" -> "european union").
# Unlisted names are their own canonical form.
COUNTRY_ALIASES, REGION_MEMBERS, _GROUP_WORDS = _load(_TABLE_PATH)


def canonical_country(value) -> str:
    text = _clean(value)
    if text in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[text]
    # "Countries associated with the LIFE Programme", "Low-income countries":
    # a group we can't list the members of.
    return UNRESOLVED_GROUP if _GROUP_WORDS.search(text) else text


def country_keys(values) -> list[str]:
    """A grant's countries as canonical names, de-duplicated in order: what the
    Pinecone index stores and filters on."""
    if isinstance(values, str):
        values = [values]
    keys = [canonical_country(v) for v in values or []]
    return list(dict.fromkeys(k for k in keys if k))


def keys_for_user(user_country) -> list[str]:
    """Every key that admits this country: its own name, the regions it is in,
    open to all, and unresolved groups. What the Pinecone filter matches on."""
    wanted = canonical_country(user_country)
    regions = sorted(region for region, members in REGION_MEMBERS.items() if wanted in members)
    return [wanted, *regions, OPEN_TO_ALL, UNRESOLVED_GROUP]


def names_country(grant_countries, user_country) -> bool:
    """True when the grant names the user's country, itself or through a region."""
    wanted = canonical_country(user_country)
    if not wanted:
        return False
    return any(key == wanted or wanted in REGION_MEMBERS.get(key, ())
               for key in country_keys(grant_countries))


def country_allows(grant_countries, user_country) -> bool:
    """False only when the grant names countries, none is the user's (directly
    or through a region), none means open to all, and none is a group we can't
    resolve. A grant naming no countries, or a user with no country, passes:
    missing or unclear data is not a conflict."""
    keys = set(country_keys(grant_countries))
    if not keys or not canonical_country(user_country):
        return True
    return bool(keys & {OPEN_TO_ALL, UNRESOLVED_GROUP}) or names_country(grant_countries, user_country)
