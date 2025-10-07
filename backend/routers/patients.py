# backend/routers/patients.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict, Any
import asyncio, random, time

router = APIRouter()

Device = Dict[str, Any]
Patient = Dict[str, Any]

# initial sample data (2 patients, each with 2 devices)
initial_patients: List[Patient] = [
    {
        "id": 1,
        "name": "Patient 1",
        "devices": [
            {"id": 1, "name": "Heart Rate Sensor", "temperature": 98.6, "heartRate": 75, "battery": 100, "readings": []},
            {"id": 2, "name": "Temperature Sensor", "temperature": 99.1, "heartRate": 72, "battery": 92, "readings": []},
        ],
    },
    {
        "id": 2,
        "name": "Patient 2",
        "devices": [
            {"id": 3, "name": "Heart Rate Sensor", "temperature": 97.9, "heartRate": 68, "battery": 98, "readings": []},
            {"id": 4, "name": "Temperature Sensor", "temperature": 99.4, "heartRate": 70, "battery": 95, "readings": []},
        ],
    },
]

# WebSocket manager helper
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast_json(self, data):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                # will cleanup on disconnects
                dead.append(ws)
        for d in dead:
            self.disconnect(d)

manager = ConnectionManager()

# lightweight getter endpoints
@router.get("/api/patients")
async def get_patients(request=None):
    from fastapi import Request
    # access the in-memory patients stored on the app
    # if the endpoint is called via FastAPI, request will be provided
    # but FastAPI allows no-arg call too; we'll reference the global fallback
    # the main app sets app.state.patients_data
    try:
        app = Request.scope["app"]  # not normally used, leave for type safety
    except Exception:
        app = None
    data = None
    # try to read from import of module-level (will be set by main startup)
    try:
        from fastapi import FastAPI
        # we can't reliably access request here easily; just attempt to import app state
    except Exception:
        pass
    # safe fallback: returned later by main having set patients_data in app.state
    # The main app also mounts router; the global patients are stored in the module attribute - set below in startup
    return router_include_patients()

def router_include_patients():
    # This helper returns the current in-memory patients stored on this module
    # main.py will set patients_data on this module variable
    global patients_data
    try:
        return patients_data
    except NameError:
        # if not set, return initial sample (safe fallback)
        return initial_patients

@router.websocket("/ws/patients")
async def websocket_patients(ws: WebSocket):
    """
    Clients connect here and receive periodic JSON frames with the array of patient objects.
    The simulation & broadcasting runs as a background task (in main.py) and writes to app module-level patients_data.
    """
    await manager.connect(ws)
    try:
        # keep the connection open. We don't expect client messages, but if they send, we acknowledge.
        while True:
            # just receive to detect client disconnects; will block until the client sends or disconnects.
            try:
                await ws.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                # ignore other receive issues — keep socket open
                await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)
