from datetime import datetime


def is_late(deadline: datetime, now: datetime) -> bool:
    return now > deadline
