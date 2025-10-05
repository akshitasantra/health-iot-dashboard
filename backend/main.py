from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import devices

app = FastAPI()

# Allow your frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)

@app.get("/")
def root():
    return {"message": "Health IoT Dashboard running!"}
