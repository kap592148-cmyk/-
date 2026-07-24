import os
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from config.settings import settings
from database.models import Base, Service

_DB_DIR = Path(os.environ.get("DB_DIR", Path(__file__).resolve().parent.parent / "database"))
_DB_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{_DB_DIR / (settings.BOT_TOKEN.split(':')[0] + '.db')}"

engine = create_async_engine(DATABASE_URL, echo=False)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    """Создание всех таблиц при старте бота"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        result = await session.execute(select(Service).limit(1))
        if not result.scalar_one_or_none():
            defaults = [
                Service(name="Волосы", description="Стрижки, окрашивание, уход", price=0, duration=60, icon="icon-hair.png", sort_order=0),
                Service(name="Лицо", description="Ухажовые процедуры, чистки", price=0, duration=60, icon="icon-face.png", sort_order=1),
                Service(name="Брови и ресницы", description="Коррекция, ламинирование", price=0, duration=45, icon="icon-brows.png", sort_order=2),
                Service(name="Ногти", description="Маникюр, педикюр, покрытие", price=0, duration=90, icon="icon-nails.png", sort_order=3),
            ]
            session.add_all(defaults)
            await session.commit()


def get_session() -> AsyncSession:
    """Получение сессии для работы с БД (async context manager)"""
    return async_session_factory()
