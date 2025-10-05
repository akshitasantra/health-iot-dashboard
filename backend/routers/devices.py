from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import DeviceData

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/data")
def add_data(device_id: str, heart_rate: float, blood_pressure: str, db: Session = Depends(get_db)):
    new_data = DeviceData(device_id=device_id, heart_rate=heart_rate, blood_pressure=blood_pressure)
    db.add(new_data)
    db.commit()
    db.refresh(new_data)
    return new_data
