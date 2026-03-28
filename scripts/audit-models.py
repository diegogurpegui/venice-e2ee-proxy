#!/usr/bin/env python3
"""Audit Venice E2EE proxy models - query each and report status."""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error


def get_models(api_key):
    """Fetch model list from Venice API directly."""
    req = urllib.request.Request(
        "https://api.venice.ai/api/v1/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    return [m["id"] for m in data.get("data", [])]


def query_model(proxy_url, model):
    """Send a simple completion request, return (ok, elapsed_s, detail)."""
    payload = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": "Say hi"}],
            "stream": False,
        }
    ).encode()

    req = urllib.request.Request(
        f"{proxy_url}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())
        elapsed = time.monotonic() - t0
        content = body["choices"][0]["message"]["content"]
        return True, elapsed, content[:80]
    except urllib.error.HTTPError as e:
        elapsed = time.monotonic() - t0
        try:
            detail = e.read().decode()[:120]
        except Exception:
            detail = str(e)
        return False, elapsed, f"HTTP {e.code}: {detail}"
    except Exception as e:
        elapsed = time.monotonic() - t0
        return False, elapsed, str(e)[:120]


def main():
    parser = argparse.ArgumentParser(description="Audit Venice E2EE proxy models")
    parser.add_argument("--proxy", default="http://127.0.0.1:5656", help="Proxy URL")
    parser.add_argument(
        "--no-filter", action="store_true", help="Don't filter by e2ee- prefix"
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("VENICE_API_KEY", ""),
        help="Venice API key (or set VENICE_API_KEY)",
    )
    args = parser.parse_args()

    if not args.api_key:
        # try loading from .env
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("VENICE_API_KEY=") and not line.startswith("#"):
                    args.api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
        if not args.api_key:
            print("Error: VENICE_API_KEY not set", file=sys.stderr)
            sys.exit(1)

    print(f"Fetching model list from Venice API...")
    models = get_models(args.api_key)

    if not args.no_filter:
        models = [m for m in models if m.startswith("e2ee-")]

    models.sort()
    print(f"Found {len(models)} models to test\n")

    if not models:
        print("No models found.")
        return

    # header
    print(f"{'':3} {'Model':<45} {'Time':>8}  Status")
    print("-" * 80)

    ok_count = 0
    fail_count = 0

    for i, model in enumerate(models, 1):
        sys.stdout.write(f"\r  Testing {i}/{len(models)}: {model[:40]:<40}")
        sys.stdout.flush()

        ok, elapsed, detail = query_model(args.proxy, model)

        if ok:
            icon = "\u2705"
            ok_count += 1
        else:
            icon = "\u274c"
            fail_count += 1

        # clear progress line and print result
        sys.stdout.write("\r" + " " * 80 + "\r")
        print(f"{icon} {model:<45} {elapsed:>7.1f}s  {detail}")

    print("-" * 80)
    print(
        f"\n\u2705 {ok_count} working   \u274c {fail_count} failing   ({len(models)} total)"
    )


if __name__ == "__main__":
    main()
