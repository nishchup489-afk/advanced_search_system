import psycopg
from psycopg import Connection
from psycopg.rows import dict_row

from advanced_search_system.config import settings


def get_connection() -> Connection:
    return psycopg.connect(settings.database_url , row_factory=dict_row)