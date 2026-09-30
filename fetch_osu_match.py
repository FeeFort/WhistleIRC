#!/usr/bin/env python3
"""Fetch and print the raw osu! API v2 payload for a multiplayer match.

Fill in the three constants below, then run:
    python3 fetch_osu_match.py
"""

from __future__ import annotations

import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


# osu! OAuth application credentials and multiplayer match ID.
CLIENT_ID = "67964"
CLIENT_SECRET = "pgqOSibFarT4UbVLQ89Q5Gu8pHvigGdMKcCUNEbJ"
MATCH_ID = 121873416

TOKEN_URL = "https://osu.ppy.sh/oauth/token"
MATCH_URL = f"https://osu.ppy.sh/api/v2/matches/{MATCH_ID}"


def request_json(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> dict:
    request = Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def get_access_token() -> str:
    payload = urlencode(
        {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "client_credentials",
            "scope": "public",
        }
    ).encode("utf-8")
    response = request_json(TOKEN_URL, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    return response["access_token"]


def main() -> int:
    if CLIENT_ID == "YOUR_CLIENT_ID" or CLIENT_SECRET == "YOUR_CLIENT_SECRET" or not MATCH_ID:
        print("Set CLIENT_ID, CLIENT_SECRET, and MATCH_ID at the top of fetch_osu_match.py.", file=sys.stderr)
        return 1

    try:
        token = get_access_token()
        match = request_json(MATCH_URL, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        print(f"osu! API returned HTTP {error.code}: {detail}", file=sys.stderr)
        return 1
    except (URLError, KeyError, json.JSONDecodeError) as error:
        print(f"Could not fetch match: {error}", file=sys.stderr)
        return 1

    print(json.dumps(match, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
