from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

from bot.keyboards.main_kb import get_main_inline_kb, get_main_reply_kb


router = Router()


@router.message(Command("menu"))
async def cmd_menu(message: Message) -> None:
    """Обработка команды /menu"""
    await _send_main_menu(message)


@router.message(F.text == "📋 Меню")
async def btn_menu(message: Message) -> None:
    """Обработка нажатия Reply-кнопки 'Меню'"""
    await _send_main_menu(message)


async def _send_main_menu(message: Message) -> None:
    """Отправка главного меню"""
    await message.answer(
        "Главное меню Kris Com 💛",
        reply_markup=get_main_reply_kb().as_markup(resize_keyboard=True),
    )
    await message.answer(
        "Нажми кнопку ниже, чтобы открыть приложение:",
        reply_markup=get_main_inline_kb().as_markup(),
    )
