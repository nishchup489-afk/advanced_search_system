from .v1 import router as v1_router
from .v2 import router as v2_router
from .v3 import router as v3_router
from .v4 import router as v4_router


routers = (
    v1_router,
    v2_router,
    v3_router,
    v4_router,
)
