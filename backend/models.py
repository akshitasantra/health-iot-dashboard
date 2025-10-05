from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from .database import Base

class DeviceData(Base):
    __tablename__ = "device_data"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, nullable=False)
    heart_rate = Column(Float)
    blood_pressure = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
