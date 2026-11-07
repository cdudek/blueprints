from app.shared.access import operation


@operation(access="system")
async def mark_paid(tx, order_id):
    return None
