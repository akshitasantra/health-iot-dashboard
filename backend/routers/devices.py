from fastapi import APIRouter, WebSocket
import asyncio, random

router = APIRouter()

devices = [
    {"id": 1, "name": "Heart Rate Sensor", "readings": [72, 75, 73]},
    {"id": 2, "name": "Temperature Sensor", "readings": [98, 99, 100]},
]

@router.websocket("/ws/devices")  # <-- this path is what the frontend connects to
async def websocket_devices(ws: WebSocket):
    await ws.accept()
    while True:
        for device in devices:
            new_value = device["readings"][-1] + random.randint(-2, 2)
            device["readings"].append(new_value)
        await ws.send_json(devices)
        await asyncio.sleep(2)
