from app.db.transaction import in_transaction
from app.modules.orders.service import create_order


async def post_order(data):
    async with in_transaction() as tx:
        return await create_order(tx, data)
