#!/usr/bin/env python3
"""Request osu! beatmap difficulty attributes and print the raw API response."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


# Change these constants for another request.
OSU_CLIENT_ID = "67462"
OSU_CLIENT_SECRET = "vH9pBxp2sbKGHbKz8scUSUmoXbknt1XMY9knW2PY"
BEATMAP_ID = 1826137
MODS = ["DT"]
RULESET = None
RULESET_ID = None

TOKEN_URL = "https://osu.ppy.sh/oauth/token"
API_URL = "https://osu.ppy.sh/api/v2"


def request(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, data: bytes | None = None) -> bytes:
    request = urllib.request.Request(url, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        print(error.read().decode("utf-8", errors="replace"))
        raise SystemExit(error.code) from error


def get_access_token() -> str:
    body = urllib.parse.urlencode(
        {
            "client_id": OSU_CLIENT_ID,
            "client_secret": OSU_CLIENT_SECRET,
            "grant_type": "client_credentials",
            "scope": "public",
        }
    ).encode("utf-8")
    response = json.loads(
        request(
            TOKEN_URL,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data=body,
        )
    )
    return response["access_token"]


def main() -> None:
    payload = {}
    if MODS:
        payload["mods"] = MODS
    if RULESET is not None:
        payload["ruleset"] = RULESET
    if RULESET_ID is not None:
        payload["ruleset_id"] = RULESET_ID

    response = request(
        f"{API_URL}/beatmaps/{BEATMAP_ID}/attributes",
        method="POST",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {get_access_token()}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
    )
    print(response.decode("utf-8"))


if __name__ == "__main__":
    main()
