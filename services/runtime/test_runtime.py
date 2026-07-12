from __future__ import annotations

import base64
import hashlib
import hmac
import os
import json
import tempfile
import unittest
from contextlib import contextmanager
from unittest.mock import Mock, patch


os.environ.setdefault("DATABASE_URL", "postgresql://unused")
os.environ.setdefault(
    "APP_ENCRYPTION_KEY", base64.b64encode(bytes(32)).decode("ascii")
)
os.environ.setdefault("TRAFFIC_GATEWAY_TOKEN", "01234567890123456789012345678901")

import runtime  # noqa: E402


def runtime_model(gateway_available: bool = True) -> dict[str, object]:
    return {
        "settings": {
            "xhttp_path": "/noxroute",
            "reality_target": "www.speedtest.net:443",
            "reality_server_name": "www.speedtest.net",
        },
        "private_key": "private-key-placeholder",
        "clients": [
            {
                "id": "11111111-1111-4111-8111-111111111111",
                "email": "device-test",
                "short_id": "71749492",
            }
        ],
        "accesses": [
            {
                "id": "account-test",
                "speed_limit_mbps": 5,
                "gateway_enabled": True,
                "users": ["device-test"],
            }
        ],
        "global_limit_mbps": 0,
        "gateway_available": gateway_available,
        "blocked_source_ips": [],
    }


class TrafficGatewayRuntimeTests(unittest.TestCase):
    def test_host_sizing_scales_with_cpu_and_memory(self) -> None:
        small = runtime.calculate_host_sizing(2, 1024 * 1024 * 1024)
        large = runtime.calculate_host_sizing(8, 8 * 1024 * 1024 * 1024)
        self.assertEqual((small.connection_capacity, small.profile), (2048, "small"))
        self.assertEqual(
            (large.connection_capacity, large.profile),
            (16384, "high-capacity"),
        )
        self.assertLess(
            small.recommended_bandwidth_mbps,
            large.recommended_bandwidth_mbps,
        )

    def test_database_bandwidth_override_wins_over_automatic_value(self) -> None:
        bandwidth, mode = runtime.effective_server_bandwidth(
            {"server_bandwidth_mbps": 375}
        )
        self.assertEqual((bandwidth, mode), (375, "manual"))

    def test_bandwidth_guardrail_caps_at_one_hundred_percent(self) -> None:
        self.assertEqual(runtime.calculate_global_bandwidth_limit(250, 100), 250)
        self.assertEqual(runtime.calculate_global_bandwidth_limit(250, 80), 200)
        self.assertEqual(runtime.calculate_global_bandwidth_limit(0, 80), 0)

    def test_gateway_credential_matches_hmac_contract(self) -> None:
        expected = base64.urlsafe_b64encode(
            hmac.new(
                os.environ["TRAFFIC_GATEWAY_TOKEN"].encode("utf-8"),
                b"account-test",
                hashlib.sha256,
            ).digest()
        ).decode("ascii").rstrip("=")
        self.assertEqual(runtime.traffic_gateway_credential("account-test"), expected)

    def test_xray_keeps_native_fallback_when_gateway_is_unavailable(self) -> None:
        enabled = runtime.RuntimeAgent.xray_config(runtime_model(True))
        disabled = runtime.RuntimeAgent.xray_config(runtime_model(False))
        self.assertIn("socks", [item["protocol"] for item in enabled["outbounds"]])
        self.assertIn("socks", [item["protocol"] for item in disabled["outbounds"]])
        self.assertIn("observatory", enabled)
        self.assertTrue(
            any("balancerTag" in rule for rule in enabled["routing"]["rules"])
        )
        self.assertEqual(
            enabled["routing"]["balancers"][0]["fallbackTag"], "direct"
        )

    def test_gateway_health_does_not_change_xray_fingerprint(self) -> None:
        self.assertEqual(
            runtime.RuntimeAgent.fingerprint(runtime_model(True)),
            runtime.RuntimeAgent.fingerprint(runtime_model(False)),
        )

    def test_security_policy_contains_banned_addresses_and_public_ports(self) -> None:
        model = runtime_model()
        model["blocked_source_ips"] = ["203.0.113.8", "2001:db8::8"]
        model["settings"].update({"vpn_port": 443, "admin_https_port": 8443})
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "policy.json")
            with patch.object(runtime, "SECURITY_POLICY_PATH", runtime.Path(path)):
                runtime.RuntimeAgent.write_security_policy(model)
            with open(path, encoding="utf-8") as policy_file:
                policy = json.load(policy_file)
        self.assertEqual(policy["blocked_ips"], model["blocked_source_ips"])
        self.assertEqual(policy["ports"], [80, 443, 8443])

    def test_ban_changes_do_not_restart_xray(self) -> None:
        first = runtime_model()
        second = runtime_model()
        second["blocked_source_ips"] = ["203.0.113.8"]
        self.assertEqual(
            runtime.RuntimeAgent.fingerprint(first),
            runtime.RuntimeAgent.fingerprint(second),
        )

    def test_failure_bypasses_immediately_and_recovery_is_stable(self) -> None:
        client = runtime.TrafficGatewayClient()
        revision = client.payload(runtime_model())["revision"]
        healthy = {
            "status": "ready",
            "connections": 0,
            "configuration": {"revision": revision},
        }

        def healthy_request(path: str, **_kwargs: object) -> dict[str, object]:
            return {"status": "applied"} if path == "/v1/config" else healthy

        client.request = Mock(side_effect=healthy_request)
        client.last_config_fingerprint = str(revision)
        self.assertTrue(client.reconcile(runtime_model()))

        client.request = Mock(side_effect=OSError("gateway stopped"))
        self.assertFalse(client.reconcile(runtime_model()))

        client.request = Mock(side_effect=healthy_request)
        self.assertFalse(client.reconcile(runtime_model()))
        self.assertFalse(client.reconcile(runtime_model()))
        self.assertTrue(client.reconcile(runtime_model()))

    def test_gateway_restart_forces_configuration_replay(self) -> None:
        client = runtime.TrafficGatewayClient()
        model = runtime_model()
        client.last_config_fingerprint = str(client.payload(model)["revision"])
        client.request = Mock(
            side_effect=[
                {
                    "status": "ready",
                    "configured": False,
                    "configuration": {"revision": ""},
                },
                {"status": "applied"},
            ]
        )
        self.assertTrue(client.reconcile(model))
        self.assertEqual(client.request.call_count, 2)

    def test_runtime_state_persists_gateway_metrics(self) -> None:
        agent = runtime.RuntimeAgent()
        agent.set_health(
            traffic_gateway="ready",
            traffic_gateway_connections=12,
            traffic_gateway_capacity=4096,
            traffic_gateway_rejected=2,
            traffic_gateway_shed=3,
            traffic_gateway_fail_open_grants=4,
            traffic_gateway_idle_timeouts=5,
            traffic_gateway_health_probes=6,
        )
        cursor = Mock()
        cursor.__enter__ = Mock(return_value=cursor)
        cursor.__exit__ = Mock(return_value=False)
        connection = Mock()
        connection.__enter__ = Mock(return_value=connection)
        connection.__exit__ = Mock(return_value=False)
        connection.cursor.return_value = cursor

        @contextmanager
        def fake_db_connection():
            yield connection

        with patch.object(runtime, "db_connection", fake_db_connection):
            agent.update_state("ready")

        query, parameters = cursor.execute.call_args.args
        self.assertEqual(query.count("%s"), len(parameters))
        self.assertEqual(
            parameters[7:16], ("ready", 12, 4096, 2, 3, 4, 5, 6, True)
        )

    def test_unchanged_runtime_state_waits_for_heartbeat(self) -> None:
        agent = runtime.RuntimeAgent()
        cursor = Mock()
        cursor.__enter__ = Mock(return_value=cursor)
        cursor.__exit__ = Mock(return_value=False)
        connection = Mock()
        connection.cursor.return_value = cursor

        @contextmanager
        def fake_db_connection():
            yield connection

        with patch.object(runtime, "db_connection", fake_db_connection):
            self.assertTrue(agent.update_state("ready"))
            self.assertFalse(agent.update_state("ready"))

        self.assertEqual(cursor.execute.call_count, 1)

    def test_telemetry_forces_runtime_state_persistence(self) -> None:
        agent = runtime.RuntimeAgent()
        cursor = Mock()
        cursor.__enter__ = Mock(return_value=cursor)
        cursor.__exit__ = Mock(return_value=False)
        connection = Mock()
        connection.cursor.return_value = cursor

        @contextmanager
        def fake_db_connection():
            yield connection

        with patch.object(runtime, "db_connection", fake_db_connection):
            self.assertTrue(agent.update_state("ready"))
            self.assertTrue(agent.update_state("ready", telemetry=True))

        self.assertEqual(cursor.execute.call_count, 2)


if __name__ == "__main__":
    unittest.main()
