
# entrypoint: run with `uvicorn main:app --reload`
from app.factory import create_app

app = create_app()

if __name__ == "__main__":
    import uvicorn  # nosec - dev server
    uvicorn.run("main:app", host="127.0.0.1", port=8004, reload=True)
