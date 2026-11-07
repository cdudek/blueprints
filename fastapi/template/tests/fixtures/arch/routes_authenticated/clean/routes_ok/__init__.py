from fastapi import APIRouter, FastAPI

from app.shared.http import CurrentUser

router = APIRouter(prefix="/v1")


@router.get("/orders")
async def list_orders(principal: CurrentUser) -> list[str]:
    return []


app = FastAPI()
app.include_router(router)
