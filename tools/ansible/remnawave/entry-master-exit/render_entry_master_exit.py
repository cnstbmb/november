#!/usr/bin/env python3

import json
import sys
from pathlib import Path


def clean_list(values):
    return [value for value in values if value]


def emit_yaml(value, indent=0):
    pad = "  " * indent
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}{key}:")
                lines.append(emit_yaml(item, indent + 1))
            elif isinstance(item, bool):
                lines.append(f"{pad}{key}: {'true' if item else 'false'}")
            elif item is None:
                lines.append(f"{pad}{key}: null")
            elif isinstance(item, (int, float)):
                lines.append(f"{pad}{key}: {item}")
            else:
                escaped = str(item).replace('"', '\\"')
                lines.append(f'{pad}{key}: "{escaped}"')
        return "\n".join(lines)
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}-")
                lines.append(emit_yaml(item, indent + 1))
            elif isinstance(item, bool):
                lines.append(f"{pad}- {'true' if item else 'false'}")
            elif item is None:
                lines.append(f"{pad}- null")
            elif isinstance(item, (int, float)):
                lines.append(f"{pad}- {item}")
            else:
                escaped = str(item).replace('"', '\\"')
                lines.append(f'{pad}- "{escaped}"')
        return "\n".join(lines)
    return f"{pad}{value}"


def write_json(path: Path, data: dict):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def dns_config():
    return {
        "servers": [
            {
                "port": 53,
                "address": "127.0.0.1",
                "skipFallback": True,
                "queryStrategy": "UseIPv4",
            }
        ],
        "queryStrategy": "UseIP",
    }


def base_log():
    return {"loglevel": "warning"}


def block_rule_private():
    return {"ip": ["geoip:private"], "type": "field", "outboundTag": "BLOCK"}


def block_rule_bittorrent():
    return {"type": "field", "protocol": ["bittorrent"], "outboundTag": "BLOCK"}


def dns_rule():
    return {"port": "53", "type": "field", "network": "TCP,UDP", "outboundTag": "DNS_OUT"}


def build_entry_profile(entry, master):
    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": [
            {
                "tag": "VLESS_TCP_REALITY",
                "port": int(entry["public_port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": False,
                    "destOverride": ["http", "tls", "quic", "fakedns"],
                    "metadataOnly": False,
                },
                "streamSettings": {
                    "network": "tcp",
                    "sockopt": {
                        "tcpMaxSeg": 512,
                        "tcpcongestion": "bbr",
                        "domainStrategy": "UseIP",
                        "tcpUserTimeout": 10000,
                        "tcpWindowClamp": 600,
                        "tcpKeepAliveIdle": 300,
                        "tcpKeepAliveInterval": 10,
                    },
                    "security": "reality",
                    "tcpSettings": {
                        "header": {"type": "none"},
                        "acceptProxyProtocol": False,
                    },
                    "realitySettings": {
                        "show": False,
                        "xver": 0,
                        "target": entry["reality_target"],
                        "shortIds": [entry["reality_short_id"]],
                        "privateKey": entry["reality_private_key"],
                        "serverNames": [entry["reality_server_name"]],
                    },
                },
            }
        ],
        "outbounds": [
            {"tag": "DIRECT", "protocol": "freedom"},
            {"tag": "BLOCK", "protocol": "blackhole"},
            {
                "tag": "XHTTP_TO_MASTER",
                "protocol": "vless",
                "settings": {
                    "vnext": [
                        {
                            "port": int(entry["to_master_port"]),
                            "users": [
                                {
                                    "id": entry["bridge_uuid"],
                                    "encryption": "none",
                                }
                            ],
                            "address": entry["to_master_address"],
                        }
                    ]
                },
                "streamSettings": {
                    "network": "xhttp",
                    "security": "tls",
                    "tlsSettings": {
                        "alpn": ["h2", "http/1.1"],
                        "serverName": entry["to_master_server_name"],
                        "fingerprint": "chrome",
                        "allowInsecure": False,
                    },
                    "xhttpSettings": {
                        "host": entry["to_master_host"],
                        "mode": "stream-one",
                        "path": entry["to_master_path"],
                        "xmux": {
                            "cMaxReuseTimes": 0,
                            "maxConcurrency": "16-32",
                            "maxConnections": 0,
                            "hKeepAlivePeriod": 0,
                            "hMaxRequestTimes": "600-900",
                            "hMaxReusableSecs": "1800-3000",
                        },
                        "noGRPCHeader": False,
                        "scMinPostsIntervalMs": "30",
                    },
                },
            },
            {
                "tag": "DNS_OUT",
                "protocol": "freedom",
                "settings": {"redirect": "127.0.0.1:53"},
            },
        ],
        "routing": {
            "rules": [
                dns_rule(),
                block_rule_private(),
                block_rule_bittorrent(),
                {
                    "type": "field",
                    "inboundTag": ["VLESS_TCP_REALITY"],
                    "outboundTag": "XHTTP_TO_MASTER",
                },
            ],
            "domainStrategy": "AsIs",
        },
    }


def build_master_profile(master, exit_node):
    wg_peers = [
        {
            "publicKey": item["public_key"],
            "allowedIPs": [item["allowed_ip"]],
        }
        for item in master["wg_peers"]
    ]

    route_rules = [
        dns_rule(),
        block_rule_bittorrent(),
        block_rule_private(),
    ]

    for code in clean_list(master.get("route_ipv4_geoip", [])):
        route_rules.append({"ip": [f"geoip:{code}"], "type": "field", "outboundTag": "IPv4"})

    for selector in clean_list(master.get("route_ipv4_geosite", [])):
        route_rules.append({"type": "field", "domain": [f"geosite:{selector}"], "outboundTag": "IPv4"})

    route_rules.extend(
        [
            {
                "type": "field",
                "inboundTag": ["BRIDGE_MASTER_IN"],
                "outboundTag": "GRPC_TO_EXIT",
            },
            {
                "type": "field",
                "inboundTag": ["WG_KEENETIC_IN"],
                "outboundTag": "GRPC_TO_EXIT",
            },
            {
                "type": "field",
                "inboundTag": ["VLESS_REALITY_MOSCOW"],
                "outboundTag": "GRPC_TO_EXIT",
            },
            {
                "type": "field",
                "inboundTag": ["VLESS_REALITY_DIRECT_MSK"],
                "outboundTag": "IPv4",
            },
        ]
    )

    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": [
            {
                "tag": "BRIDGE_MASTER_IN",
                "port": int(master["bridge_inbound_port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": False,
                    "destOverride": ["http", "tls", "quic", "fakedns"],
                    "metadataOnly": False,
                },
                "streamSettings": {
                    "network": "xhttp",
                    "security": "tls",
                    "tlsSettings": {
                        "alpn": ["h2", "http/1.1"],
                        "maxVersion": "1.3",
                        "minVersion": "1.2",
                        "certificates": [
                            {
                                "usage": "encipherment",
                                "keyFile": f"/etc/letsencrypt/live/{master['cert_domain']}/privkey.pem",
                                "certificateFile": f"/etc/letsencrypt/live/{master['cert_domain']}/fullchain.pem",
                            }
                        ],
                    },
                    "xhttpSettings": {
                        "host": master["bridge_host"],
                        "mode": "stream-one",
                        "path": master["bridge_path"],
                        "scMaxBufferedPosts": 30,
                        "scMaxEachPostBytes": "1000000",
                        "scStreamUpServerSecs": "20-80",
                    },
                },
            },
            {
                "tag": "WG_KEENETIC_IN",
                "port": int(master["wg_port"]),
                "listen": "0.0.0.0",
                "protocol": "wireguard",
                "settings": {
                    "peers": wg_peers,
                    "secretKey": master["wg_secret_key"],
                    "kernelMode": False,
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": False,
                    "destOverride": ["http", "tls", "quic"],
                    "metadataOnly": False,
                },
            },
            {
                "tag": "VLESS_REALITY_MOSCOW",
                "port": int(master["reality_moscow"]["port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": False,
                    "destOverride": ["http", "tls", "quic"],
                    "metadataOnly": False,
                },
                "streamSettings": {
                    "network": "raw",
                    "security": "reality",
                    "realitySettings": {
                        "show": False,
                        "xver": 0,
                        "target": master["reality_moscow"]["target"],
                        "shortIds": [master["reality_moscow"]["short_id"], ""],
                        "privateKey": master["reality_moscow"]["private_key"],
                        "serverNames": master["reality_moscow"]["server_names"],
                    },
                },
            },
            {
                "tag": "VLESS_REALITY_DIRECT_MSK",
                "port": int(master["reality_direct_msk"]["port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": False,
                    "destOverride": ["http", "tls", "quic"],
                    "metadataOnly": False,
                },
                "streamSettings": {
                    "network": "raw",
                    "security": "reality",
                    "realitySettings": {
                        "show": False,
                        "xver": 0,
                        "target": master["reality_direct_msk"]["target"],
                        "shortIds": [master["reality_direct_msk"]["short_id"], ""],
                        "privateKey": master["reality_direct_msk"]["private_key"],
                        "serverNames": master["reality_direct_msk"]["server_names"],
                    },
                },
            },
        ],
        "outbounds": [
            {
                "tag": "DIRECT",
                "protocol": "freedom",
                "settings": {
                    "noises": [
                        {
                            "type": "rand",
                            "delay": "10-16",
                            "packet": "10-20",
                            "applyTo": "ip",
                        }
                    ],
                    "domainStrategy": "AsIs",
                },
                "streamSettings": {
                    "sockopt": {
                        "tcpMptcp": True,
                        "penetrate": True,
                        "tcpFastOpen": True,
                    }
                },
            },
            {"tag": "BLOCK", "protocol": "blackhole"},
            {
                "tag": "IPv4",
                "protocol": "freedom",
                "settings": {
                    "noises": [
                        {
                            "type": "rand",
                            "delay": "10-16",
                            "packet": "10-20",
                            "applyTo": "ip",
                        }
                    ],
                    "domainStrategy": "UseIPv4",
                },
                "streamSettings": {
                    "sockopt": {
                        "tcpMptcp": True,
                        "penetrate": True,
                        "tcpFastOpen": True,
                    }
                },
            },
            {
                "tag": "GRPC_TO_EXIT",
                "protocol": "vless",
                "settings": {
                    "vnext": [
                        {
                            "port": int(master["to_exit_port"]),
                            "users": [
                                {
                                    "id": master["to_exit_uuid"],
                                    "encryption": "none",
                                }
                            ],
                            "address": master["to_exit_address"],
                        }
                    ]
                },
                "streamSettings": {
                    "network": "grpc",
                    "security": "tls",
                    "tlsSettings": {
                        "alpn": ["h2", "http/1.1"],
                        "serverName": master["to_exit_server_name"],
                        "fingerprint": "chrome",
                        "allowInsecure": False,
                    },
                    "grpcSettings": {
                        "multiMode": False,
                        "serviceName": "",
                    },
                },
            },
            {
                "tag": "DNS_OUT",
                "protocol": "freedom",
                "settings": {"redirect": "127.0.0.1:53"},
            },
        ],
        "routing": {
            "rules": route_rules,
            "domainStrategy": "AsIs",
        },
    }


def build_exit_profile(exit_node):
    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": [
            {
                "tag": "VLESS_REALITY_DIRECT",
                "port": int(exit_node["public_port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "destOverride": ["http", "tls", "quic", "fakedns"],
                },
                "streamSettings": {
                    "network": "tcp",
                    "security": "reality",
                    "tcpSettings": {
                        "header": {"type": "none"},
                        "acceptProxyProtocol": False,
                    },
                    "realitySettings": {
                        "show": False,
                        "xver": 0,
                        "target": exit_node["reality_target"],
                        "shortIds": [exit_node["reality_short_id"]],
                        "privateKey": exit_node["reality_private_key"],
                        "serverNames": exit_node["reality_server_names"],
                    },
                },
            },
            {
                "tag": "BRIDGE_EXIT_IN",
                "port": int(exit_node["bridge_inbound_port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "destOverride": ["http", "tls", "quic", "fakedns"],
                },
                "streamSettings": {
                    "network": "grpc",
                    "security": "tls",
                    "tlsSettings": {
                        "alpn": ["h2", "http/1.1"],
                        "maxVersion": "1.3",
                        "minVersion": "1.2",
                        "serverName": exit_node["cert_domain"],
                        "certificates": [
                            {
                                "usage": "encipherment",
                                "keyFile": f"/etc/letsencrypt/live/{exit_node['cert_domain']}/privkey.pem",
                                "certificateFile": f"/etc/letsencrypt/live/{exit_node['cert_domain']}/fullchain.pem",
                            }
                        ],
                    },
                    "grpcSettings": {
                        "multiMode": False,
                        "serviceName": "",
                    },
                },
            },
        ],
        "outbounds": [
            {
                "tag": "DIRECT",
                "protocol": "freedom",
                "settings": {
                    "noises": [
                        {
                            "type": "rand",
                            "delay": "10-16",
                            "packet": "10-20",
                            "applyTo": "ip",
                        }
                    ],
                    "domainStrategy": "AsIs",
                },
                "streamSettings": {
                    "sockopt": {
                        "tcpMptcp": True,
                        "penetrate": True,
                        "tcpFastOpen": True,
                    }
                },
            },
            {"tag": "BLOCK", "protocol": "blackhole"},
            {
                "tag": "IPv4",
                "protocol": "freedom",
                "settings": {
                    "noises": [
                        {
                            "type": "rand",
                            "delay": "10-16",
                            "packet": "10-20",
                            "applyTo": "ip",
                        }
                    ],
                    "domainStrategy": "UseIPv4",
                },
                "streamSettings": {
                    "sockopt": {
                        "tcpMptcp": True,
                        "penetrate": True,
                        "tcpFastOpen": True,
                    }
                },
            },
            {
                "tag": "DNS_OUT",
                "protocol": "freedom",
                "settings": {"redirect": "127.0.0.1:53"},
            },
        ],
        "routing": {
            "rules": [
                dns_rule(),
                block_rule_bittorrent(),
                block_rule_private(),
                {
                    "type": "field",
                    "network": "TCP,UDP",
                    "protocol": ["http", "tls", "quic"],
                    "outboundTag": "IPv4",
                },
                {
                    "type": "field",
                    "network": "TCP,UDP",
                    "outboundTag": "DIRECT",
                },
            ],
            "domainStrategy": "AsIs",
        },
    }


def build_direct_exit_profile(direct_exit):
    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": [
            {
                "tag": "VLESS_REALITY_DIRECT_EXIT",
                "port": int(direct_exit["public_port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "destOverride": ["http", "tls", "quic", "fakedns"],
                },
                "streamSettings": {
                    "network": "tcp",
                    "security": "reality",
                    "tcpSettings": {
                        "header": {"type": "none"},
                        "acceptProxyProtocol": False,
                    },
                    "realitySettings": {
                        "show": False,
                        "xver": 0,
                        "target": direct_exit["reality_target"],
                        "shortIds": [direct_exit["reality_short_id"]],
                        "privateKey": direct_exit["reality_private_key"],
                        "serverNames": direct_exit["reality_server_names"],
                    },
                },
            }
        ],
        "outbounds": [
            {
                "tag": "DIRECT",
                "protocol": "freedom",
                "settings": {
                    "noises": [
                        {
                            "type": "rand",
                            "delay": "10-16",
                            "packet": "10-20",
                            "applyTo": "ip",
                        }
                    ],
                    "domainStrategy": "AsIs",
                },
                "streamSettings": {
                    "sockopt": {
                        "tcpMptcp": True,
                        "penetrate": True,
                        "tcpFastOpen": True,
                    }
                },
            },
            {"tag": "BLOCK", "protocol": "blackhole"},
            {
                "tag": "IPv4",
                "protocol": "freedom",
                "settings": {
                    "noises": [
                        {
                            "type": "rand",
                            "delay": "10-16",
                            "packet": "10-20",
                            "applyTo": "ip",
                        }
                    ],
                    "domainStrategy": "UseIPv4",
                },
                "streamSettings": {
                    "sockopt": {
                        "tcpMptcp": True,
                        "penetrate": True,
                        "tcpFastOpen": True,
                    }
                },
            },
            {
                "tag": "DNS_OUT",
                "protocol": "freedom",
                "settings": {"redirect": "127.0.0.1:53"},
            },
        ],
        "routing": {
            "rules": [
                dns_rule(),
                block_rule_bittorrent(),
                block_rule_private(),
                {
                    "type": "field",
                    "network": "TCP,UDP",
                    "protocol": ["http", "tls", "quic"],
                    "outboundTag": "IPv4",
                },
                {
                    "type": "field",
                    "network": "TCP,UDP",
                    "outboundTag": "DIRECT",
                },
            ],
            "domainStrategy": "AsIs",
        },
    }


def main():
    spec_path = Path(sys.argv[1])
    profiles_dir = Path(sys.argv[2])
    host_vars_dir = Path(sys.argv[3])
    topology_vars_file = Path(sys.argv[4])
    summary_file = Path(sys.argv[5])

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    entry = spec["entry"]
    master = spec["master"]
    exit_node = spec["exit"]
    direct_exit = spec.get("direct_exit")
    exit_host_remark = exit_node.get("host_remark") or ("AMSTERDAM" if direct_exit else "SERBIA")
    direct_exit_host_remark = (
        (direct_exit.get("host_remark") or "SERBIA") if direct_exit else None
    )

    profiles_dir.mkdir(parents=True, exist_ok=True)
    host_vars_dir.mkdir(parents=True, exist_ok=True)

    host_ports = {
        entry["host"]: {
            "roles": ["entry"],
            "tcp_ports": [int(entry["public_port"])],
            "udp_ports": [],
        },
        master["host"]: {
            "roles": ["transit", "direct", "wireguard"],
            "tcp_ports": [
                int(master["bridge_inbound_port"]),
                int(master["reality_moscow"]["port"]),
                int(master["reality_direct_msk"]["port"]),
            ],
            "udp_ports": [int(master["wg_port"])],
        },
        exit_node["host"]: {
            "roles": ["exit", "direct"],
            "tcp_ports": [int(exit_node["public_port"]), int(exit_node["bridge_inbound_port"])],
            "udp_ports": [],
        },
    }
    if direct_exit:
        host_ports[direct_exit["host"]] = {
            "roles": ["direct"],
            "tcp_ports": [int(direct_exit["public_port"])],
            "udp_ports": [],
        }

    for host, meta in host_ports.items():
        tcp_ports = meta["tcp_ports"]
        udp_ports = meta["udp_ports"]
        if len(tcp_ports) != len(set(tcp_ports)):
            raise SystemExit(f"Duplicate TCP ports detected for host '{host}': {tcp_ports}")
        if len(udp_ports) != len(set(udp_ports)):
            raise SystemExit(f"Duplicate UDP ports detected for host '{host}': {udp_ports}")

    entry_profile_file = profiles_dir / f"01-entry-{entry['host']}.profile.json"
    master_profile_file = profiles_dir / f"02-master-{master['host']}.profile.json"
    exit_profile_file = profiles_dir / f"03-exit-{exit_node['host']}.profile.json"
    direct_exit_profile_file = (
        profiles_dir / f"04-direct-exit-{direct_exit['host']}.profile.json" if direct_exit else None
    )

    write_json(entry_profile_file, build_entry_profile(entry, master))
    write_json(master_profile_file, build_master_profile(master, exit_node))
    write_json(exit_profile_file, build_exit_profile(exit_node))
    if direct_exit and direct_exit_profile_file:
        write_json(direct_exit_profile_file, build_direct_exit_profile(direct_exit))

    for host, meta in host_ports.items():
        host_dir = host_vars_dir / host
        host_dir.mkdir(parents=True, exist_ok=True)
        host_file = host_dir / "remnawave_topology.yml"
        host_data = {
            "remnawave_topology_roles": sorted(set(meta["roles"])),
            "firewall_extra_tcp_ports": sorted(set(meta["tcp_ports"])),
        }
        if meta["udp_ports"]:
            host_data["firewall_extra_udp_ports"] = sorted(set(meta["udp_ports"]))
        host_file.write_text(emit_yaml(host_data) + "\n", encoding="utf-8")

    topology_data = {
        "mode": "entry_master_exit",
        "nodes": [
            {
                "host": entry["host"],
                "profile": "ENTRY_NODE",
                "public_address": entry["public_address"],
                "node_port": 2222,
            },
            {
                "host": master["host"],
                "profile": "MASTER_NODE",
                "public_address": master["public_address"],
                "node_port": 2222,
            },
            {
                "host": exit_node["host"],
                "profile": "EXIT_NODE",
                "public_address": exit_node["public_address"],
                "node_port": 2222,
            },
        ],
        "hosts": [
            {
                "remark": "WHITE LIST",
                "profile": "ENTRY_NODE",
                "inbound": "VLESS_TCP_REALITY",
                "address": entry["public_address"],
                "port": int(entry["public_port"]),
                "node": entry["host"],
            },
            {
                "remark": "MOSCOW",
                "profile": "MASTER_NODE",
                "inbound": "VLESS_REALITY_MOSCOW",
                "address": master["public_address"],
                "port": int(master["reality_moscow"]["port"]),
                "node": master["host"],
            },
            {
                "remark": "DIRECT MOSCOW",
                "profile": "MASTER_NODE",
                "inbound": "VLESS_REALITY_DIRECT_MSK",
                "address": master["public_address"],
                "port": int(master["reality_direct_msk"]["port"]),
                "node": master["host"],
            },
            {
                "remark": exit_host_remark,
                "profile": "EXIT_NODE",
                "inbound": "VLESS_REALITY_DIRECT",
                "address": exit_node["public_address"],
                "port": int(exit_node["public_port"]),
                "node": exit_node["host"],
            },
        ],
        "squads": [
            {"name": "Public Squad", "inbounds": ["VLESS_TCP_REALITY", "VLESS_REALITY_MOSCOW"]},
            {
                "name": "Direct Exit Squad",
                "inbounds": clean_list(
                    ["VLESS_REALITY_DIRECT_MSK", "VLESS_REALITY_DIRECT"]
                    + (["VLESS_REALITY_DIRECT_EXIT"] if direct_exit else [])
                ),
            },
            {"name": "Bridge Master Squad", "inbounds": ["BRIDGE_MASTER_IN"]},
            {"name": "Bridge Exit Squad", "inbounds": ["BRIDGE_EXIT_IN"]},
        ],
        "system_users": [
            {
                "username": "bridge_entry_to_master",
                "internal_squads": ["Bridge Master Squad"],
                "used_by": "ENTRY_NODE -> XHTTP_TO_MASTER",
                "service_uuid": entry["bridge_uuid"],
            },
            {
                "username": "bridge_master_to_exit",
                "internal_squads": ["Bridge Exit Squad"],
                "used_by": "MASTER_NODE -> GRPC_TO_EXIT",
                "service_uuid": master["to_exit_uuid"],
            },
        ],
        "public_access_pattern": {
            "regular_user_internal_squads": ["Public Squad", "Direct Exit Squad"],
            "advanced_host_overrides": "empty/default",
        },
        "client_values": [
            {
                "host": "WHITE LIST",
                "public_key": entry["reality_public_key"],
                "short_id": entry["reality_short_id"],
                "server_names": [entry["reality_server_name"]],
                "path": "",
            },
            {
                "host": "MOSCOW",
                "public_key": master["reality_moscow"]["public_key"],
                "short_id": master["reality_moscow"]["short_id"],
                "server_names": master["reality_moscow"]["server_names"],
                "path": "",
            },
            {
                "host": "DIRECT MOSCOW",
                "public_key": master["reality_direct_msk"]["public_key"],
                "short_id": master["reality_direct_msk"]["short_id"],
                "server_names": master["reality_direct_msk"]["server_names"],
                "path": "",
            },
            {
                "host": exit_host_remark,
                "public_key": exit_node["reality_public_key"],
                "short_id": exit_node["reality_short_id"],
                "server_names": exit_node["reality_server_names"],
                "path": "",
            },
        ],
    }
    if direct_exit:
        topology_data["nodes"].append(
            {
                "host": direct_exit["host"],
                "profile": "DIRECT_EXIT",
                "public_address": direct_exit["public_address"],
                "node_port": 2222,
            }
        )
        topology_data["hosts"].append(
            {
                "remark": direct_exit_host_remark,
                "profile": "DIRECT_EXIT",
                "inbound": "VLESS_REALITY_DIRECT_EXIT",
                "address": direct_exit["public_address"],
                "port": int(direct_exit["public_port"]),
                "node": direct_exit["host"],
            }
        )
        topology_data["client_values"].append(
            {
                "host": direct_exit_host_remark,
                "public_key": direct_exit["reality_public_key"],
                "short_id": direct_exit["reality_short_id"],
                "server_names": direct_exit["reality_server_names"],
                "path": "",
            }
        )
    topology_vars_file.write_text(emit_yaml(topology_data) + "\n", encoding="utf-8")

    summary_node_lines = [
        f"- ENTRY_NODE -> {entry['host']} ({entry['public_address']}:2222)",
        f"- MASTER_NODE -> {master['host']} ({master['public_address']}:2222)",
        f"- EXIT_NODE -> {exit_node['host']} ({exit_node['public_address']}:2222)",
    ]
    if direct_exit:
        summary_node_lines.append(
            f"- DIRECT_EXIT -> {direct_exit['host']} ({direct_exit['public_address']}:2222)"
        )

    summary_host_lines = [
        f"- WHITE LIST -> {entry['public_address']}:{entry['public_port']} ({entry['host']})",
        f"- MOSCOW -> {master['public_address']}:{master['reality_moscow']['port']} ({master['host']})",
        f"- DIRECT MOSCOW -> {master['public_address']}:{master['reality_direct_msk']['port']} ({master['host']})",
        f"- {exit_host_remark} -> {exit_node['public_address']}:{exit_node['public_port']} ({exit_node['host']})",
    ]
    if direct_exit:
        summary_host_lines.append(
            f"- {direct_exit_host_remark} -> {direct_exit['public_address']}:{direct_exit['public_port']} ({direct_exit['host']})"
        )

    summary_client_lines = [
        f"- WHITE LIST: public_key={entry['reality_public_key']}, shortId={entry['reality_short_id']}",
        f"- MOSCOW: public_key={master['reality_moscow']['public_key']}, shortId={master['reality_moscow']['short_id']}",
        f"- DIRECT MOSCOW: public_key={master['reality_direct_msk']['public_key']}, shortId={master['reality_direct_msk']['short_id']}",
        f"- {exit_host_remark}: public_key={exit_node['reality_public_key']}, shortId={exit_node['reality_short_id']}",
    ]
    if direct_exit:
        summary_client_lines.append(
            f"- {direct_exit_host_remark}: public_key={direct_exit['reality_public_key']}, shortId={direct_exit['reality_short_id']}"
        )

    summary_port_lines = [
        f"- {entry['host']}: {entry['public_port']}/tcp",
        f"- {master['host']}: {master['bridge_inbound_port']}/tcp, {master['reality_moscow']['port']}/tcp, {master['reality_direct_msk']['port']}/tcp, {master['wg_port']}/udp",
        f"- {exit_node['host']}: {exit_node['public_port']}/tcp, {exit_node['bridge_inbound_port']}/tcp",
    ]
    if direct_exit:
        summary_port_lines.append(f"- {direct_exit['host']}: {direct_exit['public_port']}/tcp")

    summary_lines = [
        "# Remnawave topology bootstrap",
        "",
        "## Mode",
        "",
        "- entry -> master -> exit + WireGuard",
        "- optional direct-only exit profile",
        "",
        "## Nodes",
        "",
        *summary_node_lines,
        "",
        "## Hosts",
        "",
        *summary_host_lines,
        "",
        "## Squads",
        "",
        "- Public Squad -> VLESS_TCP_REALITY, VLESS_REALITY_MOSCOW",
        "- Direct Exit Squad -> "
        + ", ".join(clean_list(["VLESS_REALITY_DIRECT_MSK", "VLESS_REALITY_DIRECT"] + (["VLESS_REALITY_DIRECT_EXIT"] if direct_exit else []))),
        "- Bridge Master Squad -> BRIDGE_MASTER_IN",
        "- Bridge Exit Squad -> BRIDGE_EXIT_IN",
        "",
        "## Client values",
        "",
        *summary_client_lines,
        "",
        "## Ports to open via Ansible",
        "",
        *summary_port_lines,
        "",
        "## Manual follow-up",
        "",
        "1. Import ENTRY_NODE, MASTER_NODE, EXIT_NODE"
        + (", DIRECT_EXIT" if direct_exit else "")
        + " into Remnawave Config Profiles.",
        "2. Bind profiles to nodes "
        + ", ".join(
            [entry["host"], master["host"], exit_node["host"]]
            + ([direct_exit["host"]] if direct_exit else [])
        )
        + ".",
        "3. Create hosts WHITE LIST, MOSCOW, DIRECT MOSCOW, "
        + exit_host_remark
        + (f", {direct_exit_host_remark}" if direct_exit else "")
        + ".",
        "4. Create/update Internal Squads: Public Squad, Direct Exit Squad, Bridge Master Squad, Bridge Exit Squad.",
        "5. Create/update service users bridge_entry_to_master and bridge_master_to_exit.",
        "6. Put regular users into Public Squad + Direct Exit Squad.",
        "7. Apply firewall/node changes:",
        "   - npm run ansible:run:check",
        "   - npm run ansible:run",
        "",
        "## Generated files",
        "",
        f"- {entry_profile_file}",
        f"- {master_profile_file}",
        f"- {exit_profile_file}",
        *([f"- {direct_exit_profile_file}"] if direct_exit and direct_exit_profile_file else []),
        f"- {topology_vars_file}",
    ]
    summary_file.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
