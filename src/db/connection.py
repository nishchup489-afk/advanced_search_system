from src.config import settings 
import psycopg 
from psycopg import Connection 


def get_connection() -> Connection:
    return psycopg.connect(settings.database_url)