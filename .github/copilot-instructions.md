# TNGLore – Copilot Instructions

Web app for opening chests and collecting cards, integrated with a Discord bot. A Flask + MongoDB backend with a strong focus on caching and fully typed Python.

## Architecture Overview

- **Flask blueprints** (`app/routes/`): `auth`, `main`, `admin`, `chests`, `coleccion`, `perfil`, `faq`. Registered in `app/__init__.py:create_app()`.
- **MongoDB** (`tnglore` database): collections `users`, `chests`, `collectables`. All DB access via the global `mongo` instance from `app/__init__.py`.
- **Global singletons** defined in `app/__init__.py`: `mongo`, `cache` (Flask-Caching), `cache_manager` (`CacheManager`).
- **Config** loaded from `.env` (or `.env.local`) via `config/settings.py`.
- **Deployment**: Vercel serverless. Redis (Upstash) for shared cache across cold starts.

## DB Access Pattern

All DB access is **synchronous** via `pymongo`. No async layer — `pymongo` calls are fast and direct.

```python
# In a Flask route:
from app import mongo

user = mongo.users.find_one({"email": email})
```

- Use batch queries (`$in`, aggregation pipelines) instead of N+1 loops.
- `user_loader` uses an in-process `_user_cache` dict to avoid DB hits on every request.

## Caching Layers (do not skip any layer)

| Layer | Where | TTL | Purpose |
|---|---|---|---|
| `@cache.memoize(timeout=600)` | Flask-Caching on route helpers | 10 min | DB query results (e.g. `get_user_chests_data`) |
| `@lru_cache` / module-level cache | `app/utils/images.py` | 30 min | Images config JSON (processed result cached) |
| `CacheManager.cached_result()` decorator | `app/utils/cache_manager.py` | configurable | General-purpose DB results |
| In-process `_user_cache` | `app/models/user.py` | per-process | user_loader results (max 200 entries) |
| Service Worker | `app/static/sw.js` | persistent | Browser-side cache (`tnglore-cache-v3`, `tnglore-images-v3`, `tnglore-cards-v2`) |

Card images are cached by the SW under the `tnglore-cards-v2` cache, matching `assets/collections/.*\.(png|jpg|jpeg|webp)`.

## Data Model (MongoDB)

- **users**: `username`, `email`, `password` (bcrypt), `is_admin`, `discord_id`, `pfp`, `guilds: list`, `chests: list[str]` (list of chest `_id` strings), `registration_method`.
- **chests**: `rarity` (comun/rara/epica/legendaria), `servidor`.
- **collectables**: `rareza` (comun/rara/epica/legendaria), plus collection metadata.

## Game Logic Constants

All chest/card probabilities are in `CHEST_CONFIG` in `app/routes/chests.py`:

```python
# Rarities: comun, rara, epica, legendaria
# probabilities: [%comun, %rara, %epica, %legendaria] for cards drawn
CHEST_CONFIG = {
    "comun":      {"cards": 2, "probabilities": [70, 16, 12,  2]},
    "rara":       {"cards": 3, "probabilities": [35, 45, 15,  5]},
    "epica":      {"cards": 4, "probabilities": [20, 30, 35, 15]},
    "legendaria": {"cards": 5, "probabilities": [10, 25, 35, 30]},
}
```

Chest drop rates from Discord bot: 5% per message, 20% every 30 min in voice.

## Image System

- Card images: `app/static/assets/collections/<Collection Name>/cards/`
- Chest images: `app/static/assets/images/cofre-<rarity>.webp`
- Image config (URLs, metadata): `app/static/config/images.json`
- **Load via** `get_images()` from `app/utils/images.py` — sync loading + 30-min in-memory cache with processed result caching.
- **Template helpers** (auto-injected via `context_processor`): `get_preload_links()`, `get_optimized_image(url, size)`, `get_responsive_attributes(url)`, `get_cache_bust_url(url)`.

## Python Standards

- **Fully typed Python required**: all functions must have type annotations on parameters and return types.
- Use `Optional[T]`, `List[T]`, `Dict[K, V]` from `typing` (not bare `list`/`dict` for Python <3.10 compat).
- Logging via `logger = logging.getLogger(__name__)` — never use `print()` except in `User.get_by_id` (legacy).

## Developer Workflow

```bash
# Install deps
pip install -r requirements.txt

# SSL setup (required, first time only)
choco install mkcert
mkcert -install
mkdir ssl && cd ssl && mkcert localhost 127.0.0.1

# Run locally
python run.py        # uses .env or .env.local
```

Cache stats endpoint (dev only): `GET /cache/stats`.