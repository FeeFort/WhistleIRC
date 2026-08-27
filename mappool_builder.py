#!/usr/bin/env python3
"""Interactive mappool JSON builder for osu! API v2.

Run:
    python mappool_builder.py

Before the first run, put your osu! OAuth application credentials into
OSU_CLIENT_ID and OSU_CLIENT_SECRET below. The script uses the public
client-credentials flow, so no osu! user login is required.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


# ---------------------------------------------------------------------------
# osu! API credentials - intentionally hardcoded for this local utility.
# Create an OAuth application at https://osu.ppy.sh/home/account/edit#oauth
# and replace both values below.
# ---------------------------------------------------------------------------
OSU_CLIENT_ID = "63087"
OSU_CLIENT_SECRET = "7SGMRxgrnPWW5MfKmSeusaOQDygiLqRGZwg1sk4c"

TOKEN_URL = "https://osu.ppy.sh/oauth/token"
API_URL = "https://osu.ppy.sh/api/v2"
DEFAULT_OUTPUT = "mappool.json"

KNOWN_RULESETS = {
    "osu": "osu!standard",
    "taiko": "osu!taiko",
    "fruits": "osu!catch",
    "mania": "osu!mania",
}


class ApiError(RuntimeError):
    """Raised when osu! API authentication or lookup fails."""


def request_json(url: str, *, method: str = "GET", headers=None, data=None):
    request = urllib.request.Request(
        url,
        data=data,
        headers=headers or {},
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            details = json.loads(body)
        except json.JSONDecodeError:
            details = body.strip()
        raise ApiError(f"HTTP {error.code}: {details}") from error
    except urllib.error.URLError as error:
        raise ApiError(f"Network error: {error.reason}") from error

    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise ApiError("osu! API returned invalid JSON.") from error


def get_access_token() -> str:
    if "PUT_YOUR_" in OSU_CLIENT_ID or "PUT_YOUR_" in OSU_CLIENT_SECRET:
        raise ApiError(
            "Set OSU_CLIENT_ID and OSU_CLIENT_SECRET at the top of "
            "mappool_builder.py first."
        )

    payload = urllib.parse.urlencode(
        {
            "client_id": OSU_CLIENT_ID,
            "client_secret": OSU_CLIENT_SECRET,
            "grant_type": "client_credentials",
            "scope": "public",
        }
    ).encode("utf-8")
    response = request_json(
        TOKEN_URL,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data=payload,
    )
    token = response.get("access_token")
    if not token:
        raise ApiError(f"Token response did not contain access_token: {response}")
    return token


def extract_beatmap_id(value: str) -> int | None:
    """Accept a plain beatmap id or common osu! beatmap URL forms."""
    value = value.strip()
    if value.isdigit():
        return int(value)

    patterns = (
        r"/beatmaps/(\d+)",
        r"/beatmapsets/\d+#(?:osu|taiko|fruits|mania)/(\d+)",
    )
    for pattern in patterns:
        match = re.search(pattern, value, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def fetch_beatmap(token: str, beatmap_id: int) -> dict:
    return request_json(
        f"{API_URL}/beatmaps/{beatmap_id}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default is not None else ""
    answer = input(f"{prompt}{suffix}: ").strip()
    return answer if answer else (default or "")


def ask_yes_no(prompt: str, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        answer = input(f"{prompt} [{hint}]: ").strip().lower()
        if not answer:
            return default
        if answer in {"y", "yes", "д", "да"}:
            return True
        if answer in {"n", "no", "н", "нет"}:
            return False
        print("Please answer y/yes or n/no.")


def ask_commands(title: str) -> list[str]:
    print(f"\n{title}")
    print("Enter one command per line. Press Enter on an empty line to finish.")
    commands = []
    while True:
        command = input("  > ").strip()
        if not command:
            return commands
        commands.append(command)


def parse_mods(value: str) -> list[str]:
    if not value or value.strip().lower() in {"none", "no", "нет", "-"}:
        return []
    return list(dict.fromkeys(part.upper() for part in re.split(r"[\s,;+]+", value) if part))


def format_seconds(seconds) -> str:
    if not isinstance(seconds, (int, float)):
        return "?"
    minutes, remainder = divmod(int(seconds), 60)
    return f"{minutes}:{remainder:02d}"


def show_beatmap(beatmap: dict) -> None:
    beatmapset = beatmap.get("beatmapset") or {}
    mode = beatmap.get("mode") or "unknown"
    ruleset_name = KNOWN_RULESETS.get(mode, mode)
    print("\n" + "=" * 64)
    print("FOUND BEATMAP")
    print("=" * 64)
    print(f"ID:          {beatmap.get('id', '?')}")
    print(f"Set ID:      {beatmap.get('beatmapset_id', '?')}")
    print(f"Title:       {beatmapset.get('title', '?')}")
    print(f"Artist:      {beatmapset.get('artist', '?')}")
    print(f"Difficulty:  {beatmap.get('version', '?')}")
    print(f"Creator:     {beatmap.get('creator', '?')}")
    print(f"Ruleset:     {ruleset_name} ({mode})")
    print(f"Status:      {beatmap.get('status', '?')}")
    print(f"Stars:       {beatmap.get('difficulty_rating', '?')}")
    print(f"BPM:         {beatmap.get('bpm', '?')}")
    print(f"Length:      {format_seconds(beatmap.get('total_length'))}")
    print(f"Hit length:  {format_seconds(beatmap.get('hit_length'))}")
    print(f"CS / AR / OD / HP: {beatmap.get('cs', '?')} / {beatmap.get('ar', '?')} / "
          f"{beatmap.get('accuracy', '?')} / {beatmap.get('drain', '?')}")
    print(f"Max combo:   {beatmap.get('max_combo', '?')}")
    print("=" * 64)


def map_from_api(beatmap: dict, slot: str, mods: list[str], commands: list[str]) -> dict:
    beatmapset = beatmap.get("beatmapset") or {}
    return {
        "id": beatmap["id"],
        "name": str(beatmapset.get("title") or "Unknown title"),
        "diff": str(beatmap.get("version") or "Unknown difficulty"),
        "author": str(beatmap.get("creator") or "Unknown creator"),
        "mods": mods,
        "additionalCommands": commands,
    }


def safe_filename(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
    return value or DEFAULT_OUTPUT


def save_json(document: dict) -> Path:
    requested = ask("Output filename", DEFAULT_OUTPUT)
    filename = safe_filename(requested)
    if not filename.lower().endswith(".json"):
        filename += ".json"
    path = Path(filename)
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def build_mappool() -> dict:
    print("osu! Mappool JSON Builder")
    print("Enter map slots like NM1, HD2, HR3. Leave slot empty when finished.\n")

    tournament = ask("Tournament name")
    stage = ask("Stage")
    general_commands = ask_commands("General commands for every map/action")
    token = get_access_token()
    maps = {}

    while True:
        print(f"\nMaps added: {len(maps)}")
        slot = ask("Map slot (empty to finish)")
        if not slot:
            break
        slot = slot.upper().replace(" ", "")
        if slot in maps:
            print(f"Slot {slot} already exists. Choose another slot.")
            continue

        map_input = ask("Beatmap ID or osu! beatmap URL")
        beatmap_id = extract_beatmap_id(map_input)
        if beatmap_id is None:
            print("Could not find a beatmap ID in that input.")
            continue

        print(f"Fetching beatmap {beatmap_id}...")
        try:
            beatmap = fetch_beatmap(token, beatmap_id)
        except ApiError as error:
            print(f"Lookup failed: {error}")
            if ask_yes_no("Try another map", True):
                continue
            break

        show_beatmap(beatmap)
        if not ask_yes_no("Is this the correct map, ruleset and difficulty?", True):
            print("Map skipped.")
            continue

        mods = parse_mods(ask("Additional mods (example: HD, HR; or none)", "none"))
        commands = ask_commands(f"Personal commands for {slot}")
        maps[slot] = map_from_api(beatmap, slot, mods, commands)
        print(f"Added {slot}: {maps[slot]['name']} [{maps[slot]['diff']}]")

    if not maps:
        raise RuntimeError("No maps were added; nothing to save.")

    return {
        "tournament": tournament,
        "stage": stage,
        "generalAdditionalCommands": general_commands,
        "maps": maps,
    }


def main() -> int:
    try:
        document = build_mappool()
        path = save_json(document)
    except (ApiError, RuntimeError, KeyboardInterrupt, EOFError) as error:
        print(f"\nStopped: {error}")
        return 1
    except OSError as error:
        print(f"\nCould not write output file: {error}")
        return 1

    print(f"\nDone. Mappool saved to: {path.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
