from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Настройки приложения, загружаемые из .env файла"""

    BOT_TOKEN: str = Field(..., description="Токен Telegram бота")
    ADMIN_ID: int = Field(..., description="Telegram ID администратора")
    MINIAPP_URL: str = Field(default="https://kriscosm-bot.fly.dev", description="URL Mini App (приложения)")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
