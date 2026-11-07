from rules_pure_ok.modules.orders.limits import LIMIT


def too_many(n):
    return n > LIMIT
