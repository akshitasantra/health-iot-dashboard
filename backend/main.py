from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import random
from datetime import datetime

# Import the patients router
from .routers import patients

app = FastAPI()

# Enable frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # during development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the patients router
app.include_router(patients.router)

# Mock IoT device data for legacy /ws/devices (optional)
devices = [
    {
        "id": 1,
        "name": "Heart Rate Sensor",
        "temperature": 98.6,
        "heartRate": 75,
        "battery": 100,
        "readings": [],
    },
    {
        "id": 2,
        "name": "Temperature Sensor",
        "temperature": 99.0,
        "heartRate": 0,
        "battery": 90,
        "readings": [],
    },
]

@app.websocket("/ws/devices")
async def websocket_devices(ws: WebSocket):
    await ws.accept()
    while True:
        now = datetime.now().strftime("%H:%M:%S")
        for device in devices:
            # Add random small variation
            if "Heart" in device["name"]:
                device["heartRate"] += random.randint(-2, 2)
            if "Temperature" in device["name"]:
                device["temperature"] += random.uniform(-0.1, 0.1)
            device["battery"] = max(0, device["battery"] - random.uniform(0, 0.01))

            # Append new reading (for the chart)
            device["readings"].append(
                {"time": now, "value": device["heartRate"] or device["temperature"]}
            )
            # Limit to last 50 readings
            device["readings"] = device["readings"][-50:]

        await ws.send_json(devices)
        await asyncio.sleep(0.5)
