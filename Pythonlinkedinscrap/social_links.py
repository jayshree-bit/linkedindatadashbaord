
# Backend/backend/social_links.py
#
# Social Media Finder + Instagram Follower List
#
# Prospect socials:
#   find_prospect_socials(...)
#
# Company socials:
#   find_company_socials(...)
#
# Instagram follower count:
#   instagram_graph_followers(...)
#   instagram_serper_followers(...)
#   scrape_instagram_followers(...)
#   instagram_followers(...)
#
# Instagram follower list:
#   scrape_instagram_follower_list(...)
#
# Follower fields:
#   username
#   first_name
#   last_name
#   full_name
#   company_name
#   profile_url
#   instagram_user_id
#   verified
#   private
#   profile_picture
#
# .env:
#   SERPER_API_KEY=YOUR_SERPER_KEY
#   MINDCASE_API_KEY=YOUR_MINDCASE_KEY
#   SOCIAL_MIN_SCORE=60
#   SOCIAL_FALLBACK=1
#   INSTAGRAM_LOGIN_WAIT=120
#   INSTAGRAM_GRAPH_TOKEN=
#   INSTAGRAM_GRAPH_USER_ID=
#   INSTAGRAM_GRAPH_VERSION=v21.0

import os
import re
import sys
import json
import time
import random

from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

from selenium.common.exceptions import (
    TimeoutException,
    WebDriverException,
)


# ======================================================================
# ENVIRONMENT
# ======================================================================

load_dotenv(Path(__file__).resolve().parent / ".env")

SERPER_API_KEY = (
    os.getenv("SERPER_API_KEY") or ""
).strip().strip('"').strip("'")

MINDCASE_API_KEY = (
    os.getenv("MINDCASE_API_KEY") or ""
).strip().strip('"').strip("'")

SOCIAL_MIN_SCORE = int(
    os.getenv("SOCIAL_MIN_SCORE", "60")
)

SOCIAL_FALLBACK = (
    os.getenv("SOCIAL_FALLBACK", "1") == "1"
)

IG_LOGIN_WAIT = int(
    os.getenv("INSTAGRAM_LOGIN_WAIT", "120")
)

IG_GRAPH_TOKEN = (
    os.getenv("INSTAGRAM_GRAPH_TOKEN") or ""
).strip()

IG_GRAPH_USER_ID = (
    os.getenv("INSTAGRAM_GRAPH_USER_ID") or ""
).strip()

IG_GRAPH_VER = os.getenv(
    "INSTAGRAM_GRAPH_VERSION",
    "v21.0"
).strip()

MINDCASE_INSTAGRAM_FOLLOWERS_URL = (
    "https://api.mindcase.co/v1/data/instagram/followers/run?wait=true"
)

print("[DEBUG] Serper key loaded:", bool(SERPER_API_KEY))
print("[DEBUG] Mindcase key loaded:", bool(MINDCASE_API_KEY))


# ======================================================================
# SOCIAL PLATFORM CONFIGURATION
# ======================================================================

PROSPECT_SITES = {
    "GitHub": ["github.com"],
    "Twitter": ["x.com", "twitter.com"],
    "Facebook": ["facebook.com"],
    "Instagram": ["instagram.com"],
}

COMPANY_SITES = {
    "Facebook": ["facebook.com"],
    "Instagram": ["instagram.com"],
    "Twitter": ["x.com", "twitter.com"],
    "YouTube": ["youtube.com"],
    "GitHub": ["github.com"],
}

WWW_HOSTS = {
    "instagram.com",
    "facebook.com",
    "youtube.com",
    "github.com",
}

BAD_SEGMENTS = {
    "share", "sharer", "sharer.php", "intent", "home",
    "search", "explore", "login", "i", "hashtag",
    "p", "reel", "reels", "stories", "tv", "groups",
    "pages", "public", "watch", "events", "marketplace",
    "gaming", "help", "policies", "people", "photo",
    "photos", "profile.php", "topics", "features",
    "pricing", "about", "orgs", "sponsors",
}

COMPANY_BAD_SEGMENTS = BAD_SEGMENTS | {
    "tr", "plugins", "dialog", "embed", "privacy",
    "legal", "widgets.js", "settings", "feed", "oauth",
    "signup", "account", "ads", "business",
}

URL_RE = re.compile(
    r"https?://[^\s\"'<>\\)]+",
    re.I
)

COMPANY_SUFFIXES = {
    "inc", "llc", "ltd", "limited", "corp",
    "corporation", "co", "company", "international",
    "global", "technologies", "technology", "tech",
    "group", "holdings", "solutions", "systems",
    "services", "software", "labs", "gmbh",
    "plc", "pvt", "private", "india", "usa", "us",
}

GENERIC_MAIL = {
    "gmail", "yahoo", "outlook", "hotmail", "icloud",
    "proton", "protonmail", "aol", "live", "rediffmail",
}


# ======================================================================
# GENERAL HELPERS
# ======================================================================

def _norm(s) -> str:
    return re.sub(
        r"[^a-z0-9]",
        "",
        (s or "").lower()
    )


def _blank(v) -> bool:
    return v is None or str(v).strip() in ("", "-")


def _fmt(found: Dict[str, str]) -> List[str]:
    return [
        f"{label}: {url}"
        for label, url in found.items()
        if not label.startswith("_")
    ]


def _serper(q: str):
    """Return Serper organic search results."""

    if not SERPER_API_KEY:
        return []

    try:
        r = requests.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": SERPER_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "q": q,
                "num": 10
            },
            timeout=20,
        )

    except Exception as e:
        print("[DEBUG] Serper request error:", e)
        return []

    if r.status_code in (401, 403):
        print(
            f"[DEBUG] Serper key rejected "
            f"HTTP {r.status_code}: {r.text[:150]}"
        )
        return None

    if r.status_code != 200:
        print(
            f"[DEBUG] Serper HTTP {r.status_code}: "
            f"{r.text[:150]}"
        )
        return []

    try:
        return r.json().get("organic", [])
    except ValueError:
        return []


def profile_link(
    url: str,
    hosts: List[str],
    bad: set
) -> str:

    p = urlparse(url or "")

    host = (
        p.netloc.lower()
        .removeprefix("www.")
        .removeprefix("m.")
    )

    if host not in hosts:
        return ""

    segs = [
        s for s in p.path.split("/")
        if s
    ]

    if not segs:
        return ""

    def _h(host_name):
        return (
            f"www.{host_name}"
            if host_name in WWW_HOSTS
            else host_name
        )

    if host == "youtube.com":

        if segs[0].startswith("@"):
            return f"https://{_h(host)}/{segs[0]}"

        if (
            len(segs) >= 2
            and segs[0] in ("channel", "c", "user")
        ):
            return (
                f"https://{_h(host)}/"
                f"{segs[0]}/{segs[1]}"
            )

        return ""

    if len(segs) != 1:
        return ""

    if segs[0].lower() in bad:
        return ""

    return f"https://{_h(hosts[0])}/{segs[0]}"


# ======================================================================
# PROSPECT SOCIAL LINKS
# ======================================================================

def company_tokens(
    company: str,
    email: str = ""
) -> List[str]:

    words = re.findall(
        r"[a-z0-9]+",
        (company or "").lower()
    )

    core = [
        w for w in words
        if w not in COMPANY_SUFFIXES
    ] or words

    toks = set()

    if core:
        toks.add(" ".join(core))
        toks.add("".join(core))

    dom = (
        (email or "").split("@")[-1]
        .lower()
        .split(".")[0]
        if "@" in (email or "")
        else ""
    )

    if dom and dom not in GENERIC_MAIL:
        toks.add(dom)

    return [
        t for t in toks
        if len(t) >= 3
    ]


def has_company(
    text: str,
    toks: List[str]
) -> bool:

    padded = (
        " "
        + re.sub(
            r"[^a-z0-9]+",
            " ",
            (text or "").lower()
        )
        + " "
    )

    return any(
        f" {t} " in padded
        for t in toks
    )


def handle_matches(
    handle: str,
    first: str,
    last: str
) -> bool:

    h = _norm(handle)
    f = _norm(first)
    l = _norm(last)

    if not (h and f and l):
        return False

    return (
        (f in h and l in h)
        or h.startswith(f[0] + l)
        or h.startswith(f + l[0])
    )


def linkedin_slug(url: str) -> str:

    m = re.search(
        r"/in/([^/?#]+)",
        url or ""
    )

    slug = m.group(1).lower() if m else ""

    if slug.startswith("aco") and len(slug) > 20:
        return ""

    return slug


def github_check(
    handle: str,
    first: str,
    last: str,
    toks: List[str]
):

    try:
        r = requests.get(
            f"https://api.github.com/users/{handle}",
            headers={
                "Accept": "application/vnd.github+json"
            },
            timeout=10,
        )

        if r.status_code != 200:
            return None

        d = r.json()

    except Exception as e:
        print("[DEBUG] GitHub API error:", e)
        return None

    name = (d.get("name") or "").lower()

    blob = " ".join(
        str(d.get(k) or "")
        for k in ("company", "bio", "blog")
    )

    return {
        "name_ok": (
            first.lower() in name
            and last.lower() in name
        ),
        "company_ok": has_company(blob, toks),
        "linkedin_ok": False,
        "blob": blob.lower(),
        "twitter": (
            d.get("twitter_username") or ""
        ).strip(),
    }


def find_prospect_socials(
    first: str,
    last: str,
    company: str,
    linkedin_url: str,
    email: str = "",
    title: str = "",
    location: str = "",
) -> List[str]:

    if not SERPER_API_KEY:
        print("[DEBUG] SERPER_API_KEY is empty")
        return []

    first = (first or "").strip()
    last = (last or "").strip()

    if not first or not last:
        return []

    name = f"{first} {last}"
    company = (company or "").strip()

    toks = company_tokens(company, email)

    short = max(
        (
            t for t in toks
            if " " in t or t.isalnum()
        ),
        key=len,
        default=""
    ) if toks else ""

    slug = linkedin_slug(linkedin_url)
    title_n = _norm(title)

    city = (
        (location or "")
        .split(",")[0]
        .strip()
        .lower()
    )

    print(
        "[DEBUG] Social tokens:",
        toks,
        "| slug:",
        slug,
        "| city:",
        city
    )

    found: Dict[str, str] = {}

    for label, hosts in PROSPECT_SITES.items():

        sites = " OR ".join(
            f"site:{h}" for h in hosts
        )

        queries = []

        if slug:
            queries.append(
                f'"{slug}" ({sites})'
            )

        if short:
            queries.append(
                f'"{name}" "{short}" ({sites})'
            )

        if company and company.lower() != short:
            queries.append(
                f'"{name}" "{company}" ({sites})'
            )

        if SOCIAL_FALLBACK or not queries:
            queries.append(
                f'"{name}" ({sites})'
            )

        gh_twitter = found.get("_gh_twitter")
        best = None

        for q in queries:

            results = _serper(q)

            if results is None:
                return _fmt(found)

            print(
                f"[DEBUG] Serper {label}: "
                f"{len(results)} results for {q}"
            )

            for res in results:

                url = profile_link(
                    res.get("link", ""),
                    hosts,
                    BAD_SEGMENTS
                )

                if not url:
                    continue

                handle = url.rsplit("/", 1)[-1]

                text = (
                    f"{res.get('title', '')} "
                    f"{res.get('snippet', '')}"
                )

                text_l = text.lower()
                text_n = _norm(text)

                score = 0
                evidence = False

                if (
                    first.lower() in text_l
                    and last.lower() in text_l
                ):
                    score += 50

                if handle_matches(
                    handle,
                    first,
                    last
                ):
                    score += 30

                if has_company(text, toks):
                    score += 40
                    evidence = True

                if slug and slug in text_l:
                    score += 60
                    evidence = True

                title_hit = (
                    bool(title_n)
                    and title_n in text_n
                )

                city_hit = (
                    bool(city)
                    and city in text_l
                )

                if title_hit:
                    score += 15

                if city_hit:
                    score += 15

                if title_hit and city_hit:
                    evidence = True

                if label == "GitHub":

                    gh = github_check(
                        handle,
                        first,
                        last,
                        toks
                    )

                    if gh:

                        if gh["company_ok"]:
                            score += 60
                            evidence = True

                        if slug and slug in gh["blob"]:
                            score += 60
                            evidence = True

                        if gh["name_ok"]:
                            score += 20

                    else:
                        evidence = False

                if (
                    label == "Twitter"
                    and gh_twitter
                    and handle.lower() == gh_twitter.lower()
                ):
                    score += 60
                    evidence = True

                print(
                    f"[DEBUG] Candidate {url} "
                    f"score={score} evidence={evidence}"
                )

                if (
                    evidence
                    and score >= SOCIAL_MIN_SCORE
                    and (
                        best is None
                        or score > best[0]
                    )
                ):
                    best = (score, url)

            if best:
                break

            time.sleep(
                random.uniform(0.3, 0.8)
            )

        if best:

            found[label] = best[1]

            if label == "GitHub":

                gh = github_check(
                    best[1].rsplit("/", 1)[-1],
                    first,
                    last,
                    toks
                )

                if gh and gh["twitter"]:
                    found["_gh_twitter"] = gh["twitter"]

        elif label == "Twitter" and found.get("_gh_twitter"):

            found["Twitter"] = (
                f"https://x.com/{found['_gh_twitter']}"
            )

    order = [
        "Facebook",
        "Instagram",
        "Twitter",
        "GitHub"
    ]

    return _fmt({
        k: found[k]
        for k in order
        if k in found
    })


# ======================================================================
# COMPANY SOCIAL LINKS
# ======================================================================

_company_cache: Dict[str, List[str]] = {}


def company_linkedin_slug(url: str) -> str:

    m = re.search(
        r"/company/([^/?#]+)",
        url or "",
        re.I
    )

    return m.group(1).lower() if m else ""


def socials_from_website(
    website: str
) -> Dict[str, str]:

    if _blank(website):
        return {}

    try:

        r = requests.get(
            website,
            timeout=15,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )

        html = (
            r.text
            if r.status_code == 200
            else ""
        )

        if not html:
            print(
                f"[DEBUG] Company website HTTP "
                f"{r.status_code}: {website}"
            )

    except Exception as e:
        print("[DEBUG] Company website fetch failed:", e)
        return {}

    html = html.replace("\\/", "/")

    out: Dict[str, str] = {}

    for u in URL_RE.findall(html):

        u = u.rstrip(".,;&")

        for label, hosts in COMPANY_SITES.items():

            if label in out:
                continue

            clean = profile_link(
                u,
                hosts,
                COMPANY_BAD_SEGMENTS
            )

            if clean:
                out[label] = clean

    print(
        "[DEBUG] Company socials from website:",
        out
    )

    return out


def _handle_guesses(
    company: str,
    domain: str,
    linkedin_company_url: str
) -> List[str]:

    words = re.findall(
        r"[a-z0-9]+",
        (company or "").lower()
    )

    core = [
        w for w in words
        if w not in COMPANY_SUFFIXES
    ] or words

    dom = (
        (domain or "")
        .lower()
        .removeprefix("www.")
        .split(".")[0]
        .replace("-", "")
    )

    slug = (
        company_linkedin_slug(
            linkedin_company_url
        ).replace("-", "")
    )

    out = []

    for g in (
        "".join(words),
        dom,
        slug,
        "".join(core),
        "_".join(core),
        ".".join(core),
    ):

        g = g.strip("._")

        if len(g) >= 3 and g not in out:
            out.append(g)

    return out[:5]


def socials_from_serper(
    company: str,
    domain: str,
    labels: List[str],
    linkedin_company_url: str = ""
) -> Dict[str, str]:

    if not SERPER_API_KEY or _blank(company):
        return {}

    company_n = _norm(company)

    domain_n = (
        _norm(domain.split(".")[0])
        if not _blank(domain)
        else ""
    )

    slug_n = _norm(
        company_linkedin_slug(
            linkedin_company_url
        )
    )

    guesses = _handle_guesses(
        company,
        domain,
        linkedin_company_url
    )

    guess_n = {
        _norm(g) for g in guesses
    }

    strong_handles = {
        h for h in (
            company_n,
            domain_n,
            slug_n
        )
        if len(h) >= 4
    }

    out: Dict[str, str] = {}

    for label in labels:

        hosts = COMPANY_SITES[label]

        sites = " OR ".join(
            f"site:{h}" for h in hosts
        )

        queries = [
            f'"{company}" ({sites})'
        ]

        queries += [
            f"{hosts[0]}/{g}"
            for g in guesses[:2]
        ]

        best = None

        for q in queries:

            results = _serper(q)

            if results is None:
                return out

            print(
                f"[DEBUG] Serper company {label}: "
                f"{len(results)} results for {q}"
            )

            for res in results:

                url = profile_link(
                    res.get("link", ""),
                    hosts,
                    COMPANY_BAD_SEGMENTS
                )

                if not url:
                    continue

                text = _norm(
                    f"{res.get('title', '')} "
                    f"{res.get('snippet', '')}"
                )

                handle = _norm(
                    url.rsplit("/", 1)[-1].lstrip("@")
                )

                score = 0
                evidence = False

                if company_n and company_n in text:
                    score += 40

                if (
                    domain_n
                    and len(domain_n) >= 3
                    and domain_n in text
                ):
                    score += 60
                    evidence = True

                if (
                    slug_n
                    and len(slug_n) >= 4
                    and slug_n in text
                ):
                    score += 60
                    evidence = True

                if len(handle) >= 4 and (
                    (
                        company_n
                        and (
                            company_n.startswith(handle)
                            or handle in company_n
                            or company_n in handle
                        )
                    )
                    or (
                        slug_n
                        and (
                            handle == slug_n
                            or slug_n.startswith(handle)
                        )
                    )
                ):
                    score += 30

                if handle in guess_n:
                    score += 40

                if handle in strong_handles:
                    evidence = True

                print(
                    f"[DEBUG] Company candidate {url} "
                    f"score={score} evidence={evidence}"
                )

                if (
                    evidence
                    and score >= SOCIAL_MIN_SCORE
                    and (
                        best is None
                        or score > best[0]
                    )
                ):
                    best = (score, url)

            if best:
                break

            time.sleep(
                random.uniform(0.3, 0.8)
            )

        if best:
            out[label] = best[1]

    return out


def find_company_socials(
    company: str,
    website: str = "",
    domain: str = "",
    linkedin_company_url: str = "",
) -> List[str]:

    key = (
        f"{_norm(company)}|"
        f"{_norm(domain or website)}"
    )

    if key in _company_cache:
        return list(_company_cache[key])

    found = socials_from_website(website)

    missing = [
        l for l in COMPANY_SITES
        if l not in found
    ]

    if missing:
        found.update(
            socials_from_serper(
                company,
                domain,
                missing,
                linkedin_company_url
            )
        )

    result = _fmt({
        l: found[l]
        for l in COMPANY_SITES
        if l in found
    })

    if result:
        _company_cache[key] = result

    return result


def instagram_url_from_socials(socials) -> str:

    parts = (
        socials.split("|")
        if isinstance(socials, str)
        else (socials or [])
    )

    for p in parts:

        p = p.strip()

        if p.lower().startswith("instagram:"):

            url = p.split(":", 1)[1].strip()

            return re.sub(
                r"^https?://(?:www\.)?instagram\.com",
                "https://www.instagram.com",
                url
            )

    return ""


# ======================================================================
# INSTAGRAM NAME HELPERS
# ======================================================================

def split_instagram_name(
    full_name: str
):
    """
    Best-effort display-name split.
    First and last names are not verified identity information.
    """

    name = re.sub(
        r"\s+",
        " ",
        (full_name or "")
    ).strip()

    if not name:
        return "", ""

    parts = name.split(" ", 1)

    first_name = parts[0]
    last_name = (
        parts[1]
        if len(parts) > 1
        else ""
    )

    return first_name, last_name


# ======================================================================
# MIN DCASE RESPONSE HELPERS
# ======================================================================

def _mindcase_extract_records(result) -> List[Dict]:
    """
    Extract records from common response wrappers.

    Supported structures:
      [...]
      {"data": [...]}
      {"results": [...]}
      {"records": [...]}
      {"items": [...]}
      {"output": [...]}

    Nested wrappers are also checked.
    """

    if isinstance(result, list):
        return result

    if not isinstance(result, dict):
        return []

    for key in (
        "data",
        "results",
        "records",
        "items",
        "output",
    ):

        value = result.get(key)

        if isinstance(value, list):
            return value

        if isinstance(value, dict):

            nested = _mindcase_extract_records(value)

            if nested:
                return nested

    return []


def _mindcase_value(
    item: Dict,
    keys: List[str],
    default=""
):
    """Read the first non-empty field from an API record."""

    for key in keys:

        value = item.get(key)

        if value is not None and value != "":
            return value

    return default


# ======================================================================
# INSTAGRAM FOLLOWER LIST USING MINDCASE
# ======================================================================

def scrape_instagram_follower_list(
    driver,
    instagram_url: str,
    max_records: int = 1000,
    relationship: str = "Followers",
) -> List[Dict]:
    """
    Retrieve Instagram follower/following records using Mindcase.

    driver is retained for compatibility with existing code.
    Mindcase does not require Selenium.

    Example:
        scrape_instagram_follower_list(
            None,
            "https://www.instagram.com/example/",
            max_records=3000,
            relationship="Followers"
        )
    """

    if not MINDCASE_API_KEY:
        print(
            "[DEBUG] MINDCASE_API_KEY missing in .env"
        )
        return []

    handle = _ig_handle(instagram_url)

    if not handle:
        print("[DEBUG] Invalid Instagram username or URL")
        return []

    relationship = (
        (relationship or "Followers")
        .strip()
        .lower()
    )

    relationship_map = {
        "followers": "Followers",
        "follower": "Followers",
        "following": "Following",
    }

    relationship = relationship_map.get(
        relationship,
        ""
    )

    if not relationship:
        print(
            "[DEBUG] Invalid relationship. "
            "Use Followers or Following."
        )
        return []

    try:
        max_records = int(max_records)
    except (TypeError, ValueError):
        max_records = 1000

    if max_records <= 0:
        print("[DEBUG] max_records must be greater than zero")
        return []

    headers = {
        "Authorization": f"Bearer {MINDCASE_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    payload = {
        "params": {
            "usernames": handle,
            "dataToScrape": relationship,
            "maxResults": max_records,
        }
    }

    print(
        f"[DEBUG] Mindcase request: @{handle}, "
        f"{relationship}, maximum={max_records}"
    )

    try:

        response = requests.post(
            MINDCASE_INSTAGRAM_FOLLOWERS_URL,
            headers=headers,
            json=payload,
            timeout=180,
        )

        print(
            "[DEBUG] Mindcase HTTP status:",
            response.status_code
        )

        if response.status_code not in (200, 201):
            print(
                "[DEBUG] Mindcase API error:",
                response.text[:2000]
            )
            return []

        result = response.json()

    except requests.exceptions.Timeout:
        print("[DEBUG] Mindcase request timed out")
        return []

    except requests.exceptions.RequestException as e:
        print("[DEBUG] Mindcase request failed:", e)
        return []

    except ValueError:
        print("[DEBUG] Mindcase returned invalid JSON")
        return []

    # Extract returned records.
    records = _mindcase_extract_records(result)

    if not records:

        print(
            "[DEBUG] Mindcase returned no recognizable record list."
        )

        # Print response structure without exposing API credentials.
        print(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False
            )[:4000]
        )

        return []

    followers = []
    seen = set()

    for item in records:

        if not isinstance(item, dict):
            continue

        # Username
        username = _mindcase_value(
            item,
            [
                "username",
                "handle",
                "userName",
                "user_name",
                "instagramUsername",
                "instagram_username",
            ]
        )

        if isinstance(username, dict):
            username = (
                username.get("username")
                or username.get("value")
                or ""
            )

        username = (
            str(username)
            .strip()
            .lstrip("@")
        )

        if not username:
            continue

        if username.lower() in seen:
            continue

        seen.add(username.lower())

        # Full/display name
        full_name = _mindcase_value(
            item,
            [
                "fullName",
                "full_name",
                "full_name_text",
                "name",
                "displayName",
                "display_name",
            ]
        )

        if isinstance(full_name, dict):
            full_name = (
                full_name.get("fullName")
                or full_name.get("name")
                or ""
            )

        full_name = str(full_name or "").strip()

        # First/last name from API if available.
        first_name = _mindcase_value(
            item,
            [
                "firstName",
                "first_name",
                "firstname",
            ]
        )

        last_name = _mindcase_value(
            item,
            [
                "lastName",
                "last_name",
                "lastname",
            ]
        )

        # Otherwise split the display name.
        if not first_name and not last_name:
            first_name, last_name = split_instagram_name(
                full_name
            )

        # Profile URL
        profile_url = _mindcase_value(
            item,
            [
                "profileUrl",
                "profile_url",
                "url",
                "instagramUrl",
                "instagram_url",
                "link",
            ]
        )

        if not profile_url:
            profile_url = (
                f"https://www.instagram.com/{username}/"
            )

        # Company name: only use values actually returned by API.
        company_name = _mindcase_value(
            item,
            [
                "companyName",
                "company_name",
                "company",
                "currentCompany",
                "current_company",
                "employer",
                "organization",
                "organizationName",
            ]
        )

        if isinstance(company_name, dict):
            company_name = (
                company_name.get("name")
                or company_name.get("companyName")
                or ""
            )

        # User ID
        instagram_user_id = _mindcase_value(
            item,
            [
                "instagramUserId",
                "instagram_user_id",
                "userId",
                "user_id",
                "id",
            ]
        )

        # Verification and privacy
        verified = _mindcase_value(
            item,
            [
                "verified",
                "isVerified",
                "is_verified",
            ],
            False
        )

        private = _mindcase_value(
            item,
            [
                "private",
                "isPrivate",
                "is_private",
            ],
            False
        )

        # Profile image
        profile_picture = _mindcase_value(
            item,
            [
                "profilePicture",
                "profile_picture",
                "profilePic",
                "profile_pic_url",
                "profilePicUrl",
                "avatar",
                "image",
            ]
        )

        follower = {
            "username": username,
            "first_name": str(first_name or "").strip(),
            "last_name": str(last_name or "").strip(),
            "full_name": full_name,
            "company_name": str(company_name or "").strip(),
            "profile_url": str(profile_url).strip(),
            "instagram_user_id": str(
                instagram_user_id or ""
            ),
            "verified": verified,
            "private": private,
            "profile_picture": str(
                profile_picture or ""
            ),
            "source_account": handle,
        }

        followers.append(follower)

        if len(followers) >= max_records:
            break

    print(
        f"[DEBUG] Mindcase returned {len(followers)} "
        f"unique {relationship.lower()} for @{handle}"
    )

    print(
        "[DEBUG] Records with full name:",
        sum(bool(x["full_name"]) for x in followers)
    )

    print(
        "[DEBUG] Records with company name:",
        sum(bool(x["company_name"]) for x in followers)
    )

    return followers


# ======================================================================
# INSTAGRAM FOLLOWER COUNT CONFIGURATION
# ======================================================================

IG_APP_ID = "936619743392459"

IG_FOLLOWERS_RE = re.compile(
    r"([\d][\d.,]*\s*[KMB]?)\s+Followers",
    re.I
)

IG_BROWSER_PAUSE_UNTIL = 0.0
IG_API_PAUSE_UNTIL = 0.0


def _count_to_int(
    txt: str
) -> Optional[int]:

    t = (
        (txt or "")
        .strip()
        .upper()
        .replace(",", "")
        .replace(" ", "")
    )

    mult = {
        "K": 1_000,
        "M": 1_000_000,
        "B": 1_000_000_000,
    }

    try:

        if t and t[-1] in mult:
            return int(
                float(t[:-1]) * mult[t[-1]]
            )

        return int(float(t))

    except (ValueError, IndexError):
        return None


def _ig_stat(
    text: str,
    word: str
):

    m = re.search(
        rf"([\d][\d.,]*\s*[KMBkmb]?)\s+{word}\b",
        text or "",
        re.I
    )

    return (
        (_count_to_int(m.group(1)), m.group(1).strip())
        if m
        else (None, "")
    )


# ======================================================================
# INSTAGRAM GRAPH API FOLLOWER COUNT
# ======================================================================

def instagram_graph_followers(
    ig_url: str
) -> Optional[Dict]:

    handle = _ig_handle(ig_url)

    if not (
        handle
        and IG_GRAPH_TOKEN
        and IG_GRAPH_USER_ID
    ):
        return None

    try:

        r = requests.get(
            (
                f"https://graph.facebook.com/"
                f"{IG_GRAPH_VER}/{IG_GRAPH_USER_ID}"
            ),
            params={
                "fields": (
                    f"business_discovery.username({handle})"
                    "{followers_count,follows_count,media_count}"
                ),
                "access_token": IG_GRAPH_TOKEN,
            },
            timeout=20,
        )

        if r.status_code != 200:
            print(
                f"[DEBUG] Graph API HTTP "
                f"{r.status_code}: {r.text[:150]}"
            )
            return None

        d = r.json()["business_discovery"]

        return {
            "followers": int(d["followers_count"]),
            "following": d.get("follows_count"),
            "posts": d.get("media_count"),
            "text": str(d["followers_count"]),
            "source": "graph-api",
        }

    except Exception as e:
        print("[DEBUG] Graph API error:", e)
        return None


# ======================================================================
# INSTAGRAM SERPER FOLLOWER COUNT
# ======================================================================

def instagram_serper_followers(
    ig_url: str
) -> Optional[Dict]:

    handle = _ig_handle(ig_url)

    if not handle:
        return None

    results = _serper(
        f'site:instagram.com "{handle}"'
    )

    if results is None:
        return None

    for res in results:

        link = (
            res.get("link") or ""
        ).lower()

        if (
            f"instagram.com/{handle.lower()}"
            not in link
        ):
            continue

        fm = IG_FOLLOWERS_RE.search(
            f"{res.get('title', '')} "
            f"{res.get('snippet', '')}"
        )

        n = (
            _count_to_int(fm.group(1))
            if fm
            else None
        )

        if n is not None:
            return {
                "followers": n,
                "text": fm.group(1).strip(),
                "source": "serper",
            }

    return None


# ======================================================================
# INSTAGRAM SELENIUM HEADER COUNT
# ======================================================================

JS_IG_TEXT = r"""
const og = document.querySelector('meta[property="og:description"]');
const main = document.querySelector('main') || document.body;
const ex = document.querySelector("a[href*='/followers'] span[title]");
return JSON.stringify({
  login: !!document.querySelector("input[name='username'], input[name='email']"),
  text: (main.innerText || '').slice(0, 2500),
  og: og ? (og.content || '') : '',
  exact: ex ? (ex.getAttribute('title') || '') : ''
});
"""


def _ig_read(driver) -> dict:

    try:
        return json.loads(
            driver.execute_script(JS_IG_TEXT) or "{}"
        )
    except Exception:
        return {}


def _ig_needs_login(
    driver,
    data: dict
) -> bool:

    cur = driver.current_url.lower()

    return (
        "accounts/login" in cur
        or "/challenge" in cur
        or bool(data.get("login"))
    )


def scrape_instagram_followers(
    driver,
    ig_url: str
):

    global IG_BROWSER_PAUSE_UNTIL

    if not ig_url:
        return None

    if time.time() < IG_BROWSER_PAUSE_UNTIL:
        print(
            "[DEBUG] Instagram browser scrape paused"
        )
        return None

    main = driver.current_window_handle

    driver.switch_to.new_window("tab")

    new_handle = driver.current_window_handle

    try:

        driver.set_page_load_timeout(30)

        try:
            driver.get(ig_url)

        except (
            TimeoutException,
            WebDriverException
        ) as e:

            IG_BROWSER_PAUSE_UNTIL = (
                time.time() + 20 * 60
            )

            print(
                "[DEBUG] Instagram not reachable:",
                str(e)[:100]
            )

            return None

        time.sleep(3)

        data = _ig_read(driver)

        if _ig_needs_login(driver, data):

            print(
                f"[DEBUG] Instagram login required. "
                f"Waiting {IG_LOGIN_WAIT} seconds."
            )

            try:
                driver.execute_cdp_cmd(
                    "Page.bringToFront",
                    {}
                )
            except Exception:
                pass

            logged_in = False
            end = time.time() + IG_LOGIN_WAIT

            while time.time() < end:

                time.sleep(4)

                data = _ig_read(driver)

                if not _ig_needs_login(driver, data):
                    logged_in = True
                    break

            if not logged_in:

                IG_BROWSER_PAUSE_UNTIL = (
                    time.time() + 15 * 60
                )

                return None

            try:
                driver.get(ig_url)
            except (
                TimeoutException,
                WebDriverException
            ):
                return None

            time.sleep(3)

        text = ""

        for _ in range(8):

            data = _ig_read(driver)

            text = (
                f"{data.get('text', '')} "
                f"{data.get('og', '')}"
            )

            if re.search(r"\bfollowers\b", text, re.I):
                break

            time.sleep(2)

        low = text.lower()

        if (
            "429" in low[:400]
            or "too many requests" in low
            or "isn't working" in low
        ):

            IG_BROWSER_PAUSE_UNTIL = (
                time.time() + 30 * 60
            )

            return None

        if "isn't available" in low:
            return None

        followers, ftxt = _ig_stat(
            text,
            "followers"
        )

        following, _ = _ig_stat(
            text,
            "following"
        )

        posts, _ = _ig_stat(
            text,
            "posts"
        )

        exact = _count_to_int(
            data.get("exact") or ""
        )

        if exact is not None:
            followers = exact

        print(
            "[DEBUG] Instagram header:",
            followers,
            following,
            posts
        )

        if followers is None:
            print(
                "[DEBUG] Instagram page text:",
                text[:300].replace("\n", " | ")
            )
            return None

        return {
            "followers": followers,
            "following": following,
            "posts": posts,
            "text": ftxt or str(followers),
            "source": "instagram-login",
        }

    except Exception as e:

        print("[DEBUG] Instagram scrape failed:", e)
        return None

    finally:

        try:
            if new_handle != main:
                driver.switch_to.window(new_handle)
                driver.close()
        except Exception:
            pass

        try:
            driver.switch_to.window(main)
            driver.set_page_load_timeout(300)
        except Exception:
            pass


# ======================================================================
# INSTAGRAM FOLLOWER COUNT FALLBACK
# ======================================================================

def instagram_followers(
    ig_url: str
) -> Optional[Dict]:

    global IG_API_PAUSE_UNTIL

    if time.time() < IG_API_PAUSE_UNTIL:
        return None

    handle = _ig_handle(ig_url)

    if not handle:
        return None

    ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    )

    # 1. Instagram web profile endpoint

    try:

        r = requests.get(
            (
                "https://www.instagram.com/api/v1/"
                f"users/web_profile_info/?username={handle}"
            ),
            headers={
                "User-Agent": ua,
                "X-IG-App-ID": IG_APP_ID,
                "Accept": "*/*",
            },
            timeout=15,
        )

        if r.status_code == 200:

            n = (
                r.json()["data"]["user"]
                ["edge_followed_by"]["count"]
            )

            return {
                "followers": int(n),
                "text": str(n),
                "source": "instagram-api",
            }

        print(
            f"[DEBUG] Instagram API HTTP "
            f"{r.status_code} for {handle}"
        )

        if r.status_code == 429:

            IG_API_PAUSE_UNTIL = (
                time.time() + 30 * 60
            )

            print(
                "[DEBUG] Instagram API paused for 30 minutes"
            )

            return None

    except Exception as e:
        print("[DEBUG] Instagram API error:", e)

    # 2. Profile metadata

    try:

        r = requests.get(
            f"https://www.instagram.com/{handle}/",
            headers={
                "User-Agent": ua,
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=15,
        )

        if r.status_code == 200:

            mm = (
                re.search(
                    r'property="og:description"\s+content="([^"]+)"',
                    r.text
                )
                or re.search(
                    r'content="([^"]+)"\s+property="og:description"',
                    r.text
                )
            )

            fm = (
                IG_FOLLOWERS_RE.search(mm.group(1))
                if mm
                else None
            )

            if fm:

                n = _count_to_int(fm.group(1))

                if n is not None:
                    return {
                        "followers": n,
                        "text": fm.group(1).strip(),
                        "source": "og-meta",
                    }

    except Exception as e:
        print("[DEBUG] Instagram page error:", e)

    # 3. Serper

    return instagram_serper_followers(ig_url)


# ======================================================================
# COMMAND LINE TEST
# ======================================================================

if __name__ == "__main__":

    args = sys.argv[1:]

    if len(args) >= 4 and args[0] == "person":

        print(
            find_prospect_socials(
                args[1],
                args[2],
                args[3],
                args[4] if len(args) > 4 else "",
            )
        )

    elif len(args) >= 2 and args[0] == "company":

        site = (
            args[2]
            if len(args) > 2
            else ""
        )

        print(
            find_company_socials(
                args[1],
                site,
                urlparse(site).netloc.removeprefix("www.")
            )
        )

    elif len(args) >= 2 and args[0] == "ig":

        print(
            instagram_graph_followers(args[1])
            or instagram_serper_followers(args[1])
            or instagram_followers(args[1])
        )

    elif len(args) >= 2 and args[0] == "ig-followers-list":

        max_records = (
            int(args[2])
            if len(args) > 2
            else 100
        )

        relationship = (
            args[3]
            if len(args) > 3
            else "Followers"
        )

        result = scrape_instagram_follower_list(
            None,
            args[1],
            max_records=max_records,
            relationship=relationship,
        )

        print(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False
            )
        )

    else:

        print(
            "Usage:\n"
            "  python social_links.py person "
            "<first> <last> <company> [linkedin_url]\n"
            "  python social_links.py company "
            "<name> [website]\n"
            "  python social_links.py ig <instagram_url>\n"
            "  python social_links.py ig-followers-list "
            "<instagram_url> [max_records] [Followers|Following]"
        )
