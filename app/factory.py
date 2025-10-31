
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .core.settings import STATIC_DIR, TEMPLATES_DIR, APP_TITLE, APP_VERSION
from .routers import api as api_router
from .routers import ui as ui_router

def create_app() -> FastAPI:
    app = FastAPI(title=APP_TITLE, version=APP_VERSION)
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.state.templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app.include_router(ui_router.router)
    app.include_router(api_router.router)
    return app
