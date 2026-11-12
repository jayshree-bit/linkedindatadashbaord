# Backend/backend/linkedin_update.py
#
# No Sales Navigator lead pages are opened here, so no credit is used.
#   - Person data   : normal profile  linkedin.com/in/<slug or member id>
#   - Company data  : normal company  linkedin.com/company/<slug>/about/
# Safeguards: daily profile-view cap, block detection, longer pauses,
# stop after repeated failures.
#
# Role selection rule:
#   - several "Present" roles  -> store the one with the LATEST start date
#   - no "Present" role        -> store the most recent finished role
#                                 and set prospect status = DisQualified
#   - experience has NO dates  -> store the TOP listed role (LinkedIn lists the
#                                 newest first) and set status = DisQualified
#
# note1 gets:  "Update Profile - <what was updated>"
import os
import re
import time
import uuid
import random
import socket
import shutil
import threading
import subprocess

from datetime import datetime, timezone
from pathlib import Path
from typing import List
from urllib.parse import urlparse, urlunparse

from dotenv import load_dotenv
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient
from selenium import webdriver
from selenium.common.exceptions import (
    InvalidSessionIdException,
    NoSuchWindowException,
    TimeoutException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

load_dotenv(Path(__file__).resolve().parent / ".env")

router = APIRouter(prefix="/api/prospects", tags=["linkedin-update"])

# ---------------- MongoDB (must be the same DB as your Node app) ----------------
PROSPECT_MONGO_URI = os.getenv("PROSPECT_MONGO_URI")
if not PROSPECT_MONGO_URI:
    raise RuntimeError(
        f"PROSPECT_MONGO_URI is not set. Create {Path(__file__).resolve().parent / '.env'}"
    )
client = MongoClient(PROSPECT_MONGO_URI)
_db_name = os.getenv("PROSPECT_DB")
db = client[_db_name] if _db_name else client.get_default_database()
PROSPECT_COLLECTION = os.getenv("PROSPECT_COLLECTION", "prospects")
prospects = db[PROSPECT_COLLECTION]
companies = db[os.getenv("COMPANY_COLLECTION", "companies")]
view_log = db["linkedin_view_log"]  # one doc per day: {_id: "2026-10-31", count: 42}
update_log = db["linkedin_update_log"]
# ---------------- Chrome ----------------
CHROME_DEBUGGER_ADDRESS = os.getenv("CHROME_DEBUGGER_ADDRESS", "127.0.0.1:9222")
CHROME_PATH = os.getenv(
    "CHROME_PATH",
    r"C:\Users\jayshree\AppData\Local\Google\Chrome\Application\chrome.exe",
)
CHROME_PROFILE_DIR = os.getenv("CHROME_PROFILE_DIR", r"C:\chrome-debug-profile")

# ---------------- Limits ----------------
MAX_IDS_PER_JOB = 200
DAILY_PROFILE_LIMIT = int(os.getenv("LINKEDIN_DAILY_LIMIT", "80"))  # profile views per day
MAX_CONSECUTIVE_BAD = 8      # stop the job after this many failed/skipped in a row
LONG_BREAK_EVERY = 20        # extra pause after every N records
NOTE_TEXT = "Update Profile"
NOTE2_TEXT = "Update work mode"
# Prospect status values (must match the enum in the Node Prospect schema)
STATUS_QUALIFIED = "Qualified"
STATUS_DISQUALIFIED = "DisQualified"

JOBS: dict = {}
SCRAPE_LOCK = threading.Lock()

# Month is optional so year-only ranges like "2015 - 2018" also match.
DATE_RE = re.compile(
    r"((?:[A-Za-z]{3,9}\.?\s+)?\d{4})\s*[-–—]\s*(Present|(?:[A-Za-z]{3,9}\.?\s+)?\d{4})",
    re.I,
)
DURATION_RE = re.compile(r"(\d+\s+yrs?(?:\s+\d+\s+mos?)?|\d+\s+mos?)", re.I)
EMPLOYMENT_TYPES = [
    "Full-time", "Part-time", "Contract", "Freelance",
    "Self-employed", "Internship", "Temporary", "Seasonal",
]
WORK_MODES = ["Hybrid", "Remote", "On-site"]

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Used only to read a member id out of a stored Sales Navigator link
# (string parsing, the Sales Navigator page is NOT opened).
SN_LEAD_RE = re.compile(r"/sales/(?:lead|people)/(AC[A-Za-z0-9_-]{20,})")

FIELD_KEYS = {
    "industry":           ["Sub Industies", "Sub Industries", "Industry", "industry"],
    "mainIndustry":       ["Main Industry", "mainIndustry"],
    "employeeSize":       ["Employee Size", "employeeSize"],
    "seeAllEmployeeSize": ["See All Employee Size", "seeAllEmployeeSize"],
    "exactRevenue":       ["Exact Revenue", "exactRevenue"],
    "revenue":            ["Revenue", "revenue"],
    "revenueLink":        ["Revenue Link", "revenueLink"],
    "companyDomain":      ["Company Domain", "companyDomain", "domain"],
    "website":            ["Website", "website"],
    "companyLinkedinUrl": ["Company LinkedIn URL", "companyLinkedinUrl", "linkedinUrl"],
    "address1":           ["Address 1", "address1"],
    "address2":           ["Address 2", "address2"],
    "city":               ["City", "city"],
    "state":              ["State", "state"],
    "zipcode":            ["Zipcode", "zipcode"],
    "country":            ["Country", "country"],
    "sicCode":            ["SIC Code", "sicCode"],
    "naicsCode":          ["NAICS Code", "naicsCode"],
    "status":             ["Status", "status"], 
}

# Company lookups/merges must NOT touch "status": it belongs to the prospect
# (copying it from another record, or writing "-", would break the enum).
COMPANY_FIELD_KEYS = {k: v for k, v in FIELD_KEYS.items() if k != "status"}

# Fields listed in the "Update Profile - ..." note (key -> label)
TRACKED_LABELS = {
    "specificTitle": "title",
    "companyName": "company",
    "status": "status",
    "prospectTenure": "tenure",
    "linkedinEmploymentStartDate": "start date",
    "linkedinEmploymentEndDate": "end date",
    "linkedinLocation": "location",
    "note2": "work mode",
    "linkedinAbout": "about",
    "profilePhotoUrl": "photo",
    "website": "website",
    "companyDomain": "domain",
    "companyLinkedinUrl": "company LinkedIn URL",
    "mainIndustry": "main industry",
    "industry": "industry",
    "employeeSize": "employee size",
    "seeAllEmployeeSize": "all employee size",
    "exactRevenue": "exact revenue",
    "revenue": "revenue",
    "revenueLink": "revenue link",
    "address1": "address 1",
    "address2": "address 2",
    "city": "city",
    "state": "state",
    "zipcode": "zipcode",
    "country": "country",
    "sicCode": "SIC code",
    "naicsCode": "NAICS code",

}
SHOW_OLD_NEW = {"specificTitle", "companyName", "status", "city", "state", "country", "note2"}  # show "old -> new" for these

FOOTER_MARKERS = ("Community Guidelines", "Ad Choices", "Privacy & Terms")


class UpdateRequest(BaseModel):
    ids: List[str]


class DailyLimitReached(Exception):
    pass


# ======================================================================
# Helpers
# ======================================================================
def norm(s) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def old_value(doc: dict, key: str):
    if key in OLD_VALUE_KEYS:
        return pick(doc, OLD_VALUE_KEYS[key])
    if key in FIELD_KEYS:
        return pick(doc, FIELD_KEYS[key])
    return doc.get(key)

def _company_slug(url) -> str:
    """https://www.linkedin.com/company/intone-networks-inc/about/ -> intone-networks-inc"""
    m = re.search(r"/company/([^/?#]+)", (url or "").strip(), re.I)
    return m.group(1).lower() if m else ""


def _site_host(url) -> str:
    """https://www.fourwindscasino.com/ -> fourwindscasino.com (ignores http/https and www)"""
    url = (url or "").strip().lower()
    p = urlparse(url if "//" in url else "//" + url)
    host = (p.netloc or "").split("@")[-1].split(":")[0]
    return host.removeprefix("www.")


def _numbers(text) -> tuple:
    """'501-1,000 employees' -> ('501', '1000'); '10,001+ employees' -> ('10001',)"""
    return tuple(n.replace(",", "") for n in re.findall(r"\d[\d,]*", text or ""))

def _tenure_core(text) -> str:
    """Tenure without the '14 yrs 6 mos' part, lower-case, no spaces or symbols."""
    return norm(DURATION_RE.sub(" ", text or ""))

def same_value(key: str, old, new) -> bool:
    """True when old and new mean the same thing, so the field must NOT be updated."""
    if blank(old) or blank(new):
        return False  # empty old value -> still fill it

    if key == "companyLinkedinUrl":
        a, b = _company_slug(old), _company_slug(new)
        if a and b:
            return a == b                      # same company slug -> same
    elif key in ("employeeSize", "seeAllEmployeeSize"):
        a, b = _numbers(old), _numbers(new)
        if a and b:
            return a == b                      # same numbers -> ignore the word "employees"
    elif key == "website":
        a, b = _site_host(old), _site_host(new)
        if a and b:
            return a == b                      # same domain -> ignore https / www
    elif key == "prospectTenure":
        a, b = _tenure_core(old), _tenure_core(new)
        if a and b:
            # new tenure is built as title, company, type, start, end, location.
            # If one is the start of the other, only the duration or the trailing location differs.
            return a == b or a.startswith(b) or b.startswith(a)

    return norm(old) == norm(new)

def blank(v) -> bool:
    return v is None or str(v).strip() in ("", "-")


def pick(doc: dict, keys: List[str]):
    for k in keys:
        v = doc.get(k)
        if not blank(v):
            return str(v).strip()
    return None


def parse_hq(text):
    parts = [p.strip() for p in (text or "").split(",") if p.strip()]
    if len(parts) >= 3:
        return {"city": parts[0], "state": parts[1], "country": parts[-1]}
    if len(parts) == 2:
        return {"city": parts[0], "country": parts[1]}
    if len(parts) == 1:
        return {"country": parts[0]}
    return {}

def normalize_website(url) -> str:
    """Any website value -> https://www.<domain>.<tld>
    - already https://www.x.com  -> kept as is
    - http://x.com, x.com, https://x.com/about -> https://www.x.com
    - sub-domains (careers.x.com) are left alone, only 'www.' is not forced on them."""
    url = (url or "").strip()
    if blank(url):
        return ""
    p = urlparse(url if "//" in url else "//" + url)
    host = (p.netloc or "").lower().split("@")[-1].split(":")[0].strip()
    if not host:
        return ""
    if not host.startswith("www."):
        labels = host.split(".")
        # co.uk, com.au style endings have 3 labels for a root domain
        two_level = (
            len(labels) >= 3
            and len(labels[-1]) == 2
            and labels[-2] in ("co", "com", "org", "net", "gov", "ac", "edu")
        )
        root_labels = 3 if two_level else 2
        if len(labels) <= root_labels:
            host = "www." + host
    return "https://" + host



def strip_query(url: str) -> str:
    p = urlparse(url)
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def not_footer(t: str) -> bool:
    return not any(x in t for x in FOOTER_MARKERS)


# ======================================================================
# Daily profile-view budget
# ======================================================================
def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def views_today() -> int:
    d = view_log.find_one({"_id": _today()})
    return int(d["count"]) if d else 0


def reserve_view():
    """Count one profile view, or stop the job when today's cap is used up."""
    if views_today() >= DAILY_PROFILE_LIMIT:
        raise DailyLimitReached(
            f"Daily limit of {DAILY_PROFILE_LIMIT} profile views reached. "
            "Continue tomorrow (or raise LINKEDIN_DAILY_LIMIT in .env at your own risk)."
        )
    view_log.update_one({"_id": _today()}, {"$inc": {"count": 1}}, upsert=True)


# ======================================================================
# Chrome start / attach
# ======================================================================
def _port_open() -> bool:
    host, port = CHROME_DEBUGGER_ADDRESS.split(":")
    try:
        with socket.create_connection((host, int(port)), timeout=1):
            return True
    except OSError:
        return False


def ensure_chrome_running():
    """Start Chrome with the debug port if it is not already running."""
    if _port_open():
        return
    chrome = CHROME_PATH if os.path.exists(CHROME_PATH) else shutil.which("chrome")
    if not chrome:
        raise RuntimeError(f"Chrome not found at {CHROME_PATH}. Set CHROME_PATH in .env")
    port = CHROME_DEBUGGER_ADDRESS.split(":")[1]
    subprocess.Popen(
        [
            chrome,
            f"--remote-debugging-port={port}",
            f"--user-data-dir={CHROME_PROFILE_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "https://www.linkedin.com/feed/",
        ]
    )
    for _ in range(30):
        if _port_open():
            return
        time.sleep(1)
    raise RuntimeError("Chrome did not open the debug port. Close all Chrome windows and retry.")


def get_driver():
    ensure_chrome_running()
    opts = Options()
    opts.add_experimental_option("debuggerAddress", CHROME_DEBUGGER_ADDRESS)
    try:
        return webdriver.Chrome(options=opts)  # Selenium Manager finds the driver
    except Exception:
        return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)


def assert_logged_in(driver):
    url = driver.current_url.lower()
    if any(x in url for x in ("/login", "authwall", "/checkpoint", "uas/login")):
        raise RuntimeError(
            "LinkedIn is logged out or asked for a security check. Open the Chrome window "
            "that was started, log in / solve the check, then run the update again."
        )


def assert_not_blocked(driver):
    """Stop the whole job if LinkedIn is throttling or restricting the account."""
    assert_logged_in(driver)
    try:
        text = driver.find_element(By.TAG_NAME, "body").text[:3000].lower()
    except Exception:
        return
    if any(x in text for x in ("unusual activity", "commercial use limit", "temporarily restricted")):
        raise RuntimeError(
            "LinkedIn is limiting this account (unusual activity / view limit). "
            "Stop for today and retry tomorrow with a smaller batch."
        )


# ======================================================================
# Getting to the normal profile page
# ======================================================================
def resolve_public_url(doc) -> str:
    """Public profile URL. Falls back to the member id inside a stored Sales Navigator
    link (string parsing only, the Sales Navigator page is never opened)."""
    url = (doc.get("linkedinProfileLink") or "").strip()
    if url and url != "-":
        if not url.startswith("http"):
            url = "https://" + url
        return url.replace("http://", "https://", 1)

    sn = (doc.get("linkedinProfileLinkSN") or "").strip()
    m = SN_LEAD_RE.search(sn)
    if m:
        # linkedin.com/in/<member id> redirects to the normal profile
        return f"https://www.linkedin.com/in/{m.group(1)}"

    raise ValueError("No public LinkedIn profile URL on this record")


# ======================================================================
# Normal profile scraping
# ======================================================================
def parse_location(lines: List[str]):
    """Location / work mode from the lines after the dates,
    e.g. 'Pune, Maharashtra, India · Hybrid'.
    A part only counts as a location if it has a comma or comes with a work mode,
    so job titles / short description lines are not mistaken for a location."""
    location, work_mode = "", ""
    for t in lines:
        if len(t) > 80 or t.endswith("."):
            continue  # job description text
        parts = [p.strip() for p in t.split("·")]
        has_mode = any(p.lower() in (m.lower() for m in WORK_MODES) for p in parts)
        for part in parts:
            if part.lower() in (m.lower() for m in WORK_MODES):
                work_mode = work_mode or part
            elif not location and part and ("," in part or has_mode):
                location = part
    return location, work_mode


def parse_employment_type(lines: List[str]) -> str:
    """A '·'-separated part that is exactly one of the known employment types."""
    for t in lines:
        for part in (p.strip() for p in t.split("·")):
            for item in EMPLOYMENT_TYPES:
                if part.lower() == item.lower():
                    return item
    return ""


def parse_role(texts: List[str]):
    """One role's texts -> (role dict, index of the dates line). Returns (None, None) if no dates."""
    date_idx = next((i for i, t in enumerate(texts) if DATE_RE.search(t)), None)
    if date_idx is None:
        return None, None

    dm = DATE_RE.search(texts[date_idx])
    dur = DURATION_RE.search(texts[date_idx])

    employment_type = parse_employment_type(texts[1:date_idx])
    location, work_mode = parse_location(texts[date_idx + 1:date_idx + 3])

    role = {
        "title": texts[0],
        "employment_type": employment_type,
        "employment_start": dm.group(1).strip(),
        "employment_end": dm.group(2).strip(),
        "duration": dur.group(1).strip() if dur else "",
        "location": location,
        "work_mode": work_mode,
    }
    return role, date_idx


HIDDEN_DATE_RE = re.compile(r"^(?:[A-Za-z]{3,9}\.?\s+)?\d{4}\s+to\s+", re.I)  # screen-reader copy of dates


def date_key(text: str):
    """'Mar 2023' -> (2023, 3). '2018' -> (2018, 0). 'Present' -> far future so it sorts last."""
    t = (text or "").strip().lower()
    if t == "present":
        return (9999, 12)
    m = re.match(r"([a-z]{3})[a-z]*\.?\s+(\d{4})", t)
    if m:
        return (int(m.group(2)), MONTHS.get(m.group(1), 0))
    m = re.fullmatch(r"(\d{4})", t)
    if m:
        return (int(m.group(1)), 0)
    return (0, 0)


def clean_lines(raw: str) -> List[str]:
    """innerText -> clean lines (no blanks, no screen-reader duplicates)."""
    lines: List[str] = []
    for line in (raw or "").split("\n"):
        line = line.strip()
        if not line or HIDDEN_DATE_RE.match(line):
            continue
        if lines and lines[-1] == line:  # LinkedIn repeats each text for screen readers
            continue
        lines.append(line)
    return lines


def find_section(driver, title, validate, max_scrolls=10):
    """Find a profile section by its visible heading text (no class names or ids).
    Scrolls down step by step because LinkedIn renders lower sections lazily."""
    xp = (
        "//*[self::h1 or self::h2 or self::span or self::p]"
        f"[normalize-space(.)='{title}']"
    )
    for step in range(max_scrolls + 1):
        for h in driver.find_elements(By.XPATH, xp):
            el = h
            for _ in range(8):
                try:
                    el = el.find_element(By.XPATH, "..")
                except Exception:
                    break
                if validate(el.text or ""):
                    return el
        if step < max_scrolls:
            driver.execute_script("window.scrollBy(0, 600);")
            time.sleep(1)
    return None


def section_lines(driver, section, title) -> List[str]:
    """Visible text of a section as clean lines, starting after its heading."""
    raw = driver.execute_script("return arguments[0].innerText;", section) or ""
    lines = clean_lines(raw)
    if title in lines:
        lines = lines[lines.index(title) + 1:]
    return lines


# Returns every "leaf" entry (one per role) that contains a date range.
# For grouped roles (several titles under one company), parentText is the
# company block that wraps them.
# Works without <li>, class names or ids: it starts from every date text on the
# page and climbs up until the block would contain a second date. That block is one role.
# For grouped roles it then keeps climbing to find the company block, which is
# recognised by its 2nd line looking like "Full-time · 5 yrs 3 mos".
GROUP_HDR_RE = (
    r"^(?:(?:" + "|".join(EMPLOYMENT_TYPES) + r")\s*·\s*)?\d+\s+(?:yrs?|mos?)\b"
)

JS_COLLECT_ROLES = """
const sec = arguments[0];
const reg = new RegExp(arguments[1], 'gi');
const hdr = new RegExp(arguments[2], 'i');
const cnt = el => ((el.innerText || '').match(reg) || []).length;
const lines = el => {
  const out = [];
  for (let l of (el.innerText || '').split('\\n')) {
    l = l.trim();
    if (l && out[out.length - 1] !== l) out.push(l);
  }
  return out;
};
const leaves = Array.from(sec.querySelectorAll('*')).filter(el =>
  cnt(el) === 1 && !Array.from(el.children).some(c => cnt(c) >= 1));
const rows = [];
for (const lf of leaves) {
  let row = lf;
  while (row.parentElement && row.parentElement !== sec && cnt(row.parentElement) === 1) {
    row = row.parentElement;
  }
  if (!rows.includes(row)) rows.push(row);
}
return rows.map(row => {
  let group = '';
  let p = row.parentElement;
  while (p && p !== sec) {
    if (cnt(p) > 1) {
      const l = lines(p);
      if (l.length > 1 && hdr.test(l[1])) { group = p.innerText || ''; break; }
    }
    p = p.parentElement;
  }
  const scope = group ? p : row;
  const a = scope.querySelector("a[href*='/company/']");
  return { text: row.innerText || '', group: group, href: a ? a.href : null };
});
"""


def pick_best_role(roles: List[dict]):
    """Latest 'Present' role (by start date). If none, the most recent finished role."""
    if not roles:
        return None
    present = [r for r in roles if r["employment_end"].lower() == "present"]
    if present:
        return max(present, key=lambda r: date_key(r["employment_start"]))
    return max(
        roles,
        key=lambda r: (date_key(r["employment_end"]), date_key(r["employment_start"])),
    )


def scrape_about(driver) -> str:
    """About text (ignores the LinkedIn footer, which also has an 'About' link)."""
    try:
        a = find_section(
            driver,
            "About",
            lambda t: len(t) > 60 and not_footer(t),
            max_scrolls=0,
        )
        if a is not None:
            alines = section_lines(driver, a, "About")
            stop = next((i for i, t in enumerate(alines) if t.lower().startswith("top skills")), len(alines))
            about = " ".join(alines[:stop])
            return re.sub(r"\s*…\s*(see )?more$", "", about, flags=re.I).strip()
    except Exception:
        pass
    return ""


def scrape_undated_experience(driver):
    """Fallback for profiles where the experience entries have no dates at all.
    LinkedIn lists the most recent role first, so the TOP entry is used."""
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(1)
    section = find_section(driver, "Experience", lambda t: len(t) > 40 and not_footer(t))
    if section is None:
        print("[DEBUG] Experience section not found")
        try:
            body = driver.find_element(By.TAG_NAME, "body").text[:500].replace("\n", " | ")
            print("[DEBUG] page text starts with:", body)
        except Exception:
            pass
        return None

    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", section)
    time.sleep(1.5)

    lines = section_lines(driver, section, "Experience")
    lines = [l for l in lines if not l.lower().startswith(("show all", "see all"))]
    print("[DEBUG] undated experience lines:", lines[:12])
    if len(lines) < 2:
        return None

    if len(lines) > 2 and re.match(GROUP_HDR_RE, lines[1], re.I):
        # grouped: Company / "Full-time · 5 yrs" / Title ...
        company, title, head = lines[0], lines[2], 3
    else:
        # single: Title / "Company · Full-time" / ...
        title, company, head = lines[0], lines[1].split("·")[0].strip(), 2

    employment_type = parse_employment_type([lines[1]])
    location, work_mode = parse_location(lines[head:head + 2])

    href = driver.execute_script(
        "const a = arguments[0].querySelector(\"a[href*='/company/']\"); return a ? a.href : null;",
        section,
    )

    print("[DEBUG] undated top role:", title, "@", company)
    return {
        "title": title,
        "company": company,
        "company_href": href,
        "employment_type": employment_type,
        "employment_start": "",
        "employment_end": "",
        "duration": "",
        "location": location,
        "work_mode": work_mode,
        "has_present": False,
        "undated": True,
        "about": scrape_about(driver),
        "tenure": "",
    }


def scrape_public_experience(driver):
    section = find_section(driver, "Experience", lambda t: bool(DATE_RE.search(t)))
    if section is None:
        print("[DEBUG] No dated Experience section, trying undated fallback")
        return scrape_undated_experience(driver)

    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", section)
    time.sleep(1.5)

    # ---- collect ALL roles ----
    items = driver.execute_script(JS_COLLECT_ROLES, section, DATE_RE.pattern, GROUP_HDR_RE) or []
    print("[DEBUG] role blocks found:", len(items))

    roles = []
    for it in items:
        lines = clean_lines(it["text"])
        role, date_idx = parse_role(lines)
        if not role:
            continue
        if it["group"]:
            # grouped roles: company is the first line of the wrapping block
            glines = clean_lines(it["group"])
            company = glines[0] if glines else ""
        else:
            # single role: title / "Company · Full-time" / dates / location
            company = lines[1].split("·")[0].strip() if date_idx > 1 else ""
        role["company"] = company
        role["company_href"] = it["href"]
        roles.append(role)

    print(
        "[DEBUG] roles found:",
        [(r["title"], r["company"], r["employment_start"], r["employment_end"]) for r in roles],
    )

    # ---- choose: latest Present, else latest finished ----
    role = pick_best_role(roles)
    if not role:
        return scrape_undated_experience(driver)
    print("[DEBUG] chosen role:", role["title"], "@", role["company"],
          role["employment_start"], "-", role["employment_end"])

    # True only if at least one role is still "Present"
    role["has_present"] = any(r["employment_end"].lower() == "present" for r in roles)
    role["undated"] = False
    role["about"] = scrape_about(driver)

    tenure = f"{role['employment_start']} - {role['employment_end']}"
    if role["duration"]:
        tenure += f" · {role['duration']}"
    role["tenure"] = tenure
    return role
DEAD_MARKERS = (
    "this page doesn't exist",
    "this page doesn’t exist",
    "page not found",
    "this profile is not available",
    "profile is not available",
)


def profile_is_dead(driver) -> bool:
    """LinkedIn 404 / unavailable profile page."""
    try:
        if "/404" in driver.current_url.lower():
            return True
        text = driver.find_element(By.TAG_NAME, "body").text[:4000].lower()
        return any(m in text for m in DEAD_MARKERS)
    except Exception:
        return False


def profile_loaded(driver) -> bool:
    """A real profile page rendered (checks page text, not one specific tag)."""
    try:
        text = (driver.find_element(By.TAG_NAME, "body").text or "").lower()
        markers = ("experience", "about", "education", "connections",
                   "followers", "contact info", "message", "connect", "follow")
        return len(text) > 400 and sum(m in text for m in markers) >= 2
    except Exception:
        return False


def wait_for_profile(driver, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if profile_is_dead(driver) or profile_loaded(driver):
            return
        time.sleep(1)

def keep_page_active(driver):
    """Make the tab behave as visible and focused, even if you are using another window."""
    try:
        driver.execute_cdp_cmd("Emulation.setFocusEmulationEnabled", {"enabled": True})
    except Exception:
        pass
    try:
        driver.execute_cdp_cmd("Page.bringToFront", {})
    except Exception:
        pass

JS_PROFILE_PHOTO = r"""
const PHOTO = /profile-(displayphoto|framedphoto)/;     // framedphoto = #OpenToWork / hiring frame
const srcOf = i => {
  for (const s of [i.currentSrc, i.src, i.getAttribute('data-delayed-url'), i.getAttribute('data-src')]) {
    if (s && s.startsWith('http') && PHOTO.test(s)) return s;
  }
  return '';
};
const clean = s => (s || '').replace(/^\(\d+\)\s*/, '').split('|')[0].trim().toLowerCase();
const h1 = document.querySelector('h1');
const names = [clean(document.title), h1 ? h1.innerText.trim().toLowerCase() : ''].filter(Boolean);

const cands = [];
for (const img of document.querySelectorAll('img')) {
  const src = srcOf(img);
  if (!src) continue;
  const r = img.getBoundingClientRect();
  const area = r.width * r.height;
  if (area < 40 * 40) continue;                          // skips the tiny nav avatar
  const alt = (img.alt || '').trim().toLowerCase();
  const named = !!alt && names.some(n => n.includes(alt) || alt.includes(n.split(' - ')[0]));
  const outside = !!img.closest('header, nav, aside, [role=navigation]');
  cands.push({ src, area, named, outside, top: r.top + window.scrollY });
}

// 1) alt text matches this person, else 2) biggest photo in the top area (not nav/sidebar)
const pick =
  cands.filter(c => c.named).sort((a, b) => b.area - a.area)[0] ||
  cands.filter(c => !c.outside && c.top < 700).sort((a, b) => b.area - a.area)[0];
if (pick) return pick.src;

// 3) page metadata (usually a larger 400-800px version)
const og = document.querySelector('meta[property="og:image"]');
const ogUrl = og ? (og.content || '') : '';
return PHOTO.test(ogUrl) ? ogUrl : '';
"""


def scrape_profile_photo(driver, tries: int = 4) -> str:
    """Profile photo URL. Retries because the top-card image can load a moment late."""
    for attempt in range(tries):
        try:
            if attempt == 0:
                driver.execute_script("window.scrollTo(0, 0);")
            url = (driver.execute_script(JS_PROFILE_PHOTO) or "").strip()
            if url:
                print("[DEBUG] profile photo:", url[:100])
                return url
        except Exception as e:
            print("[DEBUG] profile photo error:", e)
        time.sleep(1.5)
    print("[DEBUG] profile photo not found")
    return ""

JS_OPEN_TO_WORK = r"""
const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const inSide = el => !!el.closest('aside, [role=complementary]');
const pageTop = el => el.getBoundingClientRect().top + window.scrollY;   // page is scrolled to 0

// 1) green #OpenToWork frame on the MAIN profile photo (big image near the top)
for (const img of document.querySelectorAll('img')) {
  if (inSide(img)) continue;
  const alt = norm(img.alt);
  if (!/open_to_work|open to work|opentowork/.test(alt)) continue;
  const r = img.getBoundingClientRect();
  if (r.width < 100 || r.height < 100) continue;      // sidebar / feed avatars are small
  if (pageTop(img) > 800) continue;
  return 'photo frame';
}

// 2) the "Open to work" card: exact title + "Show details" in a small container, near the top
const root = document.querySelector('main') || document.body;
for (const el of root.querySelectorAll('p, span, div, h2, h3')) {
  if (inSide(el)) continue;
  if (!/^(open to work\s*)+$/.test(norm(el.innerText))) continue;
  if (pageTop(el) > 1100) continue;
  let p = el;
  for (let i = 0; i < 6 && p && p !== root; i++, p = p.parentElement) {
    const t = p.innerText || '';
    if (t.length > 600) break;                         // too big = not the card
    if (/show details/i.test(t)) return 'card';
  }
}
return '';
"""


def scrape_open_to_work(driver) -> bool:
    """True only if THIS profile's top card shows Open to work."""
    try:
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(0.5)
        reason = driver.execute_script(JS_OPEN_TO_WORK) or ""
        print("[DEBUG] open to work:", reason or "no")
        return bool(reason)
    except Exception as e:
        print("[DEBUG] open to work error:", e)
        return False

def open_and_scrape(driver, doc):
    url = resolve_public_url(doc)
    reserve_view()
    driver.get(url)
    keep_page_active(driver)
    try:
        driver.switch_to.window(driver.current_window_handle)
        driver.execute_script("window.focus();")
    except Exception:
        pass
    time.sleep(random.uniform(3, 5))
    assert_not_blocked(driver)

    wait_for_profile(driver)
    if profile_is_dead(driver):
        return {"dead": True}

    photo_url = scrape_profile_photo(driver)
    open_to_work = scrape_open_to_work(driver)
    exp = scrape_public_experience(driver)
    if not exp and not profile_loaded(driver):
        # one retry: reload and wait again
        driver.refresh()
        time.sleep(random.uniform(4, 6))
        wait_for_profile(driver)
        if profile_is_dead(driver):
            return {"dead": True}
        photo_url = scrape_profile_photo(driver) or photo_url
        open_to_work = scrape_open_to_work(driver)
        exp = scrape_public_experience(driver)
    if exp:
        exp["photo_url"] = photo_url
        exp["open_to_work"] = open_to_work
    return exp

# ======================================================================
# Normal company page scraping  (/company/<slug>/about/)
# ======================================================================
COMPANY_LABELS = {"website", "industry", "company size", "headquarters"}


def company_base_url(href: str) -> str:
    p = urlparse(href)
    path = re.sub(r"/(about|posts|jobs|people|life)/?$", "", p.path.rstrip("/"))
    return urlunparse((p.scheme or "https", p.netloc, path, "", "", ""))


def parse_about_text(text: str) -> dict:
    """Read 'Label' / 'value' line pairs from the About page text,
    e.g.  Website / http://www.sentara.com"""
    out = {}
    lines = clean_lines(text)
    for i, line in enumerate(lines[:-1]):
        label = line.strip().lower()
        if label not in COMPANY_LABELS:
            continue
        value = lines[i + 1].strip()
        if not value or value.lower() in COMPANY_LABELS:
            continue
        if label == "website":
            out.setdefault("website", value)
        elif label == "industry":
            out.setdefault("industry", value)
        elif label == "company size":
            out.setdefault("employeeSize", value)
        elif label == "headquarters":
            for k, v in parse_hq(value).items():
                out.setdefault(k, v)
    return out


def scrape_company(driver, href: str) -> dict:
    out = {}
    main = driver.current_window_handle
    base = company_base_url(href)

    driver.switch_to.new_window("tab")
    new_handle = driver.current_window_handle
    try:
        driver.get(base + "/about/")
        time.sleep(random.uniform(3, 5))
        assert_not_blocked(driver)

        # 1) old layout: <dl><dt>/<dd>
        for dt in driver.find_elements(By.CSS_SELECTOR, "dl dt"):
            label = (dt.text or "").strip().lower()
            try:
                dd = dt.find_element(By.XPATH, "following-sibling::dd[1]")
            except Exception:
                continue
            value = (dd.text or "").strip().split("\n")[0].strip()
            if not value:
                continue

            if label == "website":
                links = dd.find_elements(By.CSS_SELECTOR, "a[href]")
                out["website"] = (links[0].get_attribute("href") if links else value).strip()
            elif label == "industry":
                out["industry"] = value
            elif label == "company size":
                out["employeeSize"] = value
            elif label == "headquarters":
                out.update(parse_hq(value))

        # 2) current layout: plain text "Website" / "http://..." (fills what is still missing)
        raw = driver.execute_script("return document.body.innerText;") or ""
        for k, v in parse_about_text(raw).items():
            out.setdefault(k, v)

        # save the real slug URL after LinkedIn redirects /company/15546 -> /company/sentara-health
        out["companyLinkedinUrl"] = company_base_url(strip_query(driver.current_url))
    finally:
        try:
            if new_handle != main:
                driver.switch_to.window(new_handle)
                driver.close()
        except Exception:
            pass
        driver.switch_to.window(main)
    return {k: v for k, v in out.items() if v}


# ======================================================================
# Company details lookup (stored data first, scraped data fills the gaps)
# ======================================================================
def known_company_details(name: str) -> dict:
    rx = re.compile(f"^{re.escape(name.strip())}$", re.I)
    rec = companies.find_one({"$or": [{"Company Name": rx}, {"companyName": rx}, {"name": rx}]})
    if rec:
        found = {f: pick(rec, keys) for f, keys in COMPANY_FIELD_KEYS.items()}
        return {f: v for f, v in found.items() if v}
    rec = prospects.find_one(
        {"companyName": rx, "companyDomain": {"$nin": ["", "-", None]}},
        sort=[("updatedAt", -1)],
    )
    if rec:
        found = {f: pick(rec, [f]) for f in COMPANY_FIELD_KEYS}
        return {f: v for f, v in found.items() if v}
    return {}


def company_fields_for(name: str, scraped: dict, known: dict) -> dict:
    merged = {**scraped, **known}  # stored data wins over scraped
    if not blank(merged.get("website")):
        merged["website"] = normalize_website(merged["website"])
    if blank(merged.get("companyDomain")) and not blank(merged.get("website")):
        site = merged["website"]
        host = urlparse(site if "//" in site else "//" + site).netloc
        merged["companyDomain"] = host.lower().removeprefix("www.")
    return {f: (str(merged[f]).strip() if not blank(merged.get(f)) else "-") for f in COMPANY_FIELD_KEYS}


# ======================================================================
# Core update logic
# ======================================================================
def build_prospect_tenure(exp):
    parts = [
        exp.get("title"),
        exp.get("company"),
        exp.get("employment_type"),
        exp.get("employment_start"),
        exp.get("employment_end"),
        exp.get("duration"),
        exp.get("location"),
        exp.get("work_mode"),
    ]
    return " · ".join(str(p).strip() for p in parts if p and str(p).strip())

# ---- after TRACKED_LABELS / SHOW_OLD_NEW ----

# Extra key names an old value may be stored under (add real names from the debug output)
OLD_VALUE_KEYS = {
    "linkedinEmploymentStartDate": ["linkedinEmploymentStartDate", "Start Date"],
    "linkedinEmploymentEndDate":   ["linkedinEmploymentEndDate", "End Date"],
    "linkedinLocation":            ["linkedinLocation", "Location"],
    "linkedinAbout":               ["linkedinAbout", "About"],
}
def build_update_note(doc: dict, changes: dict, reason: str = "") -> str:
    """'Update Profile - title: A -> B; company: X -> Y; website updated; ...'"""
    parts = []
    for key, label in TRACKED_LABELS.items():
        new = changes.get(key)
        if blank(new):
            continue
        old = old_value(doc, key)
        if key == "status" and blank(old):
            old = STATUS_QUALIFIED  # schema default
        if same_value(key, old, new):
            continue
        if key in SHOW_OLD_NEW:
            parts.append(f"{label}: {old if not blank(old) else '-'} -> {new}")
        else:
            parts.append(f"{label} updated")
    if reason:
        parts.append(reason)
    return f"{NOTE_TEXT} - " + ("; ".join(parts) if parts else "no changes")


def build_diff(doc: dict, changes: dict) -> list:
    print("[DEBUG] doc keys:", sorted(doc.keys()))
    for k in ("employeeSize", "Employee Size", "linkedinLocation", "linkedinAbout"):
        print("[DEBUG]", k, "=", repr(doc.get(k)))
    out = []
    for key, label in TRACKED_LABELS.items():
        new = changes.get(key)
        if blank(new):
            continue

        # read the old value from any of the stored key names
        raw_old = old_value(doc, key)
        if key == "status" and blank(raw_old):
            raw_old = STATUS_QUALIFIED
        if norm(raw_old) == norm(new):
            continue

        out.append({
            "field": key,
            "label": label,
            "old": "" if raw_old is None else str(raw_old)[:300],
            "new": str(new)[:300],
        })
    return out

def mark_disqualified(doc, reason: str):
    changes = {
        "status": STATUS_DISQUALIFIED,
        "updatedAt": datetime.now(timezone.utc),
    }
    note = build_update_note(doc, changes, reason)
    old_note = doc.get("note1")
    changes["note1"] = note if blank(old_note) else f"{old_note} | {note}"
    prospects.update_one({"_id": doc["_id"]}, {"$set": changes})
    return {
        "status": "disqualified",
        "detail": changes,
        "summary": note,
        "reason": reason,
        "diff": build_diff(doc, changes),
    }

def update_one(driver, doc):
    exp = open_and_scrape(driver, doc)
    print("[DEBUG] Scraper returned:", repr(exp))

    if exp and exp.get("dead"):
        return mark_disqualified(doc, "profile page not available")

    if not exp:
        if profile_loaded(driver):
            # real profile, but no experience at all -> nothing to verify
            return mark_disqualified(doc, "no experience on profile")
        return {
            "status": "skipped",
            "detail": "Page did not load properly, left unchanged",
        }

    no_present = not exp.get("has_present", True)
    if exp.get("undated"):
        reason = "no dates on profile, top listed role used"
    elif no_present:
        reason = "no Present role, latest role used"
    else:
        reason = ""

    company_changed = norm(exp["company"]) != norm(doc.get("companyName"))
    title_changed = norm(exp.get("title")) != norm(doc.get("specificTitle"))

    changes = {
        "specificTitle": exp.get("title", ""),
        "companyName": exp.get("company", ""),
        "prospectTenure": build_prospect_tenure(exp),
        "linkedinEmploymentStartDate": exp.get("employment_start", ""),
        "linkedinEmploymentEndDate": exp.get("employment_end", ""),
        "linkedinLocation": exp.get("location", ""),
        "linkedinAbout": exp.get("about", ""),
        "updatedAt": datetime.now(timezone.utc),
    }
    if exp.get("photo_url"):                          # never overwrite with blank
        changes["profilePhotoUrl"] = exp["photo_url"]
    note2_parts = []

    if exp.get("work_mode"):
        note2_parts.append(
            f"{NOTE2_TEXT}: {exp['work_mode']}"
        )

    open_to_work = ("Available" if exp.get("open_to_work") else "Not Available")
    note2_parts.append(f"Open to work: {open_to_work}")
    changes["note2"] = " | ".join(note2_parts)
    # Company details: open the company page only when stored data has gaps
    known = known_company_details(exp["company"])
    needs_scrape = any(
        blank(known.get(k)) for k in ("industry", "employeeSize", "companyDomain", "website")
    )
    scraped = {}
    if exp.get("company_href") and needs_scrape:
        try:
            scraped = scrape_company(driver, exp["company_href"])
        except RuntimeError:
            raise
        except Exception as e:
            print("[DEBUG] company scrape failed:", e)

    fields = company_fields_for(exp["company"], scraped, known)
    if not company_changed:
        # same company: never overwrite stored values with "-"
        fields = {k: v for k, v in fields.items() if v != "-"}
    changes.update(fields)

    loc = parse_hq(exp.get("location"))
    if len(loc) == 3:                      # only trust "City, State, Country"
        changes.update(loc)

    # No "Present" role (or no dates at all) -> prospect has left -> DisQualified
    if no_present:
        changes["status"] = STATUS_DISQUALIFIED
    for key in ("companyLinkedinUrl", "employeeSize", "seeAllEmployeeSize", "website", "prospectTenure"):
        if key in changes and same_value(key, old_value(doc, key), changes[key]):
            changes.pop(key)
    # note1: "Update Profile - <what was updated>"
    note = build_update_note(doc, changes, reason)
    old_note = doc.get("note1")
    changes["note1"] = note if blank(old_note) else f"{old_note} | {note}"

    prospects.update_one({"_id": doc["_id"]}, {"$set": changes})

    if no_present:
        status = "disqualified"
    elif company_changed:
        status = "company_changed"
    elif title_changed:
        status = "title_changed"
    else:
        status = "updated"
    return {
        "status": status,
        "detail": changes,
        "summary": note,
        "reason": reason,
        "diff": build_diff(doc, changes),
    }


def reset_tabs(driver):
    try:
        while len(driver.window_handles) > 1:
            driver.switch_to.window(driver.window_handles[-1])
            driver.close()
        driver.switch_to.window(driver.window_handles[0])
    except Exception:
        pass

def write_log(job_id, sid, name, doc, res):
    try:
        url = ""
        if doc:
            try:
                url = resolve_public_url(doc)
            except Exception:
                url = (doc.get("linkedinProfileLink") or "").strip()
        detail = res.get("summary") or (res["detail"] if isinstance(res.get("detail"), str) else "")
        update_log.insert_one({
            "jobId": job_id,
            "prospectId": sid,
            "name": name,
            "linkedinUrl": url,
            "status": res.get("status", ""),
            "changes": res.get("diff", []),
            "details": detail,
            "createdAt": datetime.now(timezone.utc),
        })
    except Exception as e:
        print("[DEBUG] log write failed:", e)

def run_job(job_id: str, ids: List[str]):
    job = JOBS[job_id]
    bad_in_a_row = 0
    with SCRAPE_LOCK:
        try:
            driver = get_driver()
            for sid in ids:
                name = sid
                doc = None
                try:
                    doc = prospects.find_one({"_id": ObjectId(sid)})
                    if not doc:
                        res = {
                            "status": "failed",
                            "detail": (
                                f"Not found in db='{db.name}' collection='{PROSPECT_COLLECTION}' "
                                f"({prospects.estimated_document_count()} docs). "
                                "Python is pointed at a different DB/collection than Node."
                            ),
                        }
                    else:
                        name = f"{doc.get('firstName', '')} {doc.get('lastName', '')}".strip() or sid
                        job["current"] = name
                        try:
                            res = update_one(driver, doc)
                        except (InvalidSessionIdException, NoSuchWindowException):
                            driver = get_driver()
                            reset_tabs(driver)
                            res = update_one(driver, doc)
                except DailyLimitReached as e:
                    job["state"] = "stopped"
                    job["error"] = str(e)
                    return
                except RuntimeError as e:  # logged out / blocked / Chrome problem
                    job["state"] = "failed"
                    job["error"] = str(e)
                    return
                except Exception as e:
                    res = {"status": "failed", "detail": str(e)[:200]}
                    try:
                        reset_tabs(driver)
                    except Exception:
                        pass

                write_log(job_id, sid, name, doc, res)
                job["results"].append({"id": sid, "name": name, **res})
                job["processed"] += 1
                job["current"] = ""
                bad_in_a_row = bad_in_a_row + 1 if res["status"] in ("failed", "skipped") else 0
                if bad_in_a_row >= MAX_CONSECUTIVE_BAD:
                    job["state"] = "stopped"
                    job["error"] = (
                        f"{MAX_CONSECUTIVE_BAD} records in a row failed or were skipped. "
                        "Stopped to protect the account; check the Chrome window and the [DEBUG] logs."
                    )
                    return

                time.sleep(random.uniform(6, 12))  # be gentle with LinkedIn
                if job["processed"] % LONG_BREAK_EVERY == 0:
                    time.sleep(random.uniform(30, 60))
            job["state"] = "done"
        except Exception as e:
            job["state"] = "failed"
            job["error"] = str(e)
        # Do NOT call driver.quit(): that would close your logged-in Chrome.


# ======================================================================
# Routes
# ======================================================================
@router.post("/update-linkedin", status_code=202)
def start_update(body: UpdateRequest, bg: BackgroundTasks):
    ids = [i for i in dict.fromkeys(body.ids) if ObjectId.is_valid(i)]
    if not ids:
        raise HTTPException(400, "No valid prospect ids")
    if len(ids) > MAX_IDS_PER_JOB:
        raise HTTPException(400, f"Select {MAX_IDS_PER_JOB} records or fewer")
    if views_today() >= DAILY_PROFILE_LIMIT:
        raise HTTPException(429, f"Daily limit of {DAILY_PROFILE_LIMIT} profile views reached. Try tomorrow.")

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "state": "running", "total": len(ids), "processed": 0,
        "results": [], "error": None, "current": "",
    }
    bg.add_task(run_job, job_id, ids)
    return {"jobId": job_id}


@router.get("/update-linkedin-usage")
def update_usage():
    used = views_today()
    return {"usedToday": used, "dailyLimit": DAILY_PROFILE_LIMIT, "remaining": max(0, DAILY_PROFILE_LIMIT - used)}


@router.get("/update-linkedin/{job_id}")
def update_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job