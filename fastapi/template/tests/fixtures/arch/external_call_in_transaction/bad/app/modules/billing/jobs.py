from app.clients.payments import Payments
from app.db.transaction import in_transaction


async def run(request, payments: Payments):
    async with in_transaction() as tx:
        await payments.charge(amount_cents=1, currency="EUR", reference="r", idempotency_key="k")
        await tx.flush()
