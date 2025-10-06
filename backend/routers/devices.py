from fastapi import APIRouter, WebSocket
import asyncio, random
from typing import List, Dict

router = APIRouter()

Device = Dict[str, any]

devices: List[Device] = [
    {
        "id": 1,
        "name": "Heart Rate Sensor",
        "temperature": 98.6,
        "heart_rate": 75,
        "battery": 100,
    },
    {
        "id": 2,
        "name": "Temperature Sensor",
        "temperature": 99.1,
        "heart_rate": 72,
        "battery": 92,
    },
]


def simulate_device_data(device: Device):
    device["temperature"] += random.uniform(-0.2, 0.2)
    device["heart_rate"] += random.randint(-2, 2)
    device["battery"] = max(0, device["battery"] - random.uniform(0.01, 0.05))

    if device["heart_rate"] > 100 or device["temperature"] > 100.4:
        device["status"] = "critical"
    elif device["heart_rate"] < 60 or device["temperature"] < 97.0:
        device["status"] = "warning"
    else:
        device["status"] = "normal"


@router.websocket("/ws/devices")
async def websocket_devices(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            for d in devices:
                simulate_device_data(d)
            await ws.send_json(devices)
            await asyncio.sleep(1)
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        # don’t close twice; let FastAPI handle if already disconnected
        try:
            await ws.close()
        except RuntimeError:
            pass
