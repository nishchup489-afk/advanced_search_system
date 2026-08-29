from pydantic_settings import BaseSettings , ConfigDict 


class Settings(BaseSettings):
    database_url: str 

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8") 


settings = Settings()