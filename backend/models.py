# backend/models.py
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Patient(db.Model):
    __tablename__ = "patients"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    devices = db.relationship("Device", back_populates="patient")

class Device(db.Model):
    __tablename__ = "devices"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), index=True)
    name = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    patient = db.relationship("Patient", back_populates="devices")
    readings = db.relationship("DeviceReading", back_populates="device", order_by="DeviceReading.created_at")

class DeviceReading(db.Model):
    __tablename__ = "device_readings"
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey("devices.id"), index=True)
    temperature = db.Column(db.Float, nullable=True)
    heart_rate = db.Column(db.Float, nullable=True)
    battery = db.Column(db.Float, nullable=True)  # store as 0..100
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    device = db.relationship("Device", back_populates="readings")

class HealthSummary(db.Model):
    __tablename__ = "health_summaries"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, index=True)
    summary_text = db.Column(db.Text)
    source = db.Column(db.String, default="rule")  # "rule" or "llm"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
