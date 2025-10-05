from fastapi import APIRouter, WebSocket
import asyncio, random
from typing import List, Dict

router = APIRouter()

Device = Dict[str, any]

devices: List[Device] = [
    {"id": 1, "name": "Heart Rate Sensor", "readings": [72, 75, 73]},
    {"id": 2, "name": "Temperature Sensor", "readings": [98, 99, 100]},
]

def simulate_reading(device: Device) -> int:
    """Generate a new reading based on the last value."""
    return device["readings"][-1] + random.randint(-2, 2)

@router.websocket("/ws/devices")
async def websocket_devices(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            for device in devices:
                device["readings"].append(simulate_reading(device))
            await ws.send_json(devices)
            await asyncio.sleep(0.5)  # smoother updates
    except Exception:
        await ws.close()
