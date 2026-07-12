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
            "reality_public_key": "public-key-placeholder",
        },
        "private_key": "private-key-placeholder",
        "instance_short_id": "71749492",
        "accepted_short_ids": ["71749492"],
        "clients": [
            {
                "id": "11111111-1111-4111-8111-111111111111",
                "email": "device-test",
                "short_id": "71749492",
                "device_id": "test",
                "access_id": "account-test",
                "profile": "balanced",
                "spider_x": None,
                "device_name": "Test phone",
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

    def test_xray_enables_live_handler_and_routing_services(self) -> None:
        config = runtime.RuntimeAgent.xray_config(runtime_model())
        self.assertEqual(
            config["api"]["services"],
            ["HandlerService", "RoutingService", "StatsService"],
        )
        self.assertEqual(
            config["routing"]["rules"][-1]["ruleTag"],
            "device-test-gateway",
        )

    def test_dynamic_clients_do_not_change_static_fingerprint(self) -> None:
        first = runtime_model()
        second = runtime_model()
        second["clients"] = []
        second["accesses"] = []
        self.assertEqual(
            runtime.RuntimeAgent.static_fingerprint(first),
            runtime.RuntimeAgent.static_fingerprint(second),
        )

    def test_live_reconcile_adds_a_device_without_stopping_xray(self) -> None:
        agent = runtime.RuntimeAgent()
        first = runtime_model()
        agent.applied_clients = agent.client_snapshot(first)
        agent.applied_accesses = agent.access_snapshot(first)
        second = runtime_model()
        second["clients"] = [
            *second["clients"],
            {
                "id": "22222222-2222-4222-8222-222222222222",
                "email": "device-second",
                "short_id": "71749492",
                "device_id": "second",
                "access_id": "account-test",
                "profile": "fast",
                "spider_x": None,
                "device_name": "Second phone",
            },
        ]
        with (
            patch.object(agent, "add_client_live") as add_client,
            patch.object(agent, "remove_client_live") as remove_client,
            patch.object(agent, "add_access_live") as add_access,
            patch.object(agent, "remove_access_live") as remove_access,
            patch.object(agent, "stop_xray") as stop_xray,
        ):
            self.assertTrue(agent.reconcile_live_config(second))
        add_client.assert_called_once()
        remove_client.assert_not_called()
        add_access.assert_not_called()
        remove_access.assert_not_called()
        stop_xray.assert_not_called()

    def test_reality_target_requires_public_tls_on_port_443(self) -> None:
        with self.assertRaisesRegex(ValueError, "port 443"):
            runtime.RuntimeAgent.validate_reality_target(
                "www.speedtest.net:8443",
                "www.speedtest.net",
            )

    def test_reality_target_rejects_private_dns_answers(self) -> None:
        answer = [
            (
                runtime.socket.AF_INET,
                runtime.socket.SOCK_STREAM,
                runtime.socket.IPPROTO_TCP,
                "",
                ("127.0.0.1", 443),
            )
        ]
        with (
            patch.object(runtime.socket, "getaddrinfo", return_value=answer),
            self.assertRaisesRegex(ValueError, "non-public"),
        ):
            runtime.RuntimeAgent.public_addresses("example.test", 443)

    def test_diagnostic_client_uses_xhttp_and_reality(self) -> None:
        model = runtime_model()
        config = runtime.RuntimeAgent.diagnostic_client_config(
            model,
            model["clients"][0],
            "127.0.0.1",
            10443,
            19080,
        )
        stream = config["outbounds"][0]["streamSettings"]
        self.assertEqual(stream["network"], "xhttp")
        self.assertEqual(stream["security"], "reality")
        self.assertEqual(stream["realitySettings"]["password"], "public-key-placeholder")

    def test_xray_accepts_live_access_and_user_updates(self) -> None:
        agent = runtime.RuntimeAgent()
        model = runtime_model()
        private_key, public_key = agent.generate_reality_keypair()
        model["private_key"] = private_key
        model["settings"]["reality_public_key"] = public_key
        listen_port = agent.available_loopback_port()
        api_port = agent.available_loopback_port()
        second_access = {
            "id": "account-second",
            "speed_limit_mbps": 10,
            "gateway_enabled": True,
            "users": [],
        }
        second_client = {
            "id": "22222222-2222-4222-8222-222222222222",
            "email": "device-live-test",
            "short_id": "71749492",
            "device_id": "live-test",
            "access_id": "account-second",
        }

        with tempfile.TemporaryDirectory() as directory:
            config_path = runtime.Path(directory) / "server.json"
            with (
                patch.object(runtime, "XRAY_CONFIG_PATH", config_path),
                patch.object(runtime, "XRAY_LISTEN_PORT", listen_port),
                patch.object(runtime, "XRAY_API_PORT", api_port),
            ):
                agent.write_and_validate_config(model)
                agent.start_xray()
                try:
                    agent.add_access_live(second_access)
                    agent.add_client_live(second_client)
                    output = agent.run_xray_api(
                        "inbounduser",
                        arguments=[
                            "-tag",
                            runtime.XRAY_INBOUND_TAG,
                            "-email",
                            second_client["email"],
                        ],
                    )
                    self.assertIn(second_client["email"], output)
                    agent.remove_client_live(second_client)
                    agent.remove_access_live(second_access["id"])
                finally:
                    agent.stop_xray()

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
