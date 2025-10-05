from sqlalchemy import Column, Integer, String, Float
from .database import Base

class DeviceData(Base):
    __tablename__ = "device_data"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String)
    heart_rate = Column(Float)
    blood_pressure = Column(String)
