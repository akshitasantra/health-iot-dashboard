from fastapi import APIRouter

router = APIRouter(
    prefix="/health",
    tags=["health"]
)

# Example endpoint: get all health readings
@router.get("/")
def get_health_data():
    # For now, return mock data
    return {
        "heart_rate": 72,
        "blood_pressure": "120/80",
        "temperature": 98.6
    }

# Example endpoint: get health summary
@router.get("/summary")
def get_health_summary():
    return {
        "status": "All systems normal",
        "alerts": [],
        "last_update": "2025-10-05T18:00:00"
    }
