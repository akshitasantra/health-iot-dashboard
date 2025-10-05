from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import devices, health  # import your routers

# 1️⃣ Create the FastAPI app first
app = FastAPI()

# 2️⃣ Add CORS middleware
origins = ["http://localhost:5173"]  # Vite dev server URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3️⃣ Include your routers
app.include_router(devices.router)
app.include_router(health.router)

# 4️⃣ Optional root endpoint
@app.get("/")
def root():
    return {"message": "Health IoT Dashboard is running!"}
