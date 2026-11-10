# backend/main.py

import uuid
import json
import os
from pathlib import Path
from typing import List, Dict, Any
import subprocess
import sys
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.responses import StreamingResponse
import asyncio
from fastapi import Form
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from pymongo import MongoClient
sys.path.insert(0, str(Path(__file__).resolve().parent))
from linkedin_update import router as linkedin_update_router

# --- Paths and setup ---
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATA_FILE = DATA_DIR / "filters.json"

# --- MongoDB Configuration ---
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_TIMEOUT_MS = int(os.getenv("MONGO_TIMEOUT_MS", "5000"))
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "Final_Code")
MONGO_COLLECTION_NAME = os.getenv("MONGO_COLLECTION_NAME", "Demo")

USERS = {
    
    "Sachin": "sachin@123",
}

app = FastAPI()
app.add_middleware(
    SessionMiddleware,
    secret_key="bb78e9cbc128a2ce3a85a0d749bf1e0b5dc1cfefd10ee45c9f354386d9ebebab"
)

templates = Jinja2Templates(directory=str(BASE_DIR.parent / "templates"))

# Allow frontend access (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(linkedin_update_router)   # <-- here
# Serve static files
static_dir = BASE_DIR.parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# --- Helper functions for reading/writing JSON data ---
def read_all_filters() -> List[Dict[str, Any]]:
    """Read all saved filters from the JSON file."""
    if not DATA_FILE.exists():
        return []
    
    try:
        with DATA_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else []
    except Exception:
        return [] 


def write_all_filters(filters: List[Dict[str, Any]]) -> None:
    """Write all filters to the JSON file."""
    with DATA_FILE.open("w", encoding="utf-8") as fh:
        json.dump(filters, fh, indent=2, ensure_ascii=False)


def format_stream_error(error: Any) -> str:
    """Keep streamed errors on one SSE data line so the browser can display them."""
    return str(error).replace("\r\n", " | ").replace("\n", " | ")


def error_stream_response(message: Any) -> StreamingResponse:
    async def stream_error():
        yield f"data: ERROR: {format_stream_error(message)}\n\n"

    return StreamingResponse(
        stream_error(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- Routes ---

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    if "user" not in request.session:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/filters")
async def api_get_filters():
    """Return all saved filters."""
    filters = read_all_filters()
    return JSONResponse({"ok": True, "data": filters})


@app.post("/api/filters")
async def api_create_filter_stream(request: Request):
    if "user" not in request.session:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = await request.json()
        backend_id = str(uuid.uuid4())
        record = dict(payload)
        csv_data = record.pop("csv_data", None)

        collection_name = record.get("search_name")
        if not collection_name:
            raise ValueError("search_name required")

        if csv_data is not None and not isinstance(csv_data, dict):
            raise ValueError("csv_data must be an object with column names as keys")

        rows = []
        columns = csv_data.keys() if csv_data else []

        if columns:
            length = len(next(iter(csv_data.values()), []))

            for i in range(length):
                row = {}
                for col in columns:
                    row[col] = csv_data[col][i] if i < len(csv_data[col]) else None
                rows.append(row)

        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=MONGO_TIMEOUT_MS)
        db = client[MONGO_DB_NAME]

        # Clear old data
        db[collection_name].drop()

        # Insert new data
        if rows:
            db[collection_name].insert_many(rows)
            
        record["login_user"] = request.session.get("user")
        record["__backendId"] = backend_id

        from datetime import datetime
        record["created_at"] = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

        filters = read_all_filters()
        filters.insert(0, record)
        write_all_filters(filters)
    except Exception as e:
        return error_stream_response(f"FastAPI setup error before scripts started: {e}")

    async def event_stream():
        try:
            yield "data: 0\n\n"

            # Check if SN_Link is already provided
            sn_link_provided = bool(record.get("SN_Link"))

            csv_data_provided = csv_data is not None

            # Define your scripts
            scripts = [
                ("SN_Link_Creator.py", 10),
                ("Sales_Navigator.py", 20),
                ("URL_Update.py", 35),
                ("Country_Finder.py", 40),
                ("Website.py", 45),
                ("Address.py", 45),
                ("Zipcode.py", 50),
                ("Exact_Revenue.py", 60),
                ("Mapping.py", 65),
                ("Final_Clean.py", 75),
                ("Phone.py", 80),
                ("Phone_code.py", 85),
                ("Email.py", 95),
                ("Pattern.py",99),
                ("Separation.py", 100),
            ]

            for script, progress in scripts:

                # Skip rules
                if script == "SN_Link_Creator.py" and sn_link_provided:
                    yield f"data: Skipping {script}, link already provided\n\n"
                    continue

                if script == "Separation.py" and not csv_data_provided:
                    yield f"data: Skipping {script}, csv_data is null\n\n"
                    continue

                # Run script
                yield f"data: Running {script}...\n\n"

                proc = await asyncio.create_subprocess_exec(
                    sys.executable,
                    str(BASE_DIR / script),
                    json.dumps(record),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

                stdout, stderr = await proc.communicate()

                if proc.returncode != 0:
                    error_output = stderr.decode(errors="replace").strip()
                    if not error_output:
                        error_output = stdout.decode(errors="replace").strip()
                    error_output = error_output.replace("\r\n", " | ").replace("\n", " | ")
                    yield f"data: ERROR in {script}: {error_output}\n\n"
                    return

                yield f"data: {progress}\n\n"

            yield "data: done\n\n"

        except asyncio.CancelledError:
            # Client disconnected
            return
        except Exception as e:
            error_output = str(e).replace("\r\n", " | ").replace("\n", " | ")
            yield f"data: ERROR: {error_output}\n\n"


    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.delete("/api/filters/{backend_id}")
async def api_delete_filter(backend_id: str):
    """Delete a filter by backend ID."""
    filters = read_all_filters()
    new_filters = [f for f in filters if f.get("__backendId") != backend_id]
    if len(new_filters) == len(filters):
        raise HTTPException(status_code=404, detail="Filter not found")

    write_all_filters(new_filters)
    return JSONResponse({"ok": True, "deleted": backend_id})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
async def login_submit(
    request: Request,
    username: str = Form(...),
    password: str = Form(...)
):
    if username in USERS and USERS[username] == password:
        request.session["user"] = username
        return RedirectResponse(url="/", status_code=303)

    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Invalid username or password"},
        status_code=401
    )



@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login")
