import hashlib
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from config.settings import settings
from database.connection import get_session, init_db
from database.models import Booking, Promo, Review, User, Service


STATIC_DIR = Path(__file__).parent / "static"

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Хэширование пароля (SHA-256 + соль)"""
    salt = "kriscom_salt_2024"
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def get_admin_ids() -> list[int]:
    """Список Telegram ID администраторов из конфига"""
    return [int(x.strip()) for x in str(settings.ADMIN_ID).split(",") if x.strip()]


async def notify_admins(text: str) -> None:
    """Отправка уведомления всем администраторам через Telegram Bot API"""
    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient() as client:
        for admin_id in get_admin_ids():
            try:
                resp = await client.post(url, json={
                    "chat_id": admin_id,
                    "text": text,
                    "parse_mode": "HTML",
                })
                if resp.status_code != 200:
                    logger.error("Ошибка отправки админу %s: %s", admin_id, resp.text)
            except Exception as e:
                logger.error("Ошибка отправки админу %s: %s", admin_id, e)


async def notify_user(user: User, text: str) -> None:
    """Отправка уведомления пользователю (если есть telegram_id)"""
    if not user.telegram_id:
        return
    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={
                "chat_id": user.telegram_id,
                "text": text,
                "parse_mode": "HTML",
            })
        except Exception as e:
            logger.error("Ошибка отправки пользователю %s: %s", user.telegram_id, e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Kris Com Mini App", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=Path(__file__).parent / "uploads"), name="uploads")


# ==================== API MODELS ====================

class RegisterRequest(BaseModel):
    login: str
    password: str
    first_name: str
    phone: str | None = None


class LoginRequest(BaseModel):
    login: str
    password: str


class BookingRequest(BaseModel):
    user_id: int
    service: str
    master: str | None = None
    date: str
    time: str
    phone: str | None = None
    comment: str | None = None


class ConfirmRequest(BaseModel):
    confirmed_time: str


class RejectRequest(BaseModel):
    reason: str | None = None


class BonusRequest(BaseModel):
    login: str
    amount: int


class PromoRequest(BaseModel):
    title: str
    badge: str | None = None
    badge_type: str = "discount"
    expiry: str | None = None
    category: str = "discount"
    icon: str = "icon-promos.png"


class ReviewRequest(BaseModel):
    user_id: int
    booking_id: int
    rating: int
    text: str | None = None
    photo: str | None = None


class UserResponse(BaseModel):
    id: int
    login: str
    first_name: str
    phone: str | None
    photo: str | None = None
    bonus_points: int
    is_admin: bool


# ==================== AUTH ROUTES ====================

@app.post("/api/register")
async def register(req: RegisterRequest):
    """Регистрация нового пользователя"""
    if len(req.login) < 3:
        raise HTTPException(400, "Логин должен быть от 3 символов")
    if len(req.password) < 4:
        raise HTTPException(400, "Пароль должен быть от 4 символов")

    async with get_session() as session:
        exists = await session.execute(
            select(User).where(User.login == req.login)
        )
        if exists.scalar_one_or_none():
            raise HTTPException(409, "Такой логин уже занят")

        user = User(
            login=req.login,
            password_hash=hash_password(req.password),
            first_name=req.first_name,
            phone=req.phone,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        # Первый пользователь автоматически становится админом
        count_result = await session.execute(select(User))
        if len(count_result.scalars().all()) <= 1:
            user.is_admin = True
            await session.commit()
            await session.refresh(user)

        return {
            "ok": True,
            "user": UserResponse(
                id=user.id,
                login=user.login,
                first_name=user.first_name,
                phone=user.phone,
                bonus_points=user.bonus_points,
                is_admin=user.is_admin,
            ).model_dump(),
        }


@app.post("/api/login")
async def login(req: LoginRequest):
    """Вход пользователя"""
    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.login == req.login)
        )
        user = result.scalar_one_or_none()

        if not user or user.password_hash != hash_password(req.password):
            raise HTTPException(401, "Неверный логин или пароль")

        return {
            "ok": True,
            "user": UserResponse(
                id=user.id,
                login=user.login,
                first_name=user.first_name,
                phone=user.phone,
                bonus_points=user.bonus_points,
                is_admin=user.is_admin,
            ).model_dump(),
        }


@app.get("/api/profile/{user_id}")
async def get_profile(user_id: int):
    """Получение профиля пользователя"""
    async with get_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(404, "Пользователь не найден")

        return {
            "ok": True,
            "user": UserResponse(
                id=user.id,
                login=user.login,
                first_name=user.first_name,
                phone=user.phone,
                photo=user.photo,
                bonus_points=user.bonus_points,
                is_admin=user.is_admin,
            ).model_dump(),
        }


@app.post("/api/profile/{user_id}/avatar")
async def upload_avatar(user_id: int, request: Request):
    """Загрузка аватарки пользователя"""
    from fastapi import UploadFile

    form = await request.form()
    photo = form.get("photo")

    if not photo or not hasattr(photo, "filename") or not photo.filename:
        raise HTTPException(400, "Фото не загружено")

    ext = Path(photo.filename).suffix or ".jpg"
    filename = f"avatar_{user_id}_{uuid.uuid4().hex[:8]}{ext}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    content = await photo.read()
    (UPLOAD_DIR / filename).write_bytes(content)

    photo_path = f"/uploads/{filename}"

    async with get_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "Пользователь не найден")
        user.photo = photo_path
        await session.commit()

    return {"ok": True, "photo": photo_path}


# ==================== BOOKING ROUTES ====================

@app.post("/api/book")
async def create_booking(req: BookingRequest):
    """Создание записи + уведомление админам"""
    phone = req.phone or ""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) != 11 or not digits.startswith("7"):
        raise HTTPException(400, "Введите корректный номер телефона: +7 999 123 45 67")

    async with get_session() as session:
        result = await session.execute(select(User).where(User.id == req.user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "Пользователь не найден")

        # Проверка занятости слота
        conflict = await session.execute(
            select(Booking).where(
                Booking.date == req.date,
                Booking.time == req.time,
                Booking.status.in_(["new", "confirmed"]),
            )
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(409, "Это время уже занято. Выберите другое.")

        booking = Booking(
            user_id=req.user_id,
            service=req.service,
            master=req.master,
            date=req.date,
            time=req.time,
            phone=req.phone or user.phone,
            comment=req.comment,
            status="new",
        )
        session.add(booking)
        await session.commit()
        await session.refresh(booking)

        master_line = f"👤 Мастер: {req.master}\n" if req.master else ""
        phone_line = f"📞 Телефон: {req.phone or user.phone or 'не указан'}\n"
        comment_line = f"💬 Комментарий: {req.comment}\n" if req.comment else ""

        admin_text = (
            f"🔔 <b>Новая запись!</b>\n\n"
            f"🆔 Запись #{booking.id}\n"
            f"👤 Клиент: {user.first_name} (@{user.login})\n"
            f"💄 Услуга: {req.service}\n"
            f"{master_line}"
            f"📅 Дата: {req.date}\n"
            f"🕐 Время: {req.time}\n"
            f"{phone_line}"
            f"{comment_line}"
            f"Статус: 🆕 Новая"
        )

        await notify_admins(admin_text)

        return {"ok": True, "booking_id": booking.id}


@app.get("/api/bookings/{user_id}")
async def get_bookings(user_id: int):
    """Получение списка записей пользователя"""
    async with get_session() as session:
        result = await session.execute(
            select(Booking)
            .where(Booking.user_id == user_id)
            .order_by(Booking.created_at.desc())
        )
        bookings = result.scalars().all()

        booking_ids = [b.id for b in bookings]
        reviews_result = await session.execute(
            select(Review.booking_id).where(Review.booking_id.in_(booking_ids))
        )
        reviewed_ids = {row[0] for row in reviews_result.all()}

        return {
            "ok": True,
            "bookings": [
                {
                    "id": b.id,
                    "service": b.service,
                    "master": b.master,
                    "date": b.date,
                    "time": b.time,
                    "confirmed_time": b.confirmed_time,
                    "status": b.status,
                    "reject_reason": b.reject_reason,
                    "has_review": b.id in reviewed_ids,
                    "created_at": b.created_at.isoformat(),
                }
                for b in bookings
            ],
        }


@app.get("/api/slots")
async def get_booked_slots(date: str):
    """Получение занятых слотов на дату"""
    async with get_session() as session:
        result = await session.execute(
            select(Booking.time).where(
                Booking.date == date,
                Booking.status.in_(["new", "confirmed"]),
            )
        )
        booked = [row[0] for row in result.all()]
        return {"ok": True, "booked": booked}


# ==================== PROMOS ====================

@app.get("/api/promos")
async def get_promos():
    """Получение всех акций"""
    async with get_session() as session:
        result = await session.execute(
            select(Promo).order_by(Promo.created_at.desc())
        )
        promos = result.scalars().all()
        return {
            "ok": True,
            "promos": [
                {
                    "id": p.id,
                    "title": p.title,
                    "badge": p.badge,
                    "badge_type": p.badge_type,
                    "expiry": p.expiry,
                    "category": p.category,
                    "icon": p.icon,
                }
                for p in promos
            ],
        }


@app.post("/api/admin/promos")
async def create_promo(req: PromoRequest):
    """Создание акции"""
    async with get_session() as session:
        promo = Promo(
            title=req.title,
            badge=req.badge,
            badge_type=req.badge_type,
            expiry=req.expiry,
            category=req.category,
            icon=req.icon,
        )
        session.add(promo)
        await session.commit()
        await session.refresh(promo)
        return {
            "ok": True,
            "promo": {
                "id": promo.id,
                "title": promo.title,
                "badge": promo.badge,
                "badge_type": promo.badge_type,
                "expiry": promo.expiry,
                "category": promo.category,
                "icon": promo.icon,
            },
        }


@app.delete("/api/admin/promos/{promo_id}")
async def delete_promo(promo_id: int):
    """Удаление акции"""
    async with get_session() as session:
        result = await session.execute(select(Promo).where(Promo.id == promo_id))
        promo = result.scalar_one_or_none()
        if not promo:
            raise HTTPException(404, "Акция не найдена")
        await session.delete(promo)
        await session.commit()
        return {"ok": True}


# ==================== REVIEWS ====================

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@app.post("/api/reviews")
async def create_review(
    request: Request,
    user_id: int = Form(...),
    booking_id: int = Form(...),
    rating: int = Form(...),
    text: str = Form(""),
):
    """Создание отзыва с опциональным фото"""
    if rating < 1 or rating > 5:
        raise HTTPException(400, "Оценка от 1 до 5")

    photo_path = None
    form = await request.form()
    photo = form.get("photo")
    if photo and hasattr(photo, "filename") and photo.filename and photo.filename != "":
        ext = Path(photo.filename).suffix or ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = UPLOAD_DIR / filename
        content = await photo.read()
        with open(filepath, "wb") as f:
            f.write(content)
        photo_path = f"/uploads/{filename}"

    async with get_session() as session:
        existing = await session.execute(
            select(Review).where(Review.booking_id == booking_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, "Отзыв на эту запись уже оставлен")

        review = Review(
            user_id=user_id,
            booking_id=booking_id,
            rating=rating,
            text=text,
            photo=photo_path,
        )
        session.add(review)
        await session.commit()
        return {"ok": True}


@app.get("/api/reviews")
async def get_reviews():
    """Получение отзывов для главной страницы"""
    async with get_session() as session:
        result = await session.execute(
            select(Review)
            .options(selectinload(Review.user))
            .order_by(Review.created_at.desc())
            .limit(10)
        )
        reviews = result.scalars().all()

        avg_result = await session.execute(select(func.avg(Review.rating)))
        avg_rating = avg_result.scalar()
        count_result = await session.execute(select(func.count(Review.id)))
        review_count = count_result.scalar()

        return {
            "ok": True,
            "avg_rating": round(float(avg_rating), 1) if avg_rating else 0,
            "review_count": review_count,
            "reviews": [
                {
                    "id": r.id,
                    "user_name": r.user.first_name,
                    "rating": r.rating,
                    "text": r.text,
                    "photo": r.photo,
                }
                for r in reviews
            ],
        }


@app.get("/api/portfolio")
async def get_portfolio():
    """Получение фото из отзывов для портфолио"""
    async with get_session() as session:
        result = await session.execute(
            select(Review)
            .options(selectinload(Review.user))
            .where(Review.photo.isnot(None))
            .order_by(Review.created_at.desc())
            .limit(20)
        )
        reviews = result.scalars().all()
        return {
            "ok": True,
            "photos": [
                {
                    "photo": r.photo,
                    "user_name": r.user.first_name,
                    "rating": r.rating,
                }
                for r in reviews
            ],
        }


@app.get("/api/portfolio")
async def get_portfolio():
    """Получение фото из отзывов для раздела 'Наши работы'"""
    async with get_session() as session:
        result = await session.execute(
            select(Review)
            .options(selectinload(Review.user))
            .where(Review.photo.isnot(None))
            .order_by(Review.created_at.desc())
            .limit(20)
        )
        reviews = result.scalars().all()
        return {
            "ok": True,
            "photos": [
                {
                    "id": r.id,
                    "user_name": r.user.first_name,
                    "rating": r.rating,
                    "text": r.text,
                    "photo": r.photo,
                }
                for r in reviews
            ],
        }


# ==================== ADMIN ROUTES ====================

@app.get("/api/admin/bookings")
async def admin_get_all_bookings():
    """Все записи (только для админов)"""
    async with get_session() as session:
        result = await session.execute(
            select(Booking)
            .options(selectinload(Booking.user))
            .order_by(Booking.created_at.desc())
        )
        bookings = result.scalars().all()
        return {
            "ok": True,
            "bookings": [
                {
                    "id": b.id,
                    "service": b.service,
                    "master": b.master,
                    "date": b.date,
                    "time": b.time,
                    "confirmed_time": b.confirmed_time,
                    "phone": b.phone,
                    "comment": b.comment,
                    "status": b.status,
                    "reject_reason": b.reject_reason,
                    "created_at": b.created_at.isoformat(),
                    "client_name": b.user.first_name,
                    "client_login": b.user.login,
                }
                for b in bookings
            ],
        }


@app.post("/api/admin/bookings/{booking_id}/confirm")
async def admin_confirm_booking(booking_id: int, req: ConfirmRequest):
    """Подтверждение записи с указанием времени"""
    async with get_session() as session:
        result = await session.execute(
            select(Booking).options(selectinload(Booking.user)).where(Booking.id == booking_id)
        )
        booking = result.scalar_one_or_none()
        if not booking:
            raise HTTPException(404, "Запись не найдена")
        if booking.status not in ("new",):
            raise HTTPException(400, "Запись уже обработана")

        booking.status = "confirmed"
        booking.confirmed_time = req.confirmed_time
        await session.commit()

        # Уведомление админам
        await notify_admins(
            f"✅ <b>Запись #{booking.id} подтверждена</b>\n\n"
            f"👤 {booking.user.first_name}\n"
            f"💄 {booking.service}\n"
            f"📅 {booking.date}\n"
            f"🕐 Время: {req.confirmed_time}"
        )

        # Уведомление клиенту (если есть telegram)
        await notify_user(
            booking.user,
            f"✅ Ваша запись подтверждена!\n\n"
            f"💄 {booking.service}\n"
            f"📅 {booking.date} в {req.confirmed_time}\n"
            f"👤 Мастер: {booking.master or 'не указан'}"
        )

        return {"ok": True}


@app.post("/api/admin/bookings/{booking_id}/reject")
async def admin_reject_booking(booking_id: int, req: RejectRequest):
    """Отклонение записи"""
    async with get_session() as session:
        result = await session.execute(
            select(Booking).options(selectinload(Booking.user)).where(Booking.id == booking_id)
        )
        booking = result.scalar_one_or_none()
        if not booking:
            raise HTTPException(404, "Запись не найдена")
        if booking.status not in ("new",):
            raise HTTPException(400, "Запись уже обработана")

        booking.status = "rejected"
        booking.reject_reason = req.reason
        await session.commit()

        reason_line = f"\nПричина: {req.reason}" if req.reason else ""

        await notify_admins(
            f"❌ <b>Запись #{booking.id} отклонена</b>\n\n"
            f"👤 {booking.user.first_name}\n"
            f"💄 {booking.service}\n"
            f"📅 {booking.date}"
            f"{reason_line}"
        )

        await notify_user(
            booking.user,
            f"❌ К сожалению, ваша запись отклонена.\n\n"
            f"💄 {booking.service}\n"
            f"📅 {booking.date}"
            f"{reason_line}\n\n"
            f"Попробуйте выбрать другое время."
        )

        return {"ok": True}


@app.post("/api/admin/bookings/{booking_id}/complete")
async def admin_complete_booking(booking_id: int):
    """Завершение записи"""
    async with get_session() as session:
        result = await session.execute(
            select(Booking).options(selectinload(Booking.user)).where(Booking.id == booking_id)
        )
        booking = result.scalar_one_or_none()
        if not booking:
            raise HTTPException(404, "Запись не найдена")
        if booking.status != "confirmed":
            raise HTTPException(400, "Можно завершить только подтверждённую запись")

        booking.status = "completed"
        await session.commit()

        await notify_admins(
            f"✅ <b>Запись #{booking.id} завершена</b>\n\n"
            f"👤 {booking.user.first_name}\n"
            f"💄 {booking.service}\n"
            f"📅 {booking.date}"
        )

        await notify_user(
            booking.user,
            f"✅ Процедура завершена!\n\n"
            f"💄 {booking.service}\n"
            f"📅 {booking.date}\n\n"
            f"Будем рады видеть вас снова!"
        )

        return {"ok": True}


@app.get("/api/admin/check/{user_id}")
async def admin_check(user_id: int):
    """Проверка, является ли пользователь админом"""
    async with get_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "Пользователь не найден")
        return {"ok": True, "is_admin": user.is_admin}


@app.post("/api/admin/bonus")
async def give_bonus(req: BonusRequest):
    """Начисление бонусов пользователю по логину"""
    if req.amount <= 0:
        raise HTTPException(400, "Количество бонусов должно быть больше 0")

    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.login == req.login)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, f"Пользователь @{req.login} не найден")

        user.bonus_points += req.amount
        await session.commit()

        return {"ok": True, "bonus_points": user.bonus_points}


@app.post("/api/admin/bonus/spend")
async def spend_bonus(req: BonusRequest):
    """Списание бонусов у пользователя по логину"""
    if req.amount <= 0:
        raise HTTPException(400, "Количество бонусов должно быть больше 0")

    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.login == req.login)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, f"Пользователь @{req.login} не найден")

        if user.bonus_points < req.amount:
            raise HTTPException(400, f"Недостаточно бонусов. Доступно: {user.bonus_points}")

        user.bonus_points -= req.amount
        await session.commit()

        return {"ok": True, "bonus_points": user.bonus_points}


# ==================== SERVICES ====================

@app.get("/api/services")
async def get_services():
    """Получение списка услуг"""
    async with get_session() as session:
        result = await session.execute(select(Service).order_by(Service.sort_order))
        services = result.scalars().all()
        return [
            {"id": s.id, "name": s.name, "description": s.description, "price": s.price, "duration": s.duration, "icon": s.icon, "sort_order": s.sort_order}
            for s in services
        ]


class ServiceRequest(BaseModel):
    name: str
    description: str = ""
    price: int = 0
    duration: int = 60
    icon: str = "icon-more.png"
    sort_order: int = 0


@app.post("/api/admin/services")
async def create_service(req: ServiceRequest):
    """Добавление услуги"""
    async with get_session() as session:
        service = Service(name=req.name, description=req.description, price=req.price, duration=req.duration, icon=req.icon, sort_order=req.sort_order)
        session.add(service)
        await session.commit()
        await session.refresh(service)
        return {"ok": True, "id": service.id}


@app.put("/api/admin/services/{service_id}")
async def update_service(service_id: int, req: ServiceRequest):
    """Редактирование услуги"""
    async with get_session() as session:
        result = await session.execute(select(Service).where(Service.id == service_id))
        service = result.scalar_one_or_none()
        if not service:
            raise HTTPException(404, "Услуга не найдена")
        service.name = req.name
        service.description = req.description
        service.price = req.price
        service.duration = req.duration
        service.icon = req.icon
        service.sort_order = req.sort_order
        await session.commit()
        return {"ok": True}


@app.delete("/api/admin/services/{service_id}")
async def delete_service(service_id: int):
    """Удаление услуги"""
    async with get_session() as session:
        result = await session.execute(select(Service).where(Service.id == service_id))
        service = result.scalar_one_or_none()
        if not service:
            raise HTTPException(404, "Услуга не найдена")
        await session.delete(service)
        await session.commit()
        return {"ok": True}


# ==================== WELCOME IMAGE ====================

STATIC_IMG_DIR = STATIC_DIR / "img"
WELCOME_PROPS_FILE = STATIC_IMG_DIR / "welcome_props.json"

@app.get("/api/welcome-props")
async def get_welcome_props():
    """Получение параметров изображения"""
    import json
    if WELCOME_PROPS_FILE.exists():
        try:
            return {"ok": True, **json.loads(WELCOME_PROPS_FILE.read_text())}
        except Exception:
            pass
    return {"ok": True, "width": 200, "height": 240, "right": 0, "bottom": 0}


@app.post("/api/welcome-props")
async def save_welcome_props(request: Request):
    """Сохранение параметров изображения"""
    import json
    data = await request.json()
    props = {
        "width": data.get("width", 200),
        "height": data.get("height", 240),
        "right": data.get("right", 0),
        "bottom": data.get("bottom", 0),
    }
    WELCOME_PROPS_FILE.write_text(json.dumps(props))
    return {"ok": True, **props}


@app.post("/api/admin/welcome-image")
async def upload_welcome_image(request: Request):
    """Загрузка изображения девушки на главной"""
    form = await request.form()
    photo = form.get("photo")

    if not photo or not hasattr(photo, "filename") or not photo.filename:
        raise HTTPException(400, "Фото не загружено")

    ext = Path(photo.filename).suffix or ".png"
    filename = f"girl{ext}"
    STATIC_IMG_DIR.mkdir(parents=True, exist_ok=True)

    content = await photo.read()
    (STATIC_IMG_DIR / filename).write_bytes(content)

    return {"ok": True, "url": f"/static/img/{filename}"}


# ==================== PAGES ====================

@app.get("/", response_class=HTMLResponse)
async def index():
    """Главная страница Mini App"""
    html_path = STATIC_DIR / "index.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
