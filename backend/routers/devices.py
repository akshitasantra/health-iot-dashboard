from fastapi import APIRouter
from typing import List
from pydantic import BaseModel

router = APIRouter(
    prefix="/devices",
    tags=["devices"]
)

# Pydantic model for a device
class Device(BaseModel):
    id: int
    name: str
    readings: List[int]

# Example in-memory devices data
devices_db = [
    {"id": 1, "name": "Heart Rate Sensor", "readings": [72, 75, 73]},
    {"id": 2, "name": "Temperature Sensor", "readings": [98, 99, 100]},
]

@router.get("/", response_model=List[Device])
def get_devices():
    return devices_db
