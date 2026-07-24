from datetime import datetime
from sqlalchemy import BigInteger, Boolean, ForeignKey, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Базовый класс для всех моделей SQLAlchemy"""
    pass


class User(Base):
    """Модель пользователя"""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True, index=True)
    login: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    photo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bonus_points: Mapped[int] = mapped_column(default=0)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    registered_at: Mapped[datetime] = mapped_column(default=func.now())

    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, login={self.login}, first_name={self.first_name})>"


class Booking(Base):
    """Модель записи клиента"""
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    service: Mapped[str] = mapped_column(String(255), nullable=False)
    master: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date: Mapped[str] = mapped_column(String(50), nullable=False)
    time: Mapped[str] = mapped_column(String(50), nullable=False)
    confirmed_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="new")
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    user: Mapped["User"] = relationship(back_populates="bookings")

    def __repr__(self) -> str:
        return f"<Booking(id={self.id}, service={self.service}, date={self.date})>"


class Promo(Base):
    """Модель акции"""
    __tablename__ = "promos"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    badge: Mapped[str | None] = mapped_column(String(50), nullable=True)
    badge_type: Mapped[str] = mapped_column(String(50), default="discount")
    expiry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str] = mapped_column(String(50), default="discount")
    icon: Mapped[str] = mapped_column(String(100), default="icon-promos.png")
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    def __repr__(self) -> str:
        return f"<Promo(id={self.id}, title={self.title})>"


class Review(Base):
    """Модель отзыва"""
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    rating: Mapped[int] = mapped_column(nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<Review(id={self.id}, rating={self.rating})>"


class Service(Base):
    """Модель услуги"""
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    price: Mapped[int] = mapped_column(default=0)
    duration: Mapped[int] = mapped_column(default=60)
    icon: Mapped[str] = mapped_column(String(100), default="icon-more.png")
    sort_order: Mapped[int] = mapped_column(default=0)

    def __repr__(self) -> str:
        return f"<Service(id={self.id}, name={self.name}, price={self.price})>"
