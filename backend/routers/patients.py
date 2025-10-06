# backend/routers/patients.py
from fastapi import APIRouter, WebSocket
import asyncio, random
from typing import List, Dict

router = APIRouter()

# Define types
Device = Dict[str, any]
Patient = Dict[str, any]

# Sample data: 2 patients, each with 2 devices
patients: List[Patient] = [
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

# Simulate device readings
def simulate_device(device: Device):
    device["temperature"] += random.uniform(-0.3, 0.3)
    device["heartRate"] += random.randint(-3, 3)
    device["battery"] = max(0, device["battery"] - random.uniform(0.01, 0.05))

    # Alert level
    if device["heartRate"] > 100 or device["temperature"] > 100.4:
        device["alertLevel"] = "red"
    elif device["heartRate"] < 60 or device["temperature"] < 97.0:
        device["alertLevel"] = "yellow"
    else:
        device["alertLevel"] = "green"

# WebSocket endpoint
@router.websocket("/ws/patients")
async def websocket_patients(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            for patient in patients:
                for device in patient["devices"]:
                    simulate_device(device)
                    # Add timestamped reading
                    now = asyncio.get_event_loop().time()
                    device["readings"].append({
                        "time": now,
                        "value": device["temperature"] if "Temperature" in device["name"] else device["heartRate"]
                    })
                    # Keep only last 30 readings
                    device["readings"] = device["readings"][-30:]

            await ws.send_json(patients)
            await asyncio.sleep(1)
    except Exception:
        print("WebSocket connection closed.")
    finally:
        await ws.close()
