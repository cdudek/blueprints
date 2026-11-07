from app.db.transaction import in_transaction


async def create_order(tx, data):
    async with in_transaction() as inner:
        await inner.commit()
