from __future__ import annotations

import unittest

import agent


class SecurityAgentTests(unittest.TestCase):
    def test_policy_normalizes_addresses_and_ports(self) -> None:
        policy = agent.normalized_policy(
            {
                "ports": [8443, 443, 443, 0],
                "blocked_ips": [
                    "203.0.113.8",
                    "2001:db8::8",
                    "not-an-address",
                ],
            }
        )
        self.assertEqual(policy["ports"], [443, 8443])
        self.assertEqual(policy["ipv4"], ["203.0.113.8"])
        self.assertEqual(policy["ipv6"], ["2001:db8::8"])

    def test_rules_only_include_validated_values(self) -> None:
        policy = agent.normalized_policy(
            {"ports": [80, 443], "blocked_ips": ["198.51.100.4"]}
        )
        rules = agent.render_rules(policy)
        self.assertIn("ip saddr @blocked_v4", rules)
        self.assertIn("tcp dport { 80, 443 }", rules)
        self.assertNotIn("ip6 saddr", rules)


if __name__ == "__main__":
    unittest.main()
