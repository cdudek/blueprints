from fastapi import FastAPI

app = FastAPI()


@app.get("/v1/orders")
async def list_orders() -> list[str]:
    return []
