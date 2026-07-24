import asyncio
import logging
import sys
import multiprocessing

import uvicorn
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties

from config.settings import settings
from database.connection import init_db
from bot.handlers import start, menu
from webapp.main import app as webapp


WEBAPP_HOST = "0.0.0.0"
WEBAPP_PORT = 8000


async def notify_admin(text: str) -> None:
    """Отправка уведомления администратору"""
    bot = Bot(token=settings.BOT_TOKEN)
    try:
        await bot.send_message(chat_id=settings.ADMIN_ID, text=text)
    finally:
        await bot.session.close()


def run_webapp() -> None:
    """Запуск FastAPI в отдельном процессе"""
    uvicorn.run(webapp, host=WEBAPP_HOST, port=WEBAPP_PORT, log_level="info")


async def main() -> None:
    """Точка входа: настройка и запуск бота + веб-приложения"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
        stream=sys.stdout,
    )

    await init_db()

    # Запуск FastAPI в отдельном процессе
    webapp_process = multiprocessing.Process(target=run_webapp, daemon=True)
    webapp_process.start()
    logging.info(f"Веб-приложение запущено: http://localhost:{WEBAPP_PORT}")

    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    dp = Dispatcher()

    dp.include_routers(start.router, menu.router)

    logging.info("Бот запущен!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    asyncio.run(main())
