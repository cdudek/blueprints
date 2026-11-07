"""The worker root: `procrastinate --app=app.worker.app worker`. Never runs in the web process.

Workers heartbeat every 10 seconds; `retry_stalled_jobs` puts the jobs of a worker that stopped
heartbeating back in the queue (Procrastinate's documented recipe).
"""

from procrastinate import JobContext

from app.clients.payments import get_payments
from app.config.logging import configure_logging
from app.config.settings import get_settings
from app.db.queue import STALLED_AFTER_SECONDS, queue
from app.modules.billing import jobs as billing_jobs

configure_logging(get_settings().log_level)
get_payments()  # a missing provider secret fails the worker at startup, not at the first charge
app = queue


@app.periodic(cron="* * * * *")
@app.task(name="retry_stalled_jobs", queueing_lock="retry_stalled_jobs", pass_context=True)
async def retry_stalled_jobs(context: JobContext, timestamp: int) -> None:
    manager = context.app.job_manager
    for job in await manager.get_stalled_jobs(seconds_since_heartbeat=STALLED_AFTER_SECONDS):
        await manager.retry_job(job)


__all__ = ["app", "billing_jobs", "retry_stalled_jobs"]
