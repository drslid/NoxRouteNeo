from __future__ import annotations

import base64
import hashlib
import hmac
import http.server
import ipaddress
import json
import logging
import os
import re
import signal
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import psutil
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row


logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("noxroute-runtime")

DATABASE_URL = os.environ["DATABASE_URL"]
XRAY_BINARY = os.environ.get("XRAY_BINARY", "/usr/local/bin/xray")
XRAY_CONFIG_PATH = Path(os.environ.get("XRAY_CONFIG_PATH", "/runtime/config.json"))
XRAY_LISTEN_PORT = int(os.environ.get("XRAY_LISTEN_PORT", "10443"))
XRAY_API_PORT = int(os.environ.get("XRAY_API_PORT", "10085"))
POLL_SECONDS = max(1, int(os.environ.get("RUNTIME_POLL_SECONDS", "5")))
STATE_HEARTBEAT_SECONDS = max(
    POLL_SECONDS, int(os.environ.get("RUNTIME_STATE_HEARTBEAT_SECONDS", "15"))
)
DATABASE_POOL_MIN_SIZE = max(1, int(os.environ.get("DATABASE_POOL_MIN_SIZE", "1")))
DATABASE_POOL_MAX_SIZE = max(
    DATABASE_POOL_MIN_SIZE,
    int(os.environ.get("DATABASE_POOL_MAX_SIZE", "3")),
)
SERVER_BANDWIDTH_SETTING = os.environ.get("SERVER_BANDWIDTH_MBIT", "auto").strip()
CADDY_ADMIN_URL = os.environ.get("CADDY_ADMIN_URL", "http://caddy:2019")
LETSENCRYPT_EMAIL = os.environ.get("LETSENCRYPT_EMAIL", "")
TRAFFIC_GATEWAY_URL = os.environ.get(
    "TRAFFIC_GATEWAY_URL", "http://traffic-gateway:8080"
).rstrip("/")
TRAFFIC_GATEWAY_SOCKS_HOST = os.environ.get(
    "TRAFFIC_GATEWAY_SOCKS_HOST", "traffic-gateway"
)
TRAFFIC_GATEWAY_SOCKS_PORT = int(
    os.environ.get("TRAFFIC_GATEWAY_SOCKS_PORT", "1080")
)
TRAFFIC_GATEWAY_TOKEN = os.environ.get("TRAFFIC_GATEWAY_TOKEN", "")
DUCKDNS_TOKEN_FILE = Path(
    os.environ.get("DUCKDNS_TOKEN_FILE", "/run/secrets/duckdns_token")
)
SECURITY_POLICY_PATH = Path(
    os.environ.get("SECURITY_POLICY_PATH", "/security/policy.json")
)
SECURITY_STATUS_PATH = Path(
    os.environ.get("SECURITY_STATUS_PATH", "/security/status.json")
)
RUNTIME_VERSION = "1.5.0"
XRAY_INBOUND_TAG = "noxroute-vless-xhttp-reality"
RUNTIME_CONTROL_CONTEXT = b"noxrouteneo:runtime-control:v1"

_encoded_key = os.environ.get("APP_ENCRYPTION_KEY", "")
try:
    ENCRYPTION_KEY = base64.b64decode(_encoded_key, validate=True)
except ValueError as exc:
    raise RuntimeError("APP_ENCRYPTION_KEY is not valid base64") from exc
if len(ENCRYPTION_KEY) != 32:
    raise RuntimeError("APP_ENCRYPTION_KEY must decode to exactly 32 bytes")


_DATABASE_POOL = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=DATABASE_POOL_MIN_SIZE,
    max_size=DATABASE_POOL_MAX_SIZE,
    timeout=10,
    kwargs={
        "row_factory": dict_row,
        "connect_timeout": 10,
        "application_name": "noxroute-runtime",
    },
    open=False,
)
_DATABASE_POOL_LOCK = threading.Lock()
_DATABASE_POOL_OPEN = False


def open_database_pool() -> None:
    global _DATABASE_POOL_OPEN
    if _DATABASE_POOL_OPEN:
        return
    with _DATABASE_POOL_LOCK:
        if _DATABASE_POOL_OPEN:
            return
        _DATABASE_POOL.open(wait=True)
        _DATABASE_POOL_OPEN = True


@contextmanager
def db_connection() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    open_database_pool()
    with _DATABASE_POOL.connection() as connection:
        yield connection


def close_database_pool() -> None:
    global _DATABASE_POOL_OPEN
    if not _DATABASE_POOL_OPEN:
        return
    _DATABASE_POOL.close()
    _DATABASE_POOL_OPEN = False


@dataclass(frozen=True)
class HostSizing:
    cpu_count: int
    memory_bytes: int
    connection_capacity: int
    profile: str
    recommended_bandwidth_mbps: int


def _floor_power_of_two(value: int) -> int:
    result = 1
    while result <= value // 2:
        result *= 2
    return result


def _sizing_profile(capacity: int) -> tuple[str, int]:
    if capacity <= 1024:
        return "compact", 50
    if capacity <= 2048:
        return "small", 100
    if capacity <= 4096:
        return "standard", 250
    if capacity <= 8192:
        return "performance", 500
    return "high-capacity", 1000


def calculate_host_sizing(cpu_count: int, memory_bytes: int) -> HostSizing:
    cpu_count = max(1, cpu_count)
    memory_bytes = max(1024 * 1024, memory_bytes)
    memory_mib = max(1, memory_bytes // 1024 // 1024)
    budget = min(cpu_count * 2048, memory_mib * 3)
    capacity = _floor_power_of_two(max(512, min(16384, budget)))
    profile, bandwidth = _sizing_profile(capacity)
    return HostSizing(
        cpu_count=cpu_count,
        memory_bytes=memory_bytes,
        connection_capacity=capacity,
        profile=profile,
        recommended_bandwidth_mbps=bandwidth,
    )


def _cgroup_cpu_limit() -> int | None:
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text(
            encoding="utf-8"
        ).strip().split()
        if quota == "max":
            return None
        return max(1, int(quota) // int(period))
    except (OSError, ValueError):
        return None


def _cgroup_memory_limit() -> int | None:
    try:
        value = Path("/sys/fs/cgroup/memory.max").read_text(
            encoding="utf-8"
        ).strip()
        if value == "max":
            return None
        return max(1024 * 1024, int(value))
    except (OSError, ValueError):
        return None


def detect_host_sizing() -> HostSizing:
    cpu_count = max(1, os.cpu_count() or 1)
    cpu_limit = _cgroup_cpu_limit()
    if cpu_limit is not None:
        cpu_count = min(cpu_count, cpu_limit)
    memory_bytes = int(psutil.virtual_memory().total)
    memory_limit = _cgroup_memory_limit()
    if memory_limit is not None:
        memory_bytes = min(memory_bytes, memory_limit)
    return calculate_host_sizing(cpu_count, memory_bytes)


HOST_SIZING = detect_host_sizing()


def effective_server_bandwidth(
    settings: dict[str, Any] | None = None,
) -> tuple[int, str]:
    database_value = settings.get("server_bandwidth_mbps") if settings else None
    if database_value is not None:
        return max(1, int(database_value)), "manual"
    if SERVER_BANDWIDTH_SETTING.lower() in {"", "auto"}:
        return HOST_SIZING.recommended_bandwidth_mbps, "auto"
    try:
        return max(0, int(SERVER_BANDWIDTH_SETTING)), "environment"
    except ValueError as error:
        raise RuntimeError(
            "SERVER_BANDWIDTH_MBIT must be auto or a non-negative integer"
        ) from error


def calculate_global_bandwidth_limit(
    server_bandwidth_mbps: int, bandwidth_percent: int
) -> int:
    if server_bandwidth_mbps <= 0:
        return 0
    return round(server_bandwidth_mbps * bandwidth_percent / 100)


def encrypt_secret(value: str) -> tuple[str, str]:
    nonce = os.urandom(12)
    payload = AESGCM(ENCRYPTION_KEY).encrypt(nonce, value.encode("utf-8"), None)
    return base64.b64encode(payload).decode("ascii"), base64.b64encode(nonce).decode(
        "ascii"
    )


def decrypt_secret(ciphertext: str, nonce: str) -> str:
    payload = AESGCM(ENCRYPTION_KEY).decrypt(
        base64.b64decode(nonce), base64.b64decode(ciphertext), None
    )
    return payload.decode("utf-8")


def traffic_gateway_credential(access_id: str) -> str:
    digest = hmac.new(
        TRAFFIC_GATEWAY_TOKEN.encode("utf-8"),
        access_id.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def runtime_control_token() -> str:
    digest = hmac.new(
        ENCRYPTION_KEY,
        RUNTIME_CONTROL_CONTEXT,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class TrafficGatewayClient:
    def __init__(self) -> None:
        self.last_config_fingerprint = ""
        self.last_warning = 0.0
        self.health: dict[str, Any] = {}
        self.available = False
        self.failure_seen = False
        self.recovery_successes = 0

    @staticmethod
    def payload(model: dict[str, Any]) -> dict[str, Any]:
        content: dict[str, Any] = {
            "global_limit_mbps": int(model["global_limit_mbps"]),
            "accounts": [
                {
                    "id": access["id"],
                    "limit_mbps": int(access["speed_limit_mbps"]),
                }
                for access in model["accesses"]
                if access["gateway_enabled"]
            ],
        }
        revision_payload = json.dumps(
            content, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        content["revision"] = hashlib.sha256(revision_payload).hexdigest()
        return content

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Accept": "application/json"}
        if payload is not None:
            headers.update(
                {
                    "Authorization": f"Bearer {TRAFFIC_GATEWAY_TOKEN}",
                    "Content-Type": "application/json",
                }
            )
        request = urllib.request.Request(
            f"{TRAFFIC_GATEWAY_URL}{path}",
            data=data,
            method=method,
            headers=headers,
        )
        with urllib.request.urlopen(request, timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))

    def reconcile(self, model: dict[str, Any]) -> bool:
        if len(TRAFFIC_GATEWAY_TOKEN) < 32:
            self.warn("Traffic Gateway token is missing; TCP limits are bypassed")
            return False
        try:
            self.health = self.request("/health")
            if self.health.get("status") != "ready":
                raise ValueError("Traffic Gateway health is not ready")
            payload = self.payload(model)
            fingerprint = str(payload["revision"])
            remote_revision = str(
                self.health.get("configuration", {}).get("revision", "")
            )
            if (
                fingerprint != self.last_config_fingerprint
                or remote_revision != fingerprint
            ):
                response = self.request("/v1/config", method="POST", payload=payload)
                if response.get("status") != "applied":
                    raise ValueError("Traffic Gateway rejected its runtime configuration")
                self.last_config_fingerprint = fingerprint
            self.recovery_successes += 1
            if not self.failure_seen or self.recovery_successes >= 3:
                self.available = True
            return self.available
        except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
            self.health = {}
            self.last_config_fingerprint = ""
            self.available = False
            self.failure_seen = True
            self.recovery_successes = 0
            self.warn(f"Traffic Gateway unavailable; TCP limits bypassed: {error}")
            return False

    def warn(self, message: str) -> None:
        now = time.monotonic()
        if now - self.last_warning >= 30:
            LOGGER.warning(message)
            self.last_warning = now


@dataclass
class ClaimedCommand:
    id: str
    type: str


class RuntimeAgent:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.xray: subprocess.Popen[str] | None = None
        self.xray_process: psutil.Process | None = None
        self.traffic_gateway = TrafficGatewayClient()
        self.config_fingerprint = ""
        self.static_config_fingerprint = ""
        self.caddy_config_fingerprint = ""
        self.applied_clients: dict[str, dict[str, Any]] = {}
        self.applied_accesses: set[str] = set()
        self.config_revision = 0
        self.reality_private_key = ""
        self.current_model: dict[str, Any] | None = None
        self.model_lock = threading.Lock()
        self.diagnostic_lock = threading.Lock()
        self.last_telemetry = 0.0
        self.last_duckdns = 0.0
        self.last_caddy_reload = 0.0
        self.last_cleanup = 0.0
        self.last_state_write = 0.0
        self.last_state_signature: tuple[Any, ...] | None = None
        self.health_lock = threading.Lock()
        self.health: dict[str, Any] = {
            "status": "starting",
            "xray_running": False,
            "traffic_gateway": "starting",
            "last_error": None,
            "version": RUNTIME_VERSION,
            "sizing_profile": HOST_SIZING.profile,
            "detected_cpu_count": HOST_SIZING.cpu_count,
            "detected_memory_bytes": HOST_SIZING.memory_bytes,
            "recommended_bandwidth_mbps": (
                HOST_SIZING.recommended_bandwidth_mbps
            ),
        }

    def set_health(self, **values: Any) -> None:
        with self.health_lock:
            self.health.update(values)

    def health_payload(self) -> dict[str, Any]:
        with self.health_lock:
            return dict(self.health)

    def stop(self) -> None:
        self.stop_event.set()
        self.stop_xray()

    def initialize_state(self) -> None:
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                insert into runtime_agent_state (id, status, version, updated_at)
                values ('default', 'starting', %s, now())
                on conflict (id) do update
                set status = excluded.status, version = excluded.version,
                    updated_at = now(), last_error = null
                """,
                (RUNTIME_VERSION,),
            )

    def update_state(
        self,
        status: str,
        *,
        error: str | None = None,
        synced: bool = False,
        telemetry: bool = False,
    ) -> bool:
        running = bool(self.xray and self.xray.poll() is None)
        health = self.health_payload()
        gateway_status = str(health.get("traffic_gateway", "starting"))
        gateway_seen = gateway_status in {"ready", "standby"}
        self.set_health(status=status, xray_running=running, last_error=error)
        state_signature = (
            status,
            error,
            running,
            self.config_revision,
            gateway_status,
        )
        now = time.monotonic()
        if (
            not synced
            and not telemetry
            and state_signature == self.last_state_signature
            and now - self.last_state_write < STATE_HEARTBEAT_SECONDS
        ):
            return False
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                insert into runtime_agent_state (
                    id, status, version, xray_running, config_revision,
                    last_heartbeat_at, last_sync_at, last_telemetry_at,
                    last_error, traffic_gateway_status,
                    traffic_gateway_connections, traffic_gateway_capacity,
                    traffic_gateway_rejected, traffic_gateway_shed,
                    traffic_gateway_fail_open_grants,
                    traffic_gateway_idle_timeouts,
                    traffic_gateway_health_probes,
                    traffic_gateway_last_seen_at, updated_at
                ) values (
                    'default', %s, %s, %s, %s, now(),
                    case when %s then now() else null end,
                    case when %s then now() else null end,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    case when %s then now() else null end, now()
                )
                on conflict (id) do update set
                    status = excluded.status,
                    version = excluded.version,
                    xray_running = excluded.xray_running,
                    config_revision = excluded.config_revision,
                    last_heartbeat_at = now(),
                    last_sync_at = case when %s then now()
                        else runtime_agent_state.last_sync_at end,
                    last_telemetry_at = case when %s then now()
                        else runtime_agent_state.last_telemetry_at end,
                    last_error = excluded.last_error,
                    traffic_gateway_status = excluded.traffic_gateway_status,
                    traffic_gateway_connections = excluded.traffic_gateway_connections,
                    traffic_gateway_capacity = excluded.traffic_gateway_capacity,
                    traffic_gateway_rejected = excluded.traffic_gateway_rejected,
                    traffic_gateway_shed = excluded.traffic_gateway_shed,
                    traffic_gateway_fail_open_grants = excluded.traffic_gateway_fail_open_grants,
                    traffic_gateway_idle_timeouts = excluded.traffic_gateway_idle_timeouts,
                    traffic_gateway_health_probes = excluded.traffic_gateway_health_probes,
                    traffic_gateway_last_seen_at = case when %s then now()
                        else runtime_agent_state.traffic_gateway_last_seen_at end,
                    updated_at = now()
                """,
                (
                    status,
                    RUNTIME_VERSION,
                    running,
                    self.config_revision,
                    synced,
                    telemetry,
                    error,
                    gateway_status,
                    int(health.get("traffic_gateway_connections", 0)),
                    int(health.get("traffic_gateway_capacity", 0)),
                    int(health.get("traffic_gateway_rejected", 0)),
                    int(health.get("traffic_gateway_shed", 0)),
                    int(health.get("traffic_gateway_fail_open_grants", 0)),
                    int(health.get("traffic_gateway_idle_timeouts", 0)),
                    int(health.get("traffic_gateway_health_probes", 0)),
                    gateway_seen,
                    synced,
                    telemetry,
                    gateway_seen,
                ),
            )
        self.last_state_signature = state_signature
        self.last_state_write = now
        return True

    @staticmethod
    def cleanup_expired_data() -> dict[str, int]:
        deleted: dict[str, int] = {}
        statements = {
            "audit_logs": (
                "delete from audit_logs where created_at < now() - interval '30 days'"
            ),
            "security_events": (
                "delete from security_events where created_at < now() - interval '7 days'"
            ),
            "ip_bans": """
                delete from ip_bans
                where released_at < now() - interval '7 days'
                   or (
                     permanent = false
                     and expires_at < now() - interval '7 days'
                   )
            """,
            "rate_limits": """
                delete from rate_limit
                where last_request < (
                    extract(epoch from now() - interval '2 days') * 1000
                )
            """,
            "expired_sessions": (
                "delete from session where expires_at < now() - interval '1 day'"
            ),
            "metric_samples": (
                "delete from instance_metric_samples "
                "where sampled_at < now() - interval '7 days'"
            ),
        }
        with db_connection() as connection, connection.cursor() as cursor:
            for name, statement in statements.items():
                cursor.execute(statement)
                deleted[name] = cursor.rowcount
        return deleted

    @staticmethod
    def generate_reality_keypair() -> tuple[str, str]:
        result = subprocess.run(
            [XRAY_BINARY, "x25519"],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        private_match = re.search(r"PrivateKey:\s*([A-Za-z0-9_-]+)", result.stdout)
        public_match = re.search(
            r"Password \(PublicKey\):\s*([A-Za-z0-9_-]+)", result.stdout
        )
        if not private_match or not public_match:
            raise RuntimeError("Unexpected Xray x25519 output")
        return private_match.group(1), public_match.group(1)

    def ensure_reality_key(self) -> str:
        if self.reality_private_key:
            return self.reality_private_key
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select ciphertext, nonce
                from encrypted_secrets
                where kind = 'reality_private_key'
                order by created_at desc
                limit 1
                """
            )
            secret = cursor.fetchone()
            cursor.execute(
                "select reality_public_key from instance_settings where id = 'default'"
            )
            settings = cursor.fetchone()
            if secret and settings and settings["reality_public_key"]:
                self.reality_private_key = decrypt_secret(
                    secret["ciphertext"], secret["nonce"]
                )
                return self.reality_private_key

            private_key, public_key = self.generate_reality_keypair()
            ciphertext, nonce = encrypt_secret(private_key)
            cursor.execute(
                """
                insert into encrypted_secrets (kind, ciphertext, nonce)
                values ('reality_private_key', %s, %s)
                """,
                (ciphertext, nonce),
            )
            cursor.execute(
                """
                insert into instance_settings (id, reality_public_key, updated_at)
                values ('default', %s, now())
                on conflict (id) do update
                set reality_public_key = excluded.reality_public_key, updated_at = now()
                """,
                (public_key,),
            )
            LOGGER.info("Generated a new REALITY keypair")
            self.reality_private_key = private_key
            return self.reality_private_key

    @staticmethod
    def ensure_reality_short_id() -> str:
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select reality_short_id from instance_settings where id = 'default'"
            )
            existing = cursor.fetchone()
            if existing and existing["reality_short_id"]:
                return str(existing["reality_short_id"])
            candidate = os.urandom(8).hex()
            cursor.execute(
                """
                update instance_settings
                set reality_short_id = %s, updated_at = now()
                where id = 'default' and reality_short_id is null
                returning reality_short_id
                """,
                (candidate,),
            )
            row = cursor.fetchone()
            if not row:
                cursor.execute(
                    "select reality_short_id from instance_settings where id = 'default'"
                )
                row = cursor.fetchone()
        if not row or not row["reality_short_id"]:
            raise RuntimeError("Instance REALITY short ID could not be initialized")
        return str(row["reality_short_id"])

    def enforce_limits(self) -> bool:
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select enforce_quota, enforce_expiry from instance_settings limit 1")
            settings = cursor.fetchone()
            if not settings:
                return False
            changed = 0
            if settings["enforce_expiry"]:
                cursor.execute(
                    """
                    update vpn_accesses
                    set status = 'expired', disabled_reason = 'Access expired',
                        active_connections = 0, updated_at = now()
                    where status = 'active' and expires_at is not null and expires_at <= now()
                    """
                )
                changed += cursor.rowcount
            if settings["enforce_quota"]:
                cursor.execute(
                    """
                    update vpn_accesses
                    set status = 'quota_exceeded', disabled_reason = 'Quota exceeded',
                        active_connections = 0, updated_at = now()
                    where status = 'active' and quota_bytes is not null
                      and used_bytes >= quota_bytes
                    """
                )
                changed += cursor.rowcount
            return changed > 0

    def load_model(self) -> dict[str, Any]:
        private_key = self.ensure_reality_key()
        instance_short_id = self.ensure_reality_short_id()
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select * from instance_settings where id = 'default'")
            settings = cursor.fetchone()
            if not settings:
                raise RuntimeError("Instance settings are missing")
            cursor.execute(
                """
                select v.id as access_id, v.speed_limit_mbps
                from vpn_accesses v
                order by v.id
                """
            )
            access_rows = cursor.fetchall()
            cursor.execute(
                """
                select
                    d.id as device_id, d.name as device_name, d.profile,
                    d.reality_short_id, d.spider_x, d.status as device_status,
                    s.ciphertext, s.nonce,
                    v.id as access_id, v.status as access_status,
                    v.speed_limit_mbps, v.expires_at, v.quota_bytes, v.used_bytes,
                    u.username, u.banned
                from devices d
                join vpn_accesses v on v.id = d.vpn_access_id
                join "user" u on u.id = v.user_id
                join encrypted_secrets s on s.id = d.vless_secret_id
                order by v.id, d.id
                """
            )
            rows = cursor.fetchall()
            cursor.execute(
                """
                select distinct reality_short_id
                from devices
                where reality_short_id is not null
                order by reality_short_id
                """
            )
            accepted_short_ids = {
                str(row["reality_short_id"]) for row in cursor.fetchall()
            }
            cursor.execute(
                """
                select ip_address
                from ip_bans
                where released_at is null
                  and (permanent = true or expires_at > now())
                order by ip_address
                """
            )
            blocked_source_ips = [row["ip_address"] for row in cursor.fetchall()]

        now = datetime.now(timezone.utc)
        clients: list[dict[str, Any]] = []
        grouped: dict[str, dict[str, Any]] = {
            str(row["access_id"]): {
                "id": str(row["access_id"]),
                "speed_limit_mbps": int(row["speed_limit_mbps"] or 0),
                "users": [],
                "gateway_enabled": True,
            }
            for row in access_rows
        }
        for row in rows:
            eligible = (
                not row["banned"]
                and row["access_status"] == "active"
                and row["device_status"] == "active"
            )
            if settings["enforce_expiry"] and row["expires_at"]:
                eligible = eligible and row["expires_at"] > now
            if settings["enforce_quota"] and row["quota_bytes"] is not None:
                eligible = eligible and row["used_bytes"] < row["quota_bytes"]
            if not eligible:
                continue
            client = {
                "id": decrypt_secret(row["ciphertext"], row["nonce"]),
                "email": f"device-{row['device_id']}",
                "level": 0,
                "device_id": str(row["device_id"]),
                "access_id": str(row["access_id"]),
                "short_id": row["reality_short_id"],
                "profile": str(row["profile"]),
                "spider_x": row["spider_x"],
                "device_name": str(row["device_name"]),
            }
            clients.append(client)
            access_id = str(row["access_id"])
            if access_id in grouped:
                grouped[access_id]["users"].append(client["email"])

        server_bandwidth_mbps, bandwidth_mode = effective_server_bandwidth(
            dict(settings)
        )
        bandwidth_percent = int(settings["server_bandwidth_limit_percent"] or 100)
        global_limit = calculate_global_bandwidth_limit(
            server_bandwidth_mbps, bandwidth_percent
        )
        accesses = list(grouped.values())
        accepted_short_ids.add(instance_short_id)

        return {
            "settings": dict(settings),
            "private_key": private_key,
            "instance_short_id": instance_short_id,
            "accepted_short_ids": sorted(accepted_short_ids),
            "clients": clients,
            "accesses": accesses,
            "global_limit_mbps": global_limit,
            "server_bandwidth_mbps": server_bandwidth_mbps,
            "server_bandwidth_mode": bandwidth_mode,
            "gateway_available": False,
            "blocked_source_ips": blocked_source_ips,
        }

    @staticmethod
    def fingerprint(model: dict[str, Any]) -> str:
        stable_model = {
            key: value
            for key, value in model.items()
            if key not in {"gateway_available", "blocked_source_ips"}
        }
        payload = json.dumps(
            stable_model, sort_keys=True, default=str, separators=(",", ":")
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def access_outbound(access: dict[str, Any]) -> dict[str, Any]:
        access_id = str(access["id"])
        return {
            "protocol": "socks",
            "tag": f"limit-{access_id}",
            "settings": {
                "address": TRAFFIC_GATEWAY_SOCKS_HOST,
                "port": TRAFFIC_GATEWAY_SOCKS_PORT,
                "user": access_id,
                "pass": traffic_gateway_credential(access_id),
            },
        }

    @staticmethod
    def access_balancer(access: dict[str, Any]) -> dict[str, Any]:
        access_id = str(access["id"])
        return {
            "tag": f"balance-{access_id}",
            "selector": [f"limit-{access_id}"],
            "fallbackTag": "direct",
            "strategy": {"type": "leastPing"},
        }

    @staticmethod
    def client_rule(client: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "field",
            "ruleTag": f"device-{client['device_id']}-gateway",
            "user": [client["email"]],
            "balancerTag": f"balance-{client['access_id']}",
        }

    @staticmethod
    def client_snapshot(model: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {
            str(client["email"]): {
                "id": str(client["id"]),
                "email": str(client["email"]),
                "device_id": str(client["device_id"]),
                "access_id": str(client["access_id"]),
            }
            for client in model["clients"]
        }

    @staticmethod
    def access_snapshot(model: dict[str, Any]) -> set[str]:
        return {str(access["id"]) for access in model["accesses"]}

    @classmethod
    def static_fingerprint(cls, model: dict[str, Any]) -> str:
        static_model = {
            **model,
            "clients": [],
            "accesses": [],
        }
        payload = json.dumps(
            cls.xray_config(static_model),
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def xray_config(model: dict[str, Any]) -> dict[str, Any]:
        settings = model["settings"]
        clients = [
            {"id": item["id"], "email": item["email"], "level": 0}
            for item in model["clients"]
        ]
        short_ids = list(
            dict.fromkeys(
                str(value)
                for value in model.get("accepted_short_ids", [])
                if value is not None
            )
        ) or [str(model.get("instance_short_id") or "")]
        outbounds: list[dict[str, Any]] = [
            {"protocol": "freedom", "tag": "direct"},
            {"protocol": "blackhole", "tag": "block"},
        ]
        balancers = [
            RuntimeAgent.access_balancer(access) for access in model["accesses"]
        ]
        outbounds.extend(
            RuntimeAgent.access_outbound(access) for access in model["accesses"]
        )
        routing_rules: list[dict[str, Any]] = [
            {
                "type": "field",
                "ip": [
                    "10.0.0.0/8",
                    "100.64.0.0/10",
                    "127.0.0.0/8",
                    "169.254.0.0/16",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    "::1/128",
                    "fc00::/7",
                    "fe80::/10",
                ],
                "outboundTag": "block",
            },
            {"type": "field", "protocol": ["bittorrent"], "outboundTag": "block"},
            {"type": "field", "network": "udp", "outboundTag": "direct"},
        ]
        routing_rules.extend(
            RuntimeAgent.client_rule(client) for client in model["clients"]
        )

        config: dict[str, Any] = {
            "log": {
                "access": "none",
                "dnsLog": False,
                "loglevel": "warning",
            },
            "api": {
                "tag": "api",
                "listen": f"127.0.0.1:{XRAY_API_PORT}",
                "services": ["HandlerService", "RoutingService", "StatsService"],
            },
            "stats": {},
            "policy": {
                "levels": {
                    "0": {
                        "handshake": 4,
                        "connIdle": 300,
                        "uplinkOnly": 2,
                        "downlinkOnly": 5,
                        "statsUserUplink": True,
                        "statsUserDownlink": True,
                        "statsUserOnline": True,
                        "bufferSize": 4,
                    }
                },
                "system": {
                    "statsInboundUplink": True,
                    "statsInboundDownlink": True,
                    "statsOutboundUplink": True,
                    "statsOutboundDownlink": True,
                },
            },
            "inbounds": [
                {
                    "tag": XRAY_INBOUND_TAG,
                    "listen": "0.0.0.0",
                    "port": XRAY_LISTEN_PORT,
                    "protocol": "vless",
                    "settings": {"clients": clients, "decryption": "none"},
                    "streamSettings": {
                        "network": "xhttp",
                        "security": "reality",
                        "xhttpSettings": {"path": settings["xhttp_path"]},
                        "realitySettings": {
                            "show": False,
                            "target": settings["reality_target"],
                            "serverNames": [settings["reality_server_name"]],
                            "privateKey": model["private_key"],
                            "shortIds": short_ids,
                        },
                    },
                }
            ],
            "outbounds": outbounds,
            "routing": {
                "domainStrategy": "IPIfNonMatch",
                "balancers": balancers,
                "rules": routing_rules,
            },
            "observatory": {
                "subjectSelector": ["limit-"],
                "probeURL": "http://198.18.0.254/generate_204",
                "probeInterval": "2s",
                "enableConcurrency": True,
            },
        }
        return config

    @staticmethod
    def write_security_policy(model: dict[str, Any]) -> None:
        policy = {
            "blocked_ips": model["blocked_source_ips"],
            "ports": sorted(
                {
                    80,
                    int(model["settings"]["vpn_port"]),
                    int(model["settings"]["admin_https_port"]),
                }
            ),
        }
        SECURITY_POLICY_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = SECURITY_POLICY_PATH.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(policy, sort_keys=True, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.chmod(0o640)
        temporary.replace(SECURITY_POLICY_PATH)

    @staticmethod
    def security_firewall_health() -> tuple[str, int]:
        try:
            payload = json.loads(SECURITY_STATUS_PATH.read_text(encoding="utf-8"))
            updated_at = int(payload.get("updated_at", 0))
            if int(time.time()) - updated_at >= 30:
                return "stale", 0
            count = int(payload.get("ipv4_bans", 0)) + int(
                payload.get("ipv6_bans", 0)
            )
            return str(payload.get("status", "unknown")), max(0, count)
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            return "unavailable", 0

    def write_and_validate_config(self, model: dict[str, Any]) -> None:
        XRAY_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = XRAY_CONFIG_PATH.with_suffix(".tmp.json")
        temporary.write_text(
            json.dumps(self.xray_config(model), indent=2), encoding="utf-8"
        )
        temporary.chmod(0o600)
        result = subprocess.run(
            [
                XRAY_BINARY,
                "run",
                "-test",
                "-format",
                "json",
                "-config",
                str(temporary),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
            raise RuntimeError(f"Xray rejected generated config: {detail}")
        temporary.replace(XRAY_CONFIG_PATH)

    def stop_xray(self) -> None:
        if not self.xray or self.xray.poll() is not None:
            return
        self.xray.terminate()
        try:
            self.xray.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.xray.kill()
            self.xray.wait(timeout=5)
        self.xray = None
        self.xray_process = None

    def start_xray(self) -> None:
        self.xray = subprocess.Popen(
            [XRAY_BINARY, "run", "-config", str(XRAY_CONFIG_PATH)],
            text=True,
        )
        self.xray_process = psutil.Process(self.xray.pid)
        self.xray_process.cpu_percent(None)
        time.sleep(0.5)
        if self.xray.poll() is not None:
            raise RuntimeError(f"Xray exited with status {self.xray.returncode}")

    @staticmethod
    def run_xray_api(
        action: str,
        arguments: list[str] | None = None,
        config: dict[str, Any] | None = None,
        expected: str | None = None,
    ) -> str:
        with tempfile.TemporaryDirectory(prefix="noxroute-api-") as directory:
            command = [
                XRAY_BINARY,
                "api",
                action,
                f"--server=127.0.0.1:{XRAY_API_PORT}",
            ]
            command.extend(arguments or [])
            if config is not None:
                config_path = Path(directory) / "operation.json"
                config_path.write_text(json.dumps(config), encoding="utf-8")
                command.append(str(config_path))
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=10,
            )
        output = f"{result.stdout}\n{result.stderr}".strip()
        if result.returncode != 0 or (expected and expected not in output):
            detail = output or f"exit status {result.returncode}"
            raise RuntimeError(f"Xray API {action} failed: {detail}")
        return output

    def add_access_live(self, access: dict[str, Any]) -> None:
        self.run_xray_api(
            "ado",
            config={"outbounds": [self.access_outbound(access)]},
        )
        self.run_xray_api(
            "adrules",
            arguments=["-append"],
            config={
                "routing": {
                    "balancers": [self.access_balancer(access)],
                    "rules": [],
                }
            },
        )

    def remove_access_live(self, access_id: str) -> None:
        self.run_xray_api("rmo", arguments=[f"limit-{access_id}"])

    def add_client_live(self, client: dict[str, Any]) -> None:
        self.run_xray_api(
            "adrules",
            arguments=["-append"],
            config={"routing": {"rules": [self.client_rule(client)]}},
        )
        self.add_inbound_user_live(client)

    def add_inbound_user_live(self, client: dict[str, Any]) -> None:
        self.run_xray_api(
            "adu",
            config={
                "inbounds": [
                    {
                        "tag": XRAY_INBOUND_TAG,
                        "port": XRAY_LISTEN_PORT,
                        "protocol": "vless",
                        "settings": {
                            "clients": [
                                {
                                    "id": client["id"],
                                    "email": client["email"],
                                    "level": 0,
                                }
                            ],
                            "decryption": "none",
                        },
                    }
                ]
            },
            expected="Added 1 user(s) in total.",
        )

    def remove_client_live(self, client: dict[str, Any]) -> None:
        self.remove_inbound_user_live(client)
        self.run_xray_api(
            "rmrules",
            arguments=[f"device-{client['device_id']}-gateway"],
        )

    def remove_inbound_user_live(self, client: dict[str, Any]) -> None:
        self.run_xray_api(
            "rmu",
            arguments=["-tag", XRAY_INBOUND_TAG, str(client["email"])],
            expected="Removed 1 user(s) in total.",
        )

    def reconcile_live_config(self, model: dict[str, Any]) -> bool:
        next_clients = self.client_snapshot(model)
        next_accesses = self.access_snapshot(model)
        removed_client_emails = sorted(self.applied_clients.keys() - next_clients.keys())
        changed_client_emails = sorted(
            email
            for email in self.applied_clients.keys() & next_clients.keys()
            if self.applied_clients[email] != next_clients[email]
        )
        added_client_emails = sorted(next_clients.keys() - self.applied_clients.keys())
        removed_accesses = sorted(self.applied_accesses - next_accesses)
        added_accesses = sorted(next_accesses - self.applied_accesses)

        for email in removed_client_emails + changed_client_emails:
            self.remove_client_live(self.applied_clients[email])

        accesses_by_id = {
            str(access["id"]): access for access in model["accesses"]
        }
        for access_id in added_accesses:
            self.add_access_live(accesses_by_id[access_id])

        for email in added_client_emails + changed_client_emails:
            self.add_client_live(next_clients[email])

        for access_id in removed_accesses:
            self.remove_access_live(access_id)

        changed = bool(
            removed_client_emails
            or changed_client_emails
            or added_client_emails
            or removed_accesses
            or added_accesses
        )
        self.applied_clients = next_clients
        self.applied_accesses = next_accesses
        return changed

    def sync_runtime(self, model: dict[str, Any]) -> None:
        self.write_and_validate_config(model)
        self.stop_xray()
        self.start_xray()
        self.config_fingerprint = self.fingerprint(model)
        self.static_config_fingerprint = self.static_fingerprint(model)
        self.applied_clients = self.client_snapshot(model)
        self.applied_accesses = self.access_snapshot(model)
        self.config_revision += 1
        self.reload_caddy(model["settings"])
        self.caddy_config_fingerprint = hashlib.sha256(
            self.caddyfile(model["settings"]).encode("utf-8")
        ).hexdigest()
        self.update_state("ready", synced=True)
        LOGGER.info(
            "Applied runtime revision %s with %s device credentials",
            self.config_revision,
            len(model["clients"]),
        )

    def reconcile_runtime(self, model: dict[str, Any]) -> None:
        if self.static_fingerprint(model) != self.static_config_fingerprint:
            self.sync_runtime(model)
            return

        self.write_and_validate_config(model)
        try:
            changed = self.reconcile_live_config(model)
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
            LOGGER.warning(
                "Live Xray reconciliation failed; applying validated config with a restart: %s",
                error,
            )
            self.sync_runtime(model)
            return

        caddy_config = self.caddyfile(model["settings"])
        caddy_fingerprint = hashlib.sha256(caddy_config.encode("utf-8")).hexdigest()
        caddy_changed = caddy_fingerprint != self.caddy_config_fingerprint
        if caddy_changed:
            self.reload_caddy(model["settings"])
            self.caddy_config_fingerprint = caddy_fingerprint

        self.config_fingerprint = self.fingerprint(model)
        if changed or caddy_changed:
            self.config_revision += 1
            self.update_state("ready", synced=True)
            LOGGER.info(
                "Applied runtime revision %s without restarting Xray (%s credentials)",
                self.config_revision,
                len(model["clients"]),
            )

    def claim_commands(self) -> list[ClaimedCommand]:
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select id, type::text
                from runtime_commands
                where status in ('pending', 'retrying') and available_at <= now()
                order by created_at
                for update skip locked
                limit 25
                """
            )
            rows = cursor.fetchall()
            if rows:
                cursor.execute(
                    """
                    update runtime_commands
                    set status = 'processing', locked_at = now(), locked_by = %s,
                        attempts = attempts + 1, updated_at = now()
                    where id = any(%s::uuid[])
                    """,
                    (f"runtime-{os.getpid()}", [str(row["id"]) for row in rows]),
                )
            return [ClaimedCommand(str(row["id"]), row["type"]) for row in rows]

    @staticmethod
    def complete_commands(commands: list[ClaimedCommand], error: str | None = None) -> None:
        if not commands:
            return
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update runtime_commands
                set status = %s, error_code = %s, error_message = %s,
                    locked_at = null, locked_by = null, updated_at = now()
                where id = any(%s::uuid[])
                """,
                (
                    "failed" if error else "succeeded",
                    "RUNTIME_SYNC_FAILED" if error else None,
                    error[:500] if error else None,
                    [command.id for command in commands],
                ),
            )

    @staticmethod
    def parse_stats(output: str) -> dict[str, int]:
        stats: dict[str, int] = {}
        try:
            payload = json.loads(output)
            for item in payload.get("stat", []):
                if item.get("name"):
                    stats[item["name"]] = stats.get(item["name"], 0) + int(
                        item.get("value") or 0
                    )
            if stats:
                return stats
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        for name, value in re.findall(
            r'name:\s*"([^"]+)"\s+value:\s*(\d+)', output
        ):
            stats[name] = stats.get(name, 0) + int(value)
        return stats

    def query_stats(self) -> dict[str, int]:
        if not self.xray or self.xray.poll() is not None:
            return {}
        try:
            result = subprocess.run(
                [
                    XRAY_BINARY,
                    "api",
                    "statsquery",
                    f"--server=127.0.0.1:{XRAY_API_PORT}",
                    "-pattern",
                    "user",
                    "-reset=true",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except subprocess.TimeoutExpired:
            LOGGER.warning("Xray traffic statistics timed out; keeping prior values")
            return {}
        if result.returncode != 0:
            return {}
        stats = self.parse_stats(f"{result.stdout}\n{result.stderr}")
        stats.update(self.query_online_stats())
        return stats

    def query_online_stats(self) -> dict[str, int]:
        try:
            result = subprocess.run(
                [
                    XRAY_BINARY,
                    "api",
                    "statsgetallonlineusers",
                    f"--server=127.0.0.1:{XRAY_API_PORT}",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except subprocess.TimeoutExpired:
            LOGGER.warning("Xray online statistics timed out; keeping prior values")
            return {}
        if result.returncode != 0:
            return {}
        try:
            payload = json.loads(result.stdout)
            online_names = payload.get("users", [])
        except (json.JSONDecodeError, TypeError):
            return {}

        stats: dict[str, int] = {}
        for name in online_names:
            parts = str(name).split(">>>")
            if len(parts) != 3 or parts[0] != "user" or parts[2] != "online":
                continue
            email = parts[1]
            try:
                detail = subprocess.run(
                    [
                        XRAY_BINARY,
                        "api",
                        "statsonline",
                        f"--server=127.0.0.1:{XRAY_API_PORT}",
                        "-email",
                        email,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
            except subprocess.TimeoutExpired:
                LOGGER.warning("Xray online count timed out for %s", email)
                stats[str(name)] = 1
                continue
            count = 1
            if detail.returncode == 0:
                try:
                    stat = json.loads(detail.stdout).get("stat") or {}
                    count = max(1, int(stat.get("value") or 1))
                except (json.JSONDecodeError, TypeError, ValueError):
                    pass
            stats[str(name)] = count
        return stats

    def collect_telemetry(self, model: dict[str, Any], interval: int) -> bool:
        stats = self.query_stats()
        by_device: dict[str, dict[str, int]] = {}
        for name, value in stats.items():
            parts = name.split(">>>")
            if len(parts) < 3 or parts[0] != "user":
                continue
            email = parts[1]
            if not email.startswith("device-"):
                continue
            device_id = email.removeprefix("device-")
            item = by_device.setdefault(
                device_id, {"uplink": 0, "downlink": 0, "online": 0}
            )
            if parts[2] == "traffic" and len(parts) >= 4:
                if parts[3] in {"uplink", "downlink"}:
                    item[parts[3]] += int(value)
            elif parts[2] == "online":
                item["online"] = max(item["online"], int(value))

        total_uplink = 0
        total_downlink = 0
        total_online = 0
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update devices
                set active_connections = 0, updated_at = now()
                where active_connections <> 0
                """
            )
            device_updates: list[tuple[int, int, int, int, int, int, str]] = []
            for device_id, item in by_device.items():
                uplink = item["uplink"]
                downlink = item["downlink"]
                online = item["online"]
                total_uplink += uplink
                total_downlink += downlink
                total_online += online
                device_updates.append(
                    (
                        uplink + downlink,
                        interval if online > 0 else 0,
                        online,
                        uplink,
                        downlink,
                        online,
                        device_id,
                    )
                )
            if device_updates:
                cursor.executemany(
                    """
                    update devices
                    set used_bytes = used_bytes + %s,
                        connected_seconds = connected_seconds + %s,
                        active_connections = %s,
                        last_seen_at = case when %s > 0 or %s > 0 or %s > 0
                            then now() else last_seen_at end,
                        updated_at = now()
                    where id = %s
                    """,
                    device_updates,
                )
            cursor.execute(
                """
                update vpn_accesses v
                set used_bytes = totals.used_bytes,
                    connected_seconds = totals.connected_seconds,
                    active_connections = totals.active_connections,
                    updated_at = now()
                from (
                    select vpn_access_id,
                           coalesce(sum(used_bytes), 0) as used_bytes,
                           coalesce(sum(connected_seconds), 0) as connected_seconds,
                           coalesce(sum(active_connections), 0) as active_connections
                    from devices
                    where status <> 'revoked'
                    group by vpn_access_id
                ) totals
                where v.id = totals.vpn_access_id
                  and (v.used_bytes, v.connected_seconds, v.active_connections)
                      is distinct from (
                          totals.used_bytes,
                          totals.connected_seconds,
                          totals.active_connections
                      )
                """
            )
            cpu_basis_points = 0
            memory_bytes = 0
            if self.xray_process and self.xray_process.is_running():
                try:
                    cpu_basis_points = round(self.xray_process.cpu_percent(None) * 100)
                    memory_bytes = self.xray_process.memory_info().rss
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            cursor.execute(
                """
                insert into instance_metric_samples (
                    uplink_bytes, downlink_bytes, active_connections,
                    xray_cpu_basis_points, xray_memory_bytes
                ) values (%s, %s, %s, %s, %s)
                """,
                (
                    total_uplink,
                    total_downlink,
                    total_online,
                    cpu_basis_points,
                    memory_bytes,
                ),
            )
        return self.enforce_limits()

    @staticmethod
    def duckdns_token() -> str:
        with db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select ciphertext, nonce
                from encrypted_secrets
                where kind = 'duckdns_token' and rotated_at is null
                order by created_at desc
                limit 1
                """
            )
            secret = cursor.fetchone()
            if secret:
                return decrypt_secret(secret["ciphertext"], secret["nonce"])
        try:
            return DUCKDNS_TOKEN_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            return ""

    def update_duckdns(self, settings: dict[str, Any]) -> None:
        token = self.duckdns_token()
        domains = list(
            dict.fromkeys(
                str(domain).removesuffix(".duckdns.org")
                for domain in (
                    settings.get("admin_domain"),
                    settings.get("vpn_domain"),
                )
                if domain
            )
        )
        if not token or not domains:
            return
        query = urllib.parse.urlencode(
            {"domains": ",".join(domains), "token": token, "ip": ""}
        )
        with urllib.request.urlopen(
            f"https://www.duckdns.org/update?{query}", timeout=15
        ) as response:
            if response.read().decode("utf-8").strip() != "OK":
                raise RuntimeError("DuckDNS update was rejected")

    @staticmethod
    def parse_endpoint(value: str, *, require_port_443: bool = False) -> tuple[str, int]:
        raw_value = value.strip()
        if not raw_value or "://" in raw_value:
            raise ValueError("Endpoint must use the host:port format")
        try:
            parsed = urllib.parse.urlsplit(f"//{raw_value}")
            host = parsed.hostname
            port = parsed.port
        except ValueError as error:
            raise ValueError("Endpoint contains an invalid port") from error
        if (
            not host
            or port is None
            or parsed.username
            or parsed.password
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Endpoint must contain only a host and port")
        if require_port_443 and port != 443:
            raise ValueError("REALITY target must use TCP port 443")
        return host.rstrip("."), port

    @staticmethod
    def public_addresses(host: str, port: int) -> list[tuple[int, tuple[Any, ...], str]]:
        try:
            records = socket.getaddrinfo(
                host,
                port,
                type=socket.SOCK_STREAM,
                proto=socket.IPPROTO_TCP,
            )
        except socket.gaierror as error:
            raise ValueError(f"DNS resolution failed for {host}") from error
        addresses: list[tuple[int, tuple[Any, ...], str]] = []
        seen: set[str] = set()
        for family, _socket_type, _protocol, _canonical_name, socket_address in records:
            address = str(socket_address[0]).split("%", maxsplit=1)[0]
            try:
                parsed_address = ipaddress.ip_address(address)
            except ValueError as error:
                raise ValueError("DNS returned an invalid IP address") from error
            if not parsed_address.is_global:
                raise ValueError("Endpoint resolves to a non-public IP address")
            if address not in seen:
                seen.add(address)
                addresses.append((family, socket_address, address))
        if not addresses:
            raise ValueError("Endpoint did not resolve to a public IP address")
        return addresses

    @classmethod
    def validate_reality_target(
        cls,
        target: str,
        server_name: str,
    ) -> dict[str, Any]:
        host, port = cls.parse_endpoint(target, require_port_443=True)
        normalized_server_name = server_name.strip().rstrip(".")
        if not re.fullmatch(
            r"(?=.{3,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}",
            normalized_server_name,
        ):
            raise ValueError("REALITY server name must be a valid public hostname")

        context = ssl.create_default_context()
        context.set_alpn_protocols(["h2", "http/1.1"])
        last_error: OSError | ssl.SSLError | None = None
        for family, socket_address, address in cls.public_addresses(host, port):
            connection = socket.socket(family, socket.SOCK_STREAM)
            connection.settimeout(6)
            started_at = time.monotonic()
            try:
                connection.connect(socket_address)
                with context.wrap_socket(
                    connection,
                    server_hostname=normalized_server_name,
                ) as tls_connection:
                    certificate = tls_connection.getpeercert()
                    expires_at = certificate.get("notAfter")
                    return {
                        "ok": True,
                        "target": f"{host}:{port}",
                        "server_name": normalized_server_name,
                        "resolved_ip": address,
                        "latency_ms": round((time.monotonic() - started_at) * 1000),
                        "tls_version": tls_connection.version() or "unknown",
                        "alpn": tls_connection.selected_alpn_protocol(),
                        "certificate_expires_at": (
                            datetime.fromtimestamp(
                                ssl.cert_time_to_seconds(expires_at),
                                tz=timezone.utc,
                            ).isoformat()
                            if expires_at
                            else None
                        ),
                    }
            except (OSError, ssl.SSLError) as error:
                last_error = error
                connection.close()
        raise ValueError(
            f"TLS validation failed for {host}: {last_error or 'connection failed'}"
        )

    @classmethod
    def tcp_probe(cls, host: str, port: int) -> dict[str, Any]:
        last_error: OSError | None = None
        for family, socket_address, address in cls.public_addresses(host, port):
            connection = socket.socket(family, socket.SOCK_STREAM)
            connection.settimeout(4)
            started_at = time.monotonic()
            try:
                connection.connect(socket_address)
                return {
                    "status": "reachable",
                    "host": host,
                    "port": port,
                    "resolved_ip": address,
                    "latency_ms": round((time.monotonic() - started_at) * 1000),
                }
            except OSError as error:
                last_error = error
            finally:
                connection.close()
        raise OSError(f"TCP connection failed: {last_error or 'unreachable'}")

    @staticmethod
    def diagnostic_client_config(
        model: dict[str, Any],
        client: dict[str, Any],
        address: str,
        port: int,
        proxy_port: int,
    ) -> dict[str, Any]:
        settings = model["settings"]
        reality_settings: dict[str, Any] = {
            "fingerprint": "chrome",
            "serverName": settings["reality_server_name"],
            "password": settings["reality_public_key"],
            "shortId": client["short_id"],
        }
        if client.get("spider_x"):
            reality_settings["spiderX"] = client["spider_x"]
        xhttp_settings: dict[str, Any] = {"path": settings["xhttp_path"]}
        mode = {
            "fast": "stream-one",
            "stealth": "packet-up",
        }.get(str(client.get("profile")))
        if mode:
            xhttp_settings["mode"] = mode
        return {
            "log": {"loglevel": "warning"},
            "inbounds": [
                {
                    "listen": "127.0.0.1",
                    "port": proxy_port,
                    "protocol": "http",
                    "settings": {},
                }
            ],
            "outbounds": [
                {
                    "tag": "noxroute-diagnostic",
                    "protocol": "vless",
                    "settings": {
                        "vnext": [
                            {
                                "address": address,
                                "port": port,
                                "users": [
                                    {
                                        "id": client["id"],
                                        "encryption": "none",
                                    }
                                ],
                            }
                        ]
                    },
                    "streamSettings": {
                        "network": "xhttp",
                        "security": "reality",
                        "xhttpSettings": xhttp_settings,
                        "realitySettings": reality_settings,
                    },
                }
            ],
        }

    @staticmethod
    def available_loopback_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])

    @staticmethod
    def wait_for_loopback_port(port: int, process: subprocess.Popen[Any]) -> None:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(
                    f"Diagnostic Xray client exited with status {process.returncode}"
                )
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    return
            except OSError:
                time.sleep(0.1)
        raise TimeoutError("Diagnostic proxy did not become ready")

    @staticmethod
    def public_ip_through_proxy(port: int) -> str:
        proxy_url = f"http://127.0.0.1:{port}"
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})
        )
        last_error: Exception | None = None
        for endpoint in ("https://api.ipify.org", "https://icanhazip.com"):
            request = urllib.request.Request(
                endpoint,
                headers={"User-Agent": "NoxRouteNeo-Diagnostic/1"},
            )
            try:
                with opener.open(request, timeout=12) as response:
                    value = response.read(128).decode("ascii").strip()
                if ipaddress.ip_address(value).is_global:
                    return value
            except (OSError, ValueError, urllib.error.URLError) as error:
                last_error = error
        raise RuntimeError(f"Tunnel HTTP probe failed: {last_error or 'no response'}")

    def run_tunnel_probe(
        self,
        model: dict[str, Any],
        client: dict[str, Any],
        address: str,
        port: int,
    ) -> dict[str, Any]:
        proxy_port = self.available_loopback_port()
        config = self.diagnostic_client_config(
            model,
            client,
            address,
            port,
            proxy_port,
        )
        started_at = time.monotonic()
        with tempfile.TemporaryDirectory(prefix="noxroute-diagnostic-") as directory:
            config_path = Path(directory) / "client.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            process = subprocess.Popen(
                [XRAY_BINARY, "run", "-config", str(config_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            try:
                self.wait_for_loopback_port(proxy_port, process)
                exit_ip = self.public_ip_through_proxy(proxy_port)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
        return {
            "status": "passed",
            "exit_ip": exit_ip,
            "latency_ms": round((time.monotonic() - started_at) * 1000),
        }

    def run_vpn_diagnostic(self) -> dict[str, Any]:
        if not self.diagnostic_lock.acquire(blocking=False):
            raise RuntimeError("A VPN diagnostic is already running")
        try:
            with self.model_lock:
                model = self.current_model
            if not model:
                raise RuntimeError("Runtime configuration is not ready")
            if not self.xray or self.xray.poll() is not None:
                raise RuntimeError("Xray is not running")
            settings = model["settings"]
            if not settings.get("reality_public_key"):
                raise RuntimeError("REALITY public key is missing")

            reality = self.validate_reality_target(
                str(settings["reality_target"]),
                str(settings["reality_server_name"]),
            )
            vpn_domain = str(settings.get("vpn_domain") or "").strip()
            vpn_port = int(settings.get("vpn_port") or 443)
            if not vpn_domain:
                raise RuntimeError("VPN domain is not configured")

            endpoint: dict[str, Any]
            endpoint_error: str | None = None
            try:
                endpoint = self.tcp_probe(vpn_domain, vpn_port)
            except (OSError, ValueError) as error:
                endpoint_error = str(error)
                endpoint = {
                    "status": "unreachable",
                    "host": vpn_domain,
                    "port": vpn_port,
                    "error": endpoint_error,
                }

            diagnostic_id = str(uuid.uuid4())
            client = {
                "id": diagnostic_id,
                "email": f"diagnostic-{diagnostic_id}",
                "short_id": model["instance_short_id"],
                "profile": "balanced",
                "spider_x": None,
            }
            self.add_inbound_user_live(client)
            try:
                public_error: str | None = None
                tunnel_scope = "public-endpoint"
                try:
                    if endpoint["status"] != "reachable":
                        raise RuntimeError(
                            endpoint_error or "Public endpoint is unreachable"
                        )
                    tunnel = self.run_tunnel_probe(
                        model,
                        client,
                        vpn_domain,
                        vpn_port,
                    )
                except (OSError, RuntimeError, TimeoutError) as error:
                    public_error = str(error)
                    tunnel_scope = "local-fallback"
                    tunnel = self.run_tunnel_probe(
                        model,
                        client,
                        "127.0.0.1",
                        XRAY_LISTEN_PORT,
                    )
            finally:
                try:
                    self.remove_inbound_user_live(client)
                except RuntimeError as error:
                    LOGGER.warning("Could not remove diagnostic Xray user: %s", error)

            tunnel.update(
                {
                    "scope": tunnel_scope,
                    "device_name": "Runtime probe",
                    "public_endpoint_error": public_error,
                }
            )
            return {
                "ok": True,
                "tested_at": datetime.now(timezone.utc).isoformat(),
                "endpoint": endpoint,
                "reality": reality,
                "tunnel": tunnel,
            }
        finally:
            self.diagnostic_lock.release()

    @staticmethod
    def caddyfile(settings: dict[str, Any]) -> str:
        domain = settings.get("admin_domain")
        port = int(settings.get("admin_https_port") or 8443)
        if not domain:
            return ""
        email = f"\n  email {LETSENCRYPT_EMAIL}" if LETSENCRYPT_EMAIL else ""
        return f"""{{
  admin 0.0.0.0:2019{email}
}}

http://{domain} {{
  redir https://{domain}:{port}{{uri}} permanent
}}

https://{domain}:{port} {{
  encode zstd gzip
  reverse_proxy web:3000
  header {{
    Strict-Transport-Security \"max-age=31536000; includeSubDomains\"
  }}
}}
"""

    def reload_caddy(self, settings: dict[str, Any]) -> None:
        config = self.caddyfile(settings)
        if not config:
            return
        request = urllib.request.Request(
            f"{CADDY_ADMIN_URL.rstrip('/')}/load",
            data=config.encode("utf-8"),
            method="POST",
            headers={"Content-Type": "text/caddyfile"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                response.read()
            self.last_caddy_reload = time.monotonic()
        except OSError as error:
            LOGGER.warning("Caddy reload deferred: %s", error)

    def run(self) -> None:
        self.initialize_state()
        while not self.stop_event.is_set():
            commands: list[ClaimedCommand] = []
            try:
                now = time.monotonic()
                if now - self.last_cleanup >= 3600:
                    deleted = self.cleanup_expired_data()
                    self.last_cleanup = now
                    if any(deleted.values()):
                        LOGGER.info("Retention cleanup removed rows: %s", deleted)
                commands = self.claim_commands()
                model = self.load_model()
                self.write_security_policy(model)
                firewall_status, firewall_bans = self.security_firewall_health()
                self.set_health(
                    security_firewall=firewall_status,
                    security_firewall_bans=firewall_bans,
                )
                gateway_required = any(
                    access["gateway_enabled"] for access in model["accesses"]
                )
                gateway_available = self.traffic_gateway.reconcile(model)
                model["gateway_available"] = gateway_available
                gateway_sizing = self.traffic_gateway.health.get("sizing", {})
                gateway_status = "standby"
                if gateway_required:
                    gateway_status = "ready" if gateway_available else "bypassed"
                self.set_health(
                    traffic_gateway=gateway_status,
                    traffic_gateway_connections=int(
                        self.traffic_gateway.health.get("connections", 0)
                    ),
                    traffic_gateway_capacity=int(
                        self.traffic_gateway.health.get("capacity", 0)
                    ),
                    traffic_gateway_rejected=int(
                        self.traffic_gateway.health.get("rejected_connections", 0)
                    ),
                    traffic_gateway_shed=int(
                        self.traffic_gateway.health.get("shed_connections", 0)
                    ),
                    traffic_gateway_idle_timeouts=int(
                        self.traffic_gateway.health.get("idle_timeouts", 0)
                    ),
                    traffic_gateway_fail_open_grants=int(
                        self.traffic_gateway.health.get("fail_open_grants", 0)
                    ),
                    traffic_gateway_health_probes=int(
                        self.traffic_gateway.health.get("health_probes", 0)
                    ),
                    traffic_gateway_capacity_mode=str(
                        gateway_sizing.get("mode", "auto")
                    ),
                    traffic_gateway_minimum_idle_seconds=int(
                        gateway_sizing.get("minimum_idle_seconds", 0)
                    ),
                    traffic_gateway_maximum_idle_seconds=int(
                        gateway_sizing.get("maximum_idle_seconds", 0)
                    ),
                    sizing_profile=str(
                        gateway_sizing.get("profile", HOST_SIZING.profile)
                    ),
                    detected_cpu_count=int(
                        gateway_sizing.get("cpu_count", HOST_SIZING.cpu_count)
                    ),
                    detected_memory_bytes=int(
                        gateway_sizing.get(
                            "memory_mib", HOST_SIZING.memory_bytes // 1024 // 1024
                        )
                    )
                    * 1024
                    * 1024,
                    recommended_bandwidth_mbps=HOST_SIZING.recommended_bandwidth_mbps,
                    server_bandwidth_mbps=int(model["server_bandwidth_mbps"]),
                    server_bandwidth_mode=str(model["server_bandwidth_mode"]),
                )
                fingerprint = self.fingerprint(model)
                xray_stopped = not self.xray or self.xray.poll() is not None
                sync_types = {
                    "SYNC_XRAY_CONFIG",
                    "SYNC_ACCESS",
                    "SYNC_DEVICE",
                    "REVOKE_DEVICE",
                    "FINALIZE_SETUP",
                }
                requires_reconcile = (
                    xray_stopped
                    or fingerprint != self.config_fingerprint
                    or any(command.type in sync_types for command in commands)
                )
                if xray_stopped:
                    self.sync_runtime(model)
                elif requires_reconcile:
                    self.reconcile_runtime(model)

                with self.model_lock:
                    self.current_model = model

                now = time.monotonic()
                telemetry_interval = max(
                    10, int(model["settings"]["telemetry_interval_seconds"] or 30)
                )
                if now - self.last_telemetry >= telemetry_interval:
                    if self.collect_telemetry(model, telemetry_interval):
                        self.config_fingerprint = ""
                    self.last_telemetry = now
                    self.update_state("ready", telemetry=True)
                if now - self.last_duckdns >= 300 or any(
                    command.type == "UPDATE_DUCKDNS" for command in commands
                ):
                    self.update_duckdns(model["settings"])
                    self.last_duckdns = now
                if now - self.last_caddy_reload >= 60 or any(
                    command.type == "RELOAD_CADDY" for command in commands
                ):
                    self.reload_caddy(model["settings"])

                unsupported = [
                    command
                    for command in commands
                    if command.type
                    not in sync_types
                    | {"UPDATE_DUCKDNS", "RELOAD_CADDY", "RUN_HEALTHCHECK"}
                ]
                if unsupported:
                    raise RuntimeError(
                        "Unsupported runtime command: "
                        + ", ".join(command.type for command in unsupported)
                    )
                self.complete_commands(commands)
                self.update_state("ready")
            except Exception as error:  # noqa: BLE001
                message = str(error)[:500]
                LOGGER.exception("Runtime loop failed")
                self.complete_commands(commands, message)
                try:
                    self.update_state("degraded", error=message)
                except Exception:  # noqa: BLE001
                    self.set_health(status="degraded", last_error=message)
            self.stop_event.wait(POLL_SECONDS)


class HealthHandler(http.server.BaseHTTPRequestHandler):
    agent: RuntimeAgent

    def send_json(self, status: int, value: dict[str, Any]) -> None:
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            return

    def control_authorized(self) -> bool:
        expected = f"Bearer {runtime_control_token()}"
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, expected)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_error(404)
            return
        status = 200 if self.agent.health_payload()["status"] == "ready" else 503
        self.send_json(status, self.agent.health_payload())

    def do_POST(self) -> None:  # noqa: N802
        if not self.control_authorized():
            self.send_json(401, {"ok": False, "error": "Unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"ok": False, "error": "Invalid content length"})
            return
        if length > 8192:
            self.send_json(413, {"ok": False, "error": "Request body is too large"})
            return
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("Request body must be a JSON object")
            if self.path == "/diagnostics/reality":
                target = str(body.get("target") or "")
                server_name = str(body.get("server_name") or "")
                self.send_json(
                    200,
                    self.agent.validate_reality_target(target, server_name),
                )
                return
            if self.path == "/diagnostics/vpn":
                self.send_json(200, self.agent.run_vpn_diagnostic())
                return
            self.send_json(404, {"ok": False, "error": "Not found"})
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json(422, {"ok": False, "error": str(error)[:500]})
        except (OSError, RuntimeError, TimeoutError) as error:
            self.send_json(503, {"ok": False, "error": str(error)[:500]})
        except Exception:  # noqa: BLE001
            LOGGER.exception("Runtime diagnostic request failed")
            self.send_json(500, {"ok": False, "error": "Diagnostic failed"})
            return

    def log_message(self, format_string: str, *args: Any) -> None:
        return


def start_health_server(agent: RuntimeAgent) -> http.server.ThreadingHTTPServer:
    HealthHandler.agent = agent
    server = http.server.ThreadingHTTPServer(("0.0.0.0", 8081), HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> None:
    agent = RuntimeAgent()
    health_server = start_health_server(agent)

    def stop_agent(_signal: int, _frame: Any) -> None:
        agent.stop()

    signal.signal(signal.SIGTERM, stop_agent)
    signal.signal(signal.SIGINT, stop_agent)
    try:
        agent.run()
    finally:
        health_server.shutdown()
        agent.stop()
        close_database_pool()


if __name__ == "__main__":
    main()
