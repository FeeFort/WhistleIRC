#!/usr/bin/env python3
"""Interactive mappool JSON builder for osu! API v2.

Run:
    python mappool_builder.py

Before the first run, put your osu! OAuth application credentials into
OSU_CLIENT_ID and OSU_CLIENT_SECRET below. The script uses the public
client-credentials flow, so no osu! user login is required.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


# ---------------------------------------------------------------------------
# osu! API credentials - intentionally hardcoded for this local utility.
# Create an OAuth application at https://osu.ppy.sh/home/account/edit#oauth
# and replace both values below.
# ---------------------------------------------------------------------------
OSU_CLIENT_ID = "<YOUR_OSU_CLIENT_ID>"
OSU_CLIENT_SECRET = "<YOUR_OSU_CLIENT_SECRET>"

TOKEN_URL = "https://osu.ppy.sh/oauth/token"
API_URL = "https://osu.ppy.sh/api/v2"
DEFAULT_OUTPUT = "mappool.json"
VERSION = 3

KNOWN_RULESETS = {
    "0": "osu!",
    "1": "osu!taiko",
    "2": "osu!catch",
    "3": "osu!mania",
}

API_RULESETS = {
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


def fetch_creator(token: str, user_id) -> dict | None:
    """Look up the mapper's own profile via Get User (GET /users/{user})."""
    if not user_id or user_id == "?":
        return None
    try:
        return request_json(
            f"{API_URL}/users/{user_id}?key=id",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            },
        )
    except ApiError as error:
        print(f"(could not fetch creator profile: {error})")
        return None


def show_beatmap(beatmap: dict, token: str) -> dict | None:
    creator_id = beatmap.get("user_id", "?")
    creator = fetch_creator(token, creator_id)

    beatmapset = beatmap.get("beatmapset") or {}
    host_name = beatmapset.get("creator", "?")
    diff_owner_name = creator.get("username") if creator else host_name

    mode = beatmap.get("mode") or "unknown"
    ruleset_name = API_RULESETS.get(mode, mode)
    print("\n" + "=" * 64)
    print("FOUND BEATMAP")
    print("=" * 64)
    print(f"ID:          {beatmap.get('id', '?')}")
    print(f"Set ID:      {beatmap.get('beatmapset_id', '?')}")
    print(f"Title:       {beatmapset.get('title', '?')}")
    print(f"Artist:      {beatmapset.get('artist', '?')}")
    print(f"Difficulty:  {beatmap.get('version', '?')}")
    if diff_owner_name and diff_owner_name != host_name:
        print(f"Diff owner:  {diff_owner_name}  (guest diff, set host: {host_name})")
    else:
        print(f"Creator:     {diff_owner_name}")
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
    return creator


def map_from_api(
    beatmap: dict,
    slot: str,
    mods: list[str],
    commands: list[str],
    creator: dict | None = None,
) -> dict:
    beatmapset = beatmap.get("beatmapset") or {}
    # beatmap.user_id is the creator of this difficulty. beatmapset.creator is
    # only the mapper who created the whole set and can be different.
    author = (creator or {}).get("username") or "Unknown creator"
    return {
        "id": beatmap["id"],
        "beatmapset_id": beatmap.get("beatmapset_id"),
        "name": str(beatmapset.get("title") or "Unknown title"),
        "artist": str(beatmapset.get("artist") or "Unknown artist"),
        "diff": str(beatmap.get("version") or "Unknown difficulty"),
        "author": str(author),
        "star_rating": beatmap.get("difficulty_rating"),
        "total_seconds": beatmap.get("total_length"),
        "mods": mods,
        "additionalCommands": commands,
    }


def safe_filename(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
    return value or DEFAULT_OUTPUT


def ask_ruleset() -> str:
    print("\nRuleset:")
    for value, name in KNOWN_RULESETS.items():
        print(f"  {value} - {name}")

    while True:
        ruleset = ask("Ruleset number", "0")
        if ruleset in KNOWN_RULESETS:
            return ruleset
        print("Please choose one of: 0, 1, 2, or 3.")


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
    print("osu! Mappool JSON Builder for WhistleIRC app.")
    print("Enter map slots like NM1, HD2, HR3. Leave slot empty when finished.\n")

    tournament = ask("Tournament name")
    stage = ask("Stage")
    ruleset = ask_ruleset()
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

        creator = show_beatmap(beatmap, token)
        if not ask_yes_no("Is this the correct map, ruleset and difficulty?", True):
            print("Map skipped.")
            continue

        mods = parse_mods(ask("Additional mods (example: HD, HR; or none)", "none"))
        commands = ask_commands(f"Personal commands for {slot}")
        maps[slot] = map_from_api(beatmap, slot, mods, commands, creator)
        print(f"Added {slot}: {maps[slot]['name']} [{maps[slot]['diff']}]")

    if not maps:
        raise RuntimeError("No maps were added; nothing to save.")

    return {
        "version": VERSION,
        "tournament": tournament,
        "stage": stage,
        "ruleset": int(ruleset),
        "generalAdditionalCommands": general_commands,
        "maps": maps,
    }


def update_mappool(path_value: str) -> None:
    path = Path(path_value)
    print(f"Reading mappool: {path}")
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RuntimeError(f"Mappool file not found: {path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Mappool file contains invalid JSON: {error}") from error

    current_version = document.get("version", 0)
    if not isinstance(current_version, int):
        raise RuntimeError("Mappool version must be an integer.")
    if current_version >= VERSION:
        print(f"No update needed: file version {current_version}, script version {VERSION}.")
        return

    maps = document.get("maps")
    if not isinstance(maps, dict):
        raise RuntimeError("Mappool JSON must contain a maps object.")

    token = get_access_token()
    map_items = list(maps.items())
    updated = 0
    failed = False

    for index, (slot, current_map) in enumerate(map_items):
        beatmap_id = extract_beatmap_id(str(current_map.get("id", ""))) if isinstance(current_map, dict) else None
        print(f"\n[{index + 1}/{len(map_items)}] {slot}: parsing beatmap {beatmap_id or '?'}...")
        if beatmap_id is None:
            print(f"{slot}: skipped — no valid beatmap id.")
            failed = True
            continue

        if index:
            print("Waiting 1 second before the next API request...")
            time.sleep(1)

        try:
            beatmap = fetch_beatmap(token, beatmap_id)
        except ApiError as error:
            print(f"{slot}: failed — {error}")
            failed = True
            continue

        creator = fetch_creator(token, beatmap.get("user_id"))
        print(f"{slot}: parsed — {beatmap.get('beatmapset_id', '?')} / {beatmap.get('version', '?')}")
        preserved = current_map if isinstance(current_map, dict) else {}
        maps[slot] = map_from_api(
            beatmap,
            str(slot),
            preserved.get("mods", []),
            preserved.get("additionalCommands", []),
            creator,
        )
        updated += 1
        print(f"{slot}: saved.")

    if not failed:
        document["version"] = VERSION
    else:
        print("Some maps were not updated; keeping the previous file version for a later retry.")
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nUpdate complete. Updated {updated}/{len(map_items)} maps and saved: {path.resolve()}")


def debug_beatmap() -> None:
    """Fetch one beatmap and print the untouched osu! API response."""
    map_input = ask("Beatmap ID or osu! beatmap URL")
    beatmap_id = extract_beatmap_id(map_input)
    if beatmap_id is None:
        raise RuntimeError("Could not find a beatmap ID in that input.")

    token = get_access_token()
    response = fetch_beatmap(token, beatmap_id)
    print(json.dumps(response, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Interactive mappool JSON builder for osu! API v2.")
    parser.add_argument(
        "--debug",
        action="store_true",
        help="fetch one beatmap, print the raw API JSON response, and exit",
    )
    parser.add_argument(
        "--update",
        metavar="PATH",
        help="update an existing mappool JSON file in place",
    )
    args = parser.parse_args()

    try:
        if args.debug:
            debug_beatmap()
            return 0
        if args.update:
            update_mappool(args.update)
            return 0

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
