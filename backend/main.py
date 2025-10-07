# backend/main.py
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
import random
import time
from typing import List, Dict, Any
import asyncio

from .database import Base, engine, SessionLocal
from . import models
from .routers import patients as patients_router  # our router module (sets manager)

# set up FastAPI
app = FastAPI(title="Health IoT Dashboard Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# include routers
app.include_router(patients_router.router)

# create tables at startup
@app.on_event("startup")
async def startup_event():
    # create DB tables (sync)
    Base.metadata.create_all(bind=engine)

    # initialize module-level in-memory patients_data for the router to read
    global patients_data
    patients_data = patients_router.initial_patients.copy()

    # store in the router module as well (the router's helper expects this name)
    patients_router.patients_data = patients_data

    # keep a list of connected websockets manager
    global ws_manager
    ws_manager = patients_router.manager

    # start background tasks: simulate telemetry and generate summaries
    app.state._sim_task = asyncio.create_task(simulate_and_broadcast())
    app.state._summary_task = asyncio.create_task(generate_and_store_summaries())

@app.on_event("shutdown")
async def shutdown_event():
    # cancel background tasks
    for tname in ("_sim_task", "_summary_task"):
        t = app.state.__dict__.get(tname)
        if t:
            t.cancel()
    # close any open DB connections or cleanup if needed

# helper: run DB work in thread
async def db_write(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)

# function to insert a device reading
def persist_reading_sync(device_id: int, temperature: float | None, heart_rate: float | None, battery: float | None):
    db = SessionLocal()
    try:
        # create reading row
        r = models.DeviceReading(device_id=device_id, temperature=temperature, heart_rate=heart_rate, battery=battery)
        db.add(r)
        db.commit()
    finally:
        db.close()

# function to insert a health summary row
def persist_summary_sync(patient_id: int, text: str, source: str = "rule"):
    db = SessionLocal()
    try:
        s = models.HealthSummary(patient_id=patient_id, summary_text=text, source=source)
        db.add(s)
        db.commit()
    finally:
        db.close()

# simple rule to build a one-line summary
def build_summary_for_patient(patient: Dict[str, Any]) -> str:
    temps = []
    hrs = []
    for d in patient.get("devices", []):
        if isinstance(d.get("temperature"), (int, float)):
            temps.append(d["temperature"])
        if isinstance(d.get("heartRate"), (int, float)):
            hrs.append(d["heartRate"])
    avg_temp = sum(temps) / len(temps) if temps else None
    avg_hr = sum(hrs) / len(hrs) if hrs else None

    parts = []
    if avg_hr is not None:
        if avg_hr > 100:
            parts.append("Elevated heart rate.")
        elif avg_hr < 60:
            parts.append("Low heart rate.")
    if avg_temp is not None:
        if avg_temp > 99:
            parts.append("Temperature slightly elevated.")
        elif avg_temp < 97:
            parts.append("Temperature slightly low.")
    if not parts:
        parts.append("Vitals stable.")
    return f"{patient['name']}: {' '.join(parts)}"

# background simulation + broadcast loop
async def simulate_and_broadcast():
    """
    Update the in-memory patients_data, append timestamped readings, persist to DB occasionally,
    and broadcast the full patients array to connected WebSocket clients.
    """
    from .routers import patients as pmod  # re-import to ensure module-scope objects
    global patients_data
    patients_data = pmod.initial_patients.copy()
    pmod.patients_data = patients_data

    # how often to persist each reading to DB (persist every N updates to avoid DB flood)
    PERSIST_EVERY = 5
    counter = 0

    while True:
        now_ts = int(time.time())  # epoch seconds
        for patient in patients_data:
            for device in patient["devices"]:
                # simulate
                device_name = device["name"]
                if "Heart" in device_name:
                    device["heartRate"] = (device.get("heartRate") or 70) + random.randint(-2, 2)
                if "Temperature" in device_name:
                    device["temperature"] = (device.get("temperature") or 98.6) + random.uniform(-0.2, 0.2)
                device["battery"] = max(0, (device.get("battery") or 100) - random.uniform(0.0, 0.2))

                # set alert level
                if (device.get("heartRate") or 0) > 100 or (device.get("temperature") or 0) > 100.4:
                    device["alertLevel"] = "red"
                elif (device.get("heartRate") or 0) < 60 or (device.get("temperature") or 0) < 97.0:
                    device["alertLevel"] = "yellow"
                else:
                    device["alertLevel"] = "green"

                # append reading (time as epoch seconds for compactness; frontend will convert)
                value = device.get("temperature") if "Temperature" in device_name else device.get("heartRate")
                device["readings"].append({"time": now_ts, "value": value})
                # keep last 50
                device["readings"] = device["readings"][-50:]

                # persist occasionally
                if counter % PERSIST_EVERY == 0:
                    # offload DB write to thread
                    await db_write(persist_reading_sync,
                                   device_id=device.get("id", 0),
                                   temperature=device.get("temperature"),
                                   heart_rate=device.get("heartRate"),
                                   battery=device.get("battery"))

        counter += 1

        # broadcast JSON to connected websockets
        try:
            await pmod.manager.broadcast_json(patients_data)
        except Exception:
            pass

        # also update module var for router GETs
        pmod.patients_data = patients_data

        await asyncio.sleep(0.5)

# health summary background task (every 30s)
async def generate_and_store_summaries():
    from .routers import patients as pmod
    while True:
        current = pmod.patients_data
        for patient in current:
            text = build_summary_for_patient(patient)
            # persist summary row (offload to thread)
            await db_write(persist_summary_sync, patient_id=patient["id"], text=text, source="rule")
        await asyncio.sleep(30)  # 30s between summaries

# REST endpoint to read latest summaries (one-per-patient)
@app.get("/api/summaries")
async def get_latest_summaries():
    db = SessionLocal()
    try:
        # for each patient get the most recent HealthSummary row
        results = {}
        for p in pmod_get_patients_ids():
            row = db.query(models.HealthSummary).filter(models.HealthSummary.patient_id == p).order_by(models.HealthSummary.created_at.desc()).first()
            results[p] = {"summary": row.summary_text if row else None, "ts": row.created_at.isoformat() if row else None}
        return results
    finally:
        db.close()

# Helper to get patient ids from in-memory data
def pmod_get_patients_ids():
    try:
        return [p["id"] for p in patients_data]
    except Exception:
        return []

# optional convenience route to get current in-memory snapshot
@app.get("/api/current")
async def current_snapshot():
    return patients_data
