from fastapi import FastAPI
from .routers import devices  # keep all device-related routes in the router

app = FastAPI()

# Include routers
app.include_router(devices.router)
