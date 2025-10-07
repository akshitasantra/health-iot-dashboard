# backend/models.py
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    devices = relationship("Device", back_populates="patient", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), index=True, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="devices")
    readings = relationship("DeviceReading", back_populates="device", order_by="DeviceReading.created_at", cascade="all, delete-orphan")

class DeviceReading(Base):
    __tablename__ = "device_readings"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), index=True, nullable=False)
    temperature = Column(Float, nullable=True)
    heart_rate = Column(Float, nullable=True)
    battery = Column(Float, nullable=True)  # store 0..100
    created_at = Column(DateTime, default=datetime.utcnow)

    device = relationship("Device", back_populates="readings")

class HealthSummary(Base):
    __tablename__ = "health_summaries"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, index=True, nullable=False)
    summary_text = Column(Text)
    source = Column(String, default="rule")  # "rule" or "llm"
    created_at = Column(DateTime, default=datetime.utcnow)
