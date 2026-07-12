from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("noxroute-security-agent")

POLICY_PATH = Path(os.environ.get("SECURITY_POLICY_PATH", "/security/policy.json"))
STATUS_PATH = Path(os.environ.get("SECURITY_STATUS_PATH", "/security/status.json"))
TABLE_FAMILY = "inet"
TABLE_NAME = "noxrouteneo"
DEFAULT_PORTS = [80, 443, 8443]
RUNTIME_UID = 10001
RUNTIME_GID = 10001


def normalized_policy(payload: dict[str, Any]) -> dict[str, Any]:
    ports = sorted(
        {
            int(value)
            for value in payload.get("ports", DEFAULT_PORTS)
            if isinstance(value, int) and 1 <= value <= 65535
        }
    )
    if not ports:
        ports = DEFAULT_PORTS

    ipv4: list[str] = []
    ipv6: list[str] = []
    for value in payload.get("blocked_ips", []):
        try:
            address = ipaddress.ip_address(str(value))
        except ValueError:
            continue
        target = ipv4 if address.version == 4 else ipv6
        target.append(address.compressed)

    return {
        "ports": ports,
        "ipv4": sorted(set(ipv4)),
        "ipv6": sorted(set(ipv6)),
    }


def nft_set(name: str, address_type: str, values: list[str]) -> str:
    elements = f" elements = {{ {', '.join(values)} }};" if values else ""
    return (
        f"set {name} {{ type {address_type}; flags interval;{elements} }}"
    )


def render_rules(policy: dict[str, Any], replace: bool = False) -> str:
    ports = ", ".join(str(value) for value in policy["ports"])
    prefix = f"delete table {TABLE_FAMILY} {TABLE_NAME}\n" if replace else ""
    rules: list[str] = []
    if policy["ipv4"]:
        rules.append(
            f"ip saddr @blocked_v4 tcp dport {{ {ports} }} counter drop"
        )
    if policy["ipv6"]:
        rules.append(
            f"ip6 saddr @blocked_v6 tcp dport {{ {ports} }} counter drop"
        )
    body = "\n    ".join(f"{rule};" for rule in rules)
    return f"""{prefix}table {TABLE_FAMILY} {TABLE_NAME} {{
  {nft_set("blocked_v4", "ipv4_addr", policy["ipv4"])}
  {nft_set("blocked_v6", "ipv6_addr", policy["ipv6"])}
  chain prerouting {{
    type filter hook prerouting priority -300; policy accept;
    {body}
  }}
}}
"""


def table_exists() -> bool:
    return (
        subprocess.run(
            ["nft", "list", "table", TABLE_FAMILY, TABLE_NAME],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode
        == 0
    )


def apply_policy(policy: dict[str, Any]) -> None:
    subprocess.run(
        ["nft", "-f", "-"],
        input=render_rules(policy, replace=table_exists()),
        text=True,
        capture_output=True,
        check=True,
    )


def remove_policy() -> None:
    if table_exists():
        subprocess.run(
            ["nft", "delete", "table", TABLE_FAMILY, TABLE_NAME],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def write_status(status: str, policy: dict[str, Any], error: str | None = None) -> None:
    payload = {
        "status": status,
        "ipv4_bans": len(policy["ipv4"]),
        "ipv6_bans": len(policy["ipv6"]),
        "ports": policy["ports"],
        "updated_at": int(time.time()),
        "error": error,
    }
    temporary = STATUS_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temporary.replace(STATUS_PATH)


def load_policy() -> tuple[dict[str, Any], str]:
    try:
        content = POLICY_PATH.read_bytes()
        payload = json.loads(content)
        if not isinstance(payload, dict):
            raise ValueError("Policy must be an object")
    except FileNotFoundError:
        content = b"{}"
        payload = {}
    return normalized_policy(payload), hashlib.sha256(content).hexdigest()


def healthcheck() -> int:
    try:
        status = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        fresh = int(time.time()) - int(status.get("updated_at", 0)) < 30
        return 0 if fresh and status.get("status") == "ready" and table_exists() else 1
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return 1


def prepare_volume() -> None:
    POLICY_PATH.parent.mkdir(parents=True, exist_ok=True)
    os.chown(POLICY_PATH.parent, 0, 0)
    os.chmod(POLICY_PATH.parent, 0o2770)
    os.chown(POLICY_PATH.parent, RUNTIME_UID, RUNTIME_GID)


def run() -> int:
    prepare_volume()
    stopped = False

    def stop(_signum: int, _frame: object) -> None:
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    previous_digest = ""
    current_policy = normalized_policy({})
    try:
        while not stopped:
            try:
                policy, digest = load_policy()
                if digest != previous_digest or not table_exists():
                    apply_policy(policy)
                    current_policy = policy
                    previous_digest = digest
                    LOGGER.info(
                        "Applied firewall policy with %s blocked addresses",
                        len(policy["ipv4"]) + len(policy["ipv6"]),
                    )
                write_status("ready", current_policy)
            except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as error:
                LOGGER.error("Firewall policy update failed: %s", error)
                write_status("degraded", current_policy, str(error)[:300])
            time.sleep(2)
    finally:
        remove_policy()
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "healthcheck":
        raise SystemExit(healthcheck())
    raise SystemExit(run())
