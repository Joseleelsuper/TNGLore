# TNGLore - Copilot Instructions

Flask + MongoDB web app for chest opening, card collection, events, and trading, integrated with a Discord bot.

## Architecture (confirm before editing)
- App factory is in `app/__init__.py` and owns global singletons: `login_manager`, `bcrypt`, `cache`, `cache_manager`, `mongo`.
- Entry points: `run.py` (local HTTPS debug) and `api/index.py` (Vercel serverless route target from `vercel.json`).
- Registered blueprints: `auth`, `main`, `admin`, `chests`, `collections`, `perfil`, `faq`, `events`, `tradeo`.
- Route modules are sync `pymongo`; there is no async DB layer.

## Core Data Flows
- Auth supports local user/pass and Discord OAuth (`app/routes/auth.py`) with scopes `identify`, `email`, `guilds`.
- Chest opening (`app/routes/chests.py`) reads `users.chests`, batch-loads chest docs with `$in`, rolls rewards from YAML config, then writes to `guilds.$.coleccionables` and `opening_history`.
- Collections APIs (`app/routes/coleccion.py`) are optimized for batch access; use aggregation and one-pass mapping instead of guild-by-guild queries.
- Events (`app/routes/events.py`) read active events, track progress in `event_progress`, and grant `chest` / `code` / `card` rewards.
- Trade market (`app/routes/tradeo.py`) stores listings/offers in `trade_marketplace` and notifies bot API after offer actions.

## Caching and Performance (important)
- Use `@safe_memoize(...)` from `app/utils/cache_manager.py` for DB-heavy helpers; it falls back to direct DB when cache backend fails.
- Invalidate caches on mutations with `safe_delete_memoized(...)` (see chest open, trade actions, admin CRUD).
- `app/models/user.py` keeps in-process `_user_cache` (max 200) for `user_loader`; call `invalidate_user_cache(...)` after user updates.
- `app/utils/images.py` caches raw + processed `images.json` for 30 minutes and resolves `{GITHUB_BRANCH}` placeholders.
- `app/utils/game_config.py` hot-reloads `config/game_config.yaml` every 60 seconds (chest probabilities/colors/images).
- `app/static/sw.js` uses three browser caches: `tnglore-cache-v3`, `tnglore-images-v3`, `tnglore-cards-v2`.

## Mongo Collections You Will Touch Often
- Core: `users`, `chests`, `collectables`, `collections`.
- Gameplay/history: `opening_history`, `chest_logs`, `codes`.
- Features: `events`, `event_progress`, `trade_marketplace`.
- Indexes are created at startup in `create_app()` for `event_progress` and `trade_marketplace`.

## Project Conventions (repo-specific)
- Prefer batch Mongo patterns (`$in`, aggregation pipelines) over N+1 loops; see `get_user_collectibles_data()` and `cofres_log()`.
- Serialize `ObjectId` values before JSON responses.
- Prefer module logger usage (`logging.getLogger(__name__)`); do not add new `print()` debugging.
- New/updated Python should keep explicit typing style used across core modules (`Optional`, `List`, `Dict` from `typing`).
- Template image helpers come from `register_template_helpers(app)` in `app/utils/template_helpers.py`.

## Local Workflow and Integrations
- Install/run: `pip install -r requirements.txt` then `python run.py`.
- Local HTTPS requires mkcert certs in `ssl/` (`localhost+1.pem` and key), matching `run.py`.
- Env loading is `.env.local` first, then `.env` (`config/settings.py`).
- External integrations: Discord OAuth (`DISCORD_*`), bot API (`API_SECRET`, `BOT_API_BASE_URL`), GitHub content API in admin (`GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`).
- Dev cache utilities exist at `/cache/stats` and `/cache/clear` when `app.debug` is true.