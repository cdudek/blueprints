from sqlalchemy.orm import Mapped, mapped_column

from table_owners_bad import Base


class PaymentRequest(Base):
    __tablename__ = "payment_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
