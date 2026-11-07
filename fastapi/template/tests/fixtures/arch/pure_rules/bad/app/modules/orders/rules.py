import random
from datetime import datetime


def is_late(deadline):
    return datetime.now() > deadline or random.random() > 0.5
