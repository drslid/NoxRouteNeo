from __future__ import annotations

import base64
import hashlib
import hmac
import os
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
    }


class TrafficGatewayRuntimeTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
