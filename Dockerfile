FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1


WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install -U pip && \
    if [ -f requirements.txt ]; then pip install -r requirements.txt; \
    else pip install fastapi uvicorn jinja2 python-multipart; fi

RUN useradd -m -U appuser

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8004

ENV APP_MODULE=main:app \
    UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=8004

CMD ["sh","-c","uvicorn ${APP_MODULE} --host ${UVICORN_HOST} --port ${UVICORN_PORT} --proxy-headers --forwarded-allow-ips='*'"]
