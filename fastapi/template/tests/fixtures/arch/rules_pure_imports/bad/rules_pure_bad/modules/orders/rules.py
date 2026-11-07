from rules_pure_bad.modules.orders.limits import LIMIT


def too_many(n):
    return n > LIMIT
