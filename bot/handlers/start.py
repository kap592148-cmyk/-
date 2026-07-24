from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from sqlalchemy import select

from bot.keyboards.main_kb import get_main_inline_kb, get_main_reply_kb
from config.settings import settings
from database.connection import get_session
from database.models import User


router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """Обработка команды /start"""
    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.login == message.from_user.username)
        )
        user = result.scalar_one_or_none()
        if user:
            user.telegram_id = message.from_user.id
            if message.from_user.id == settings.ADMIN_ID:
                user.is_admin = True
            await session.commit()
        else:
            new_user = User(
                telegram_id=message.from_user.id,
                login=message.from_user.username or str(message.from_user.id),
                first_name=message.from_user.first_name or "",
                is_admin=message.from_user.id == settings.ADMIN_ID,
            )
            session.add(new_user)
            await session.commit()

    await message.answer(
        "Добро пожаловать в Kris Com! Твоя красота — моя забота 💛",
        reply_markup=get_main_reply_kb().as_markup(resize_keyboard=True),
    )
    await message.answer(
        "Нажми кнопку ниже, чтобы открыть приложение:",
        reply_markup=get_main_inline_kb().as_markup(),
    )
