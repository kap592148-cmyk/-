from aiogram.types import KeyboardButton, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from config.settings import settings


def get_main_inline_kb() -> InlineKeyboardBuilder:
    """Создаёт Inline-клавиатуру с кнопкой открытия Mini App"""
    builder = InlineKeyboardBuilder()
    builder.button(
        text="📱 Открыть приложение",
        web_app=WebAppInfo(url=settings.MINIAPP_URL),
    )
    return builder


def get_main_reply_kb() -> ReplyKeyboardBuilder:
    """Создаёт Reply-клавиатуру с кнопкой 'Меню'"""
    builder = ReplyKeyboardBuilder()
    builder.add(KeyboardButton(text="📋 Меню"))
    return builder
