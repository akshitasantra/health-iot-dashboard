from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock device data
devices = [
    {"deviceName": "Device A", "heart_rate": 72, "blood_pressure": "120/80", "temperature": 98.6},
    {"deviceName": "Device B", "heart_rate": 65, "blood_pressure": "115/75", "temperature": 97.9},
    {"deviceName": "Device C", "heart_rate": 80, "blood_pressure": "130/85", "temperature": 99.1},
]

@app.get("/devices")
def get_devices():
    return devices
