from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from config.settings import settings
from database.connection import get_session
from database.models import User

from sqlalchemy import select


router = Router()


def is_admin_user(user_id: int) -> bool:
    admin_ids = [int(x.strip()) for x in settings.ADMIN_IDS.split(",") if x.strip()]
    return user_id in admin_ids


@router.message(Command("admin"))
async def cmd_admin(message: Message) -> None:
    """Назначение админа: /admin @username"""
    if not message.from_user or not is_admin_user(message.from_user.id):
        await message.answer("У вас нет прав администратора.")
        return

    args = message.text.split()
    if len(args) < 2:
        await message.answer(
            "Использование: /admin @username\n\n"
            "Пример: /admin ivan_ivanov"
        )
        return

    login = args[1].lstrip("@")

    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.login == login)
        )
        user = result.scalar_one_or_none()

        if not user:
            await message.answer(f"Пользователь @{login} не найден в Mini App.")
            return

        if user.is_admin:
            await message.answer(f"@{login} уже является админом.")
            return

        user.is_admin = True
        await session.commit()

    await message.answer(f"@{login} теперь админ Mini App.")


@router.message(Command("removeadmin"))
async def cmd_remove_admin(message: Message) -> None:
    """Снятие админа: /removeadmin @username"""
    if not message.from_user or not is_admin_user(message.from_user.id):
        await message.answer("У вас нет прав администратора.")
        return

    args = message.text.split()
    if len(args) < 2:
        await message.answer(
            "Использование: /removeadmin @username\n\n"
            "Пример: /removeadmin ivan_ivanov"
        )
        return

    login = args[1].lstrip("@")

    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.login == login)
        )
        user = result.scalar_one_or_none()

        if not user:
            await message.answer(f"Пользователь @{login} не найден.")
            return

        if not user.is_admin:
            await message.answer(f"@{login} не является админом.")
            return

        user.is_admin = False
        await session.commit()

    await message.answer(f"@{login} больше не админ.")


@router.message(Command("admins"))
async def cmd_admins(message: Message) -> None:
    """Список админов: /admins"""
    if not message.from_user or not is_admin_user(message.from_user.id):
        await message.answer("У вас нет прав администратора.")
        return

    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.is_admin == True)
        )
        admins = result.scalars().all()

        if not admins:
            await message.answer("Нет админов в Mini App.")
            return

        lines = []
        for a in admins:
            tg = f" (TG: {a.telegram_id})" if a.telegram_id else ""
            lines.append(f"  @{a.login}{tg}")

        await message.answer("Админы Mini App:\n" + "\n".join(lines))
