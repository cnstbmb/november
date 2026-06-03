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


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


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


def block_rule_domains(domains):
    return {"type": "field", "domain": domains, "outboundTag": "BLOCK"}


def block_rule_ip(ip_entries):
    return {"type": "field", "ip": ip_entries, "outboundTag": "BLOCK"}


def block_rule_ports(ports, network="TCP,UDP"):
    return {
        "type": "field",
        "network": network,
        "port": ",".join(str(value) for value in ports),
        "outboundTag": "BLOCK",
    }


def dns_rule():
    return {"port": "53", "type": "field", "network": "TCP,UDP", "outboundTag": "DNS_OUT"}


def enabled_block(value):
    return bool(value and value.get("enabled", True))


def public_client_enabled(value):
    return bool(value and value.get("client_public_enabled", True))


def build_entry_inbound(entry):
    inbound = {
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
    }

    if entry.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls"):
        cert_domain = entry.get("client_cert_domain", entry["host"])
        inbound["port"] = int(entry.get("client_backend_port", entry["public_port"]))
        inbound["listen"] = entry.get("client_backend_listen", "0.0.0.0")
        xhttp_settings = {
            "host": entry.get("client_host", entry["host"]),
            "mode": entry.get("client_mode", "stream-one"),
            "path": entry["client_path"],
            "scMaxBufferedPosts": 30,
            "scMaxEachPostBytes": "1000000",
            "scStreamUpServerSecs": "20-80",
        }
        if entry.get("client_transport") == "xhttp_nginx_tls":
            inbound["streamSettings"] = {
                "network": "xhttp",
                "security": "none",
                "xhttpSettings": xhttp_settings,
            }
            return inbound

        inbound["streamSettings"] = {
            "network": "xhttp",
            "security": "tls",
            "tlsSettings": {
                "alpn": entry.get("client_alpn", ["h2", "http/1.1"]),
                "minVersion": "1.2",
                "maxVersion": "1.3",
                "serverName": cert_domain,
                "certificates": [
                    {
                        "usage": "encipherment",
                        "certificateFile": f"/etc/letsencrypt/live/{cert_domain}/fullchain.pem",
                        "keyFile": f"/etc/letsencrypt/live/{cert_domain}/privkey.pem",
                    }
                ],
            },
            "xhttpSettings": xhttp_settings,
        }
        return inbound

    inbound["streamSettings"] = {
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
    }
    return inbound


def build_direct_client_inbound(node, tag):
    inbound = {
        "tag": tag,
        "port": int(node["public_port"]),
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
    }

    if node.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls"):
        cert_domain = node.get("client_cert_domain", node["cert_domain"])
        inbound["port"] = int(node.get("client_backend_port", node["public_port"]))
        inbound["listen"] = node.get("client_backend_listen", "0.0.0.0")
        xhttp_settings = {
            "host": node.get("client_host", node["cert_domain"]),
            "mode": node.get("client_mode", "stream-one"),
            "path": node["client_path"],
            "scMaxBufferedPosts": 30,
            "scMaxEachPostBytes": "1000000",
            "scStreamUpServerSecs": "20-80",
        }
        if node.get("client_transport") == "xhttp_nginx_tls":
            inbound["streamSettings"] = {
                "network": "xhttp",
                "security": "none",
                "xhttpSettings": xhttp_settings,
            }
            return inbound

        inbound["streamSettings"] = {
            "network": "xhttp",
            "security": "tls",
            "tlsSettings": {
                "alpn": node.get("client_alpn", ["h2", "http/1.1"]),
                "minVersion": "1.2",
                "maxVersion": "1.3",
                "serverName": cert_domain,
                "certificates": [
                    {
                        "usage": "encipherment",
                        "certificateFile": f"/etc/letsencrypt/live/{cert_domain}/fullchain.pem",
                        "keyFile": f"/etc/letsencrypt/live/{cert_domain}/privkey.pem",
                    }
                ],
            },
            "xhttpSettings": xhttp_settings,
        }
        return inbound

    inbound["streamSettings"] = {
        "network": "tcp",
        "security": "reality",
        "tcpSettings": {
            "header": {"type": "none"},
            "acceptProxyProtocol": False,
        },
        "realitySettings": {
            "show": False,
            "xver": 0,
            "target": node["reality_target"],
            "shortIds": [node["reality_short_id"]],
            "privateKey": node["reality_private_key"],
            "serverNames": node["reality_server_names"],
        },
    }
    return inbound


def build_entry_profile(entry, master):
    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": [build_entry_inbound(entry)],
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


def build_master_profile(master, exit_node, home_exit=None):
    xhttp_moscow = master.get("xhttp_moscow") if enabled_block(master.get("xhttp_moscow")) else None
    direct_msk = master.get("reality_direct_msk") if enabled_block(master.get("reality_direct_msk")) else None
    wg_peers = [
        {
            "publicKey": item["public_key"],
            "allowedIPs": [item["allowed_ip"]],
        }
        for item in master.get("wg_peers", [])
    ]
    wg_enabled = bool(master.get("wg_port") and master.get("wg_secret_key") and wg_peers)
    moscow_client_inbounds = ["VLESS_REALITY_MOSCOW", "BRIDGE_MASTER_IN"]
    if direct_msk:
        moscow_client_inbounds.append("VLESS_REALITY_DIRECT_MSK")
    if xhttp_moscow:
        moscow_client_inbounds.append(xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW"))

    route_rules = [
        dns_rule(),
        block_rule_bittorrent(),
        block_rule_private(),
    ]

    block_ip_entries = clean_list(master.get("block_ip_cidrs", []))
    if block_ip_entries:
        route_rules.append(block_rule_ip(block_ip_entries))

    block_geosite_entries = [f"geosite:{value}" for value in clean_list(master.get("block_geosite", []))]
    if block_geosite_entries:
        route_rules.append(block_rule_domains(block_geosite_entries))

    block_domain_entries = clean_list(master.get("block_domains", []))
    if block_domain_entries:
        route_rules.append(block_rule_domains(block_domain_entries))

    block_port_entries = clean_list(master.get("block_ports", []))
    if block_port_entries:
        route_rules.append(block_rule_ports(block_port_entries))

    self_tcp_ports = clean_list(master.get("block_self_tcp_ports", []))
    for port in self_tcp_ports:
        route_rules.append(
            {
                "type": "field",
                "ip": [master["public_address"]],
                "port": str(port),
                "inboundTag": moscow_client_inbounds,
                "outboundTag": "BLOCK",
            }
        )
        route_rules.append(
            {
                "type": "field",
                "domain": [f"domain:{master['host']}"],
                "port": str(port),
                "inboundTag": moscow_client_inbounds,
                "outboundTag": "BLOCK",
            }
        )

    for code in clean_list(master.get("route_moscow_ipv4_geoip", [])):
        route_rules.append(
            {
                "ip": [f"geoip:{code}"],
                "type": "field",
                "inboundTag": moscow_client_inbounds,
                "outboundTag": "IPv4",
            }
        )

    for selector in clean_list(master.get("route_moscow_ipv4_geosite", [])):
        route_rules.append(
            {
                "type": "field",
                "domain": [f"geosite:{selector}"],
                "inboundTag": moscow_client_inbounds,
                "outboundTag": "IPv4",
            }
        )

    for cidr in clean_list(master.get("route_home_ip_cidrs", [])):
        if home_exit:
            route_rules.append({"ip": [cidr], "type": "field", "balancerTag": "HOME_OR_MOSCOW"})

    for code in clean_list(master.get("route_home_geoip", [])):
        if home_exit:
            route_rules.append({"ip": [f"geoip:{code}"], "type": "field", "balancerTag": "HOME_OR_MOSCOW"})

    for selector in clean_list(master.get("route_home_geosite", [])):
        if home_exit:
            route_rules.append({"type": "field", "domain": [f"geosite:{selector}"], "balancerTag": "HOME_OR_MOSCOW"})

    for cidr in clean_list(master.get("route_ipv4_ip_cidrs", [])):
        route_rules.append({"ip": [cidr], "type": "field", "outboundTag": "IPv4"})

    for code in clean_list(master.get("route_ipv4_geoip", [])):
        route_rules.append({"ip": [f"geoip:{code}"], "type": "field", "outboundTag": "IPv4"})

    for selector in clean_list(master.get("route_ipv4_geosite", [])):
        route_rules.append({"type": "field", "domain": [f"geosite:{selector}"], "outboundTag": "IPv4"})

    route_rules.append(
        {
            "type": "field",
            "inboundTag": ["BRIDGE_MASTER_IN"],
            "outboundTag": "GRPC_TO_EXIT",
        }
    )
    if wg_enabled:
        route_rules.append(
            {
                "type": "field",
                "inboundTag": ["WG_KEENETIC_IN"],
                "outboundTag": "GRPC_TO_EXIT",
            }
        )
    route_rules.extend(
        [
            {
                "type": "field",
                "inboundTag": ["VLESS_REALITY_MOSCOW"],
                "outboundTag": "GRPC_TO_EXIT",
            },
        ]
    )
    if direct_msk:
        route_rules.append(
            {
                "type": "field",
                "inboundTag": ["VLESS_REALITY_DIRECT_MSK"],
                "outboundTag": "IPv4",
            }
        )
    if xhttp_moscow:
        route_rules.append(
            {
                "type": "field",
                "inboundTag": [xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW")],
                "outboundTag": xhttp_moscow.get("outbound", "GRPC_TO_EXIT"),
            }
        )

    inbounds = [
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
                "routeOnly": True,
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
        }
    ]

    if wg_enabled:
        inbounds.append(
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
            }
        )

    inbounds.append(
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
                "routeOnly": True,
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
                    "shortIds": [master["reality_moscow"]["short_id"]],
                    "privateKey": master["reality_moscow"]["private_key"],
                    "serverNames": master["reality_moscow"]["server_names"],
                },
            },
        }
    )
    if direct_msk:
        inbounds.append(
            {
                "tag": "VLESS_REALITY_DIRECT_MSK",
                "port": int(direct_msk["port"]),
                "listen": "0.0.0.0",
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": True,
                    "destOverride": ["http", "tls", "quic"],
                    "metadataOnly": False,
                },
                "streamSettings": {
                    "network": "raw",
                    "security": "reality",
                    "realitySettings": {
                        "show": False,
                        "xver": 0,
                        "target": direct_msk["target"],
                        "shortIds": [direct_msk["short_id"]],
                        "privateKey": direct_msk["private_key"],
                        "serverNames": direct_msk["server_names"],
                    },
                },
            }
        )
    if xhttp_moscow:
        inbounds.append(
            {
                "tag": xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW"),
                "port": int(xhttp_moscow["port"]),
                "listen": xhttp_moscow.get("listen", "127.0.0.1"),
                "protocol": "vless",
                "settings": {
                    "clients": [],
                    "decryption": "none",
                },
                "sniffing": {
                    "enabled": True,
                    "routeOnly": True,
                    "destOverride": ["http", "tls", "quic"],
                    "metadataOnly": False,
                },
                "streamSettings": {
                    "network": "xhttp",
                    "security": xhttp_moscow.get("security", "none"),
                    "xhttpSettings": {
                        "host": xhttp_moscow["host"],
                        "mode": xhttp_moscow.get("mode", "stream-one"),
                        "path": xhttp_moscow["path"],
                        "scMaxBufferedPosts": 30,
                        "scMaxEachPostBytes": "1000000",
                        "scStreamUpServerSecs": "20-80",
                    },
                },
            }
        )
        if xhttp_moscow.get("security") == "tls":
            inbounds[-1]["streamSettings"]["tlsSettings"] = {
                "alpn": xhttp_moscow.get("alpn", ["h2", "http/1.1"]),
                "maxVersion": "1.3",
                "minVersion": "1.2",
                "serverName": xhttp_moscow["host"],
                "certificates": [
                    {
                        "usage": "encipherment",
                        "keyFile": f"/etc/letsencrypt/live/{master['cert_domain']}/privkey.pem",
                        "certificateFile": f"/etc/letsencrypt/live/{master['cert_domain']}/fullchain.pem",
                    }
                ],
            }
        elif xhttp_moscow.get("security") != "none":
            raise SystemExit(
                "master.xhttp_moscow.security must be either 'none' for nginx-terminated canary "
                "or 'tls' for direct-to-Xray canary"
            )

    outbounds = [
        {
            "tag": "DIRECT",
            "protocol": "freedom",
            "settings": {
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
            "tag": "BLOCK",
            "protocol": "blackhole",
            "settings": {"response": {"type": "http"}},
        },
        {
            "tag": "IPv4",
            "protocol": "freedom",
            "settings": {
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
    ]

    if home_exit:
        outbounds.append(
            {
                "tag": "GRPC_TO_HOME_RU",
                "protocol": "vless",
                "settings": {
                    "vnext": [
                        {
                            "port": int(master["to_home_ru_port"]),
                            "users": [
                                {
                                    "id": master["to_home_ru_uuid"],
                                    "encryption": "none",
                                }
                            ],
                            "address": master["to_home_ru_address"],
                        }
                    ]
                },
                "streamSettings": {
                    "network": "grpc",
                    "security": "tls",
                    "tlsSettings": {
                        "alpn": ["h2"],
                        "serverName": master["to_home_ru_server_name"],
                        "fingerprint": "chrome",
                        "allowInsecure": False,
                    },
                    "grpcSettings": {
                        "multiMode": False,
                        "serviceName": "",
                    },
                },
            }
        )

    outbounds.extend(
        [
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
                        "alpn": ["h2"],
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
        ]
    )

    routing = {
        "rules": route_rules,
        "domainStrategy": "IPIfNonMatch" if home_exit else "AsIs",
    }

    if home_exit:
        routing["balancers"] = [
            {
                "tag": "HOME_OR_MOSCOW",
                "selector": ["GRPC_TO_HOME_RU"],
                "fallbackTag": "IPv4",
            }
        ]

    profile = {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": inbounds,
        "outbounds": outbounds,
        "routing": routing,
    }

    if home_exit:
        profile["observatory"] = {
            "probeUrl": master.get("to_home_ru_probe_url", "https://connectivitycheck.gstatic.com/generate_204"),
            "probeInterval": "15s",
            "subjectSelector": ["GRPC_TO_HOME_RU"],
            "enableConcurrency": False,
        }

    return profile


def build_exit_profile(exit_node):
    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": [
            build_direct_client_inbound(exit_node, "VLESS_REALITY_DIRECT"),
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


def build_home_exit_profile(home_exit):
    public_client = public_client_enabled(home_exit)
    inbounds = []
    if public_client:
        inbounds.append(build_direct_client_inbound(home_exit, "VLESS_HOME_REALITY_DIRECT"))
    inbounds.append(
        {
            "tag": "BRIDGE_HOME_RU_IN",
            "port": int(home_exit["bridge_inbound_port"]),
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
                    "serverName": home_exit["cert_domain"],
                    "certificates": [
                        {
                            "usage": "encipherment",
                            "keyFile": f"/etc/letsencrypt/live/{home_exit['cert_domain']}/privkey.pem",
                            "certificateFile": f"/etc/letsencrypt/live/{home_exit['cert_domain']}/fullchain.pem",
                        }
                    ],
                },
                "grpcSettings": {
                    "multiMode": False,
                    "serviceName": "",
                },
            },
        }
    )

    route_rules = [
        dns_rule(),
        block_rule_bittorrent(),
        block_rule_private(),
        {
            "type": "field",
            "inboundTag": ["BRIDGE_HOME_RU_IN"],
            "outboundTag": "IPv4",
        },
    ]
    if public_client:
        route_rules.append(
            {
                "type": "field",
                "inboundTag": ["VLESS_HOME_REALITY_DIRECT"],
                "outboundTag": "IPv4",
            }
        )

    return {
        "log": base_log(),
        "dns": dns_config(),
        "inbounds": inbounds,
        "outbounds": [
            {
                "tag": "DIRECT",
                "protocol": "freedom",
                "settings": {
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
            "rules": route_rules,
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
    home_exit = spec.get("home_exit")
    direct_exit = spec.get("direct_exit")
    xhttp_moscow = master.get("xhttp_moscow") if enabled_block(master.get("xhttp_moscow")) else None
    direct_msk = master.get("reality_direct_msk") if enabled_block(master.get("reality_direct_msk")) else None
    home_exit_public = public_client_enabled(home_exit)
    entry_host_remark = entry.get("host_remark") or "WHITE LIST"
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
            "roles": ["transit", "direct"] + (["wireguard"] if master.get("wg_port") else []),
            "tcp_ports": clean_list(
                [
                    int(master["bridge_inbound_port"]),
                    int(master["reality_moscow"]["port"]),
                    int(direct_msk["port"]) if direct_msk else None,
                ]
            ),
            "udp_ports": [int(master["wg_port"])] if master.get("wg_port") else [],
        },
        exit_node["host"]: {
            "roles": ["exit", "direct"],
            "tcp_ports": [int(exit_node["public_port"]), int(exit_node["bridge_inbound_port"])],
            "udp_ports": [],
        },
    }
    if home_exit:
        host_ports[home_exit["host"]] = {
            "roles": ["home_exit"],
            "tcp_ports": clean_list(
                [
                    int(home_exit["public_port"]) if home_exit_public else None,
                    int(home_exit["bridge_inbound_port"]),
                ]
            ),
            "udp_ports": [],
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
    home_exit_profile_file = (
        profiles_dir / f"04-home-exit-{home_exit['host']}.profile.json" if home_exit else None
    )
    direct_exit_profile_file = (
        profiles_dir / f"05-direct-exit-{direct_exit['host']}.profile.json" if direct_exit else None
    )

    write_json(entry_profile_file, build_entry_profile(entry, master))
    write_json(master_profile_file, build_master_profile(master, exit_node, home_exit))
    write_json(exit_profile_file, build_exit_profile(exit_node))
    if home_exit and home_exit_profile_file:
        write_json(home_exit_profile_file, build_home_exit_profile(home_exit))
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
        if host == entry["host"] and entry.get("client_transport") == "xhttp_nginx_tls":
            host_data.update(
                {
                    "worker_landing_http_bind": "0.0.0.0",
                    "worker_landing_http_port": 80,
                    "worker_landing_https_bind": "0.0.0.0",
                    "worker_landing_https_port": 443,
                    "worker_landing_network_mode_host": True,
                    "worker_landing_xhttp_proxy_locations": [
                        {
                            "path": entry["client_path"],
                            "upstream": f"{entry.get('client_backend_listen', '127.0.0.1')}:{int(entry['client_backend_port'])}",
                        }
                    ],
                }
            )
        if host == exit_node["host"] and exit_node.get("client_transport") == "xhttp_nginx_tls":
            host_data.update(
                {
                    "worker_landing_http_bind": "0.0.0.0",
                    "worker_landing_http_port": 80,
                    "worker_landing_https_bind": "0.0.0.0",
                    "worker_landing_https_port": 443,
                    "worker_landing_network_mode_host": True,
                    "worker_landing_xhttp_proxy_locations": [
                        {
                            "path": exit_node["client_path"],
                            "upstream": f"{exit_node.get('client_backend_listen', '127.0.0.1')}:{int(exit_node['client_backend_port'])}",
                        }
                    ],
                }
            )
        if home_exit_public and host == home_exit["host"] and home_exit.get("client_transport") == "xhttp_nginx_tls":
            host_data.update(
                {
                    "worker_landing_http_bind": "0.0.0.0",
                    "worker_landing_http_port": 80,
                    "worker_landing_https_bind": "0.0.0.0",
                    "worker_landing_https_port": 443,
                    "worker_landing_network_mode_host": True,
                    "worker_landing_xhttp_proxy_locations": [
                        {
                            "path": home_exit["client_path"],
                            "upstream": f"{home_exit.get('client_backend_listen', '127.0.0.1')}:{int(home_exit['client_backend_port'])}",
                        }
                    ],
                }
            )
        host_file.write_text(emit_yaml(host_data) + "\n", encoding="utf-8")

    entry_xhttp_client = entry.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls")
    entry_host_data = {
        "remark": entry_host_remark,
        "profile": "ENTRY_NODE",
        "inbound": "VLESS_TCP_REALITY",
        "address": entry.get("client_public_address", entry["public_address"]),
        "port": int(entry["public_port"]),
        "node": entry["host"],
    }
    entry_client_values = (
        {
            "host": entry_host_remark,
            "network": "xhttp",
            "security": "tls",
            "server_names": [entry.get("client_host", entry["host"])],
            "path": entry["client_path"],
        }
        if entry_xhttp_client
        else {
            "host": entry_host_remark,
            "public_key": entry["reality_public_key"],
            "short_id": entry["reality_short_id"],
            "server_names": [entry["reality_server_name"]],
            "path": "",
        }
    )
    exit_xhttp_client = exit_node.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls")
    exit_host_data = {
        "remark": exit_host_remark,
        "profile": "EXIT_NODE",
        "inbound": "VLESS_REALITY_DIRECT",
        "address": exit_node.get("client_public_address", exit_node["public_address"]),
        "port": int(exit_node["public_port"]),
        "node": exit_node["host"],
    }
    exit_client_values = (
        {
            "host": exit_host_remark,
            "network": "xhttp",
            "security": "tls",
            "server_names": [exit_node.get("client_host", exit_node["cert_domain"])],
            "path": exit_node["client_path"],
        }
        if exit_xhttp_client
        else {
            "host": exit_host_remark,
            "public_key": exit_node["reality_public_key"],
            "short_id": exit_node["reality_short_id"],
            "server_names": exit_node["reality_server_names"],
            "path": "",
        }
    )
    home_exit_host_remark = "HOME" if home_exit else None
    home_exit_xhttp_client = bool(
        home_exit_public and home_exit and home_exit.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls")
    )
    home_exit_host_data = (
        {
            "remark": home_exit_host_remark,
            "profile": "HOME_EXIT_NODE",
            "inbound": "VLESS_HOME_REALITY_DIRECT",
            "address": home_exit.get("client_public_address", home_exit["public_address"]),
            "port": int(home_exit["public_port"]),
            "node": home_exit["host"],
        }
        if home_exit_public
        else None
    )
    home_exit_client_values = (
        {
            "host": home_exit_host_remark,
            "network": "xhttp",
            "security": "tls",
            "server_names": [home_exit.get("client_host", home_exit["cert_domain"])],
            "path": home_exit["client_path"],
        }
        if home_exit_xhttp_client
        else (
            {
                "host": home_exit_host_remark,
                "public_key": home_exit["reality_public_key"],
                "short_id": home_exit["reality_short_id"],
                "server_names": home_exit["reality_server_names"],
                "path": "",
            }
            if home_exit_public
            else None
        )
    )

    xhttp_moscow_replaces_reality = bool(
        xhttp_moscow and xhttp_moscow.get("replace_reality_moscow")
    )
    moscow_host_data = (
        {
            "remark": xhttp_moscow.get("remark", "MOSCOW"),
            "profile": "MASTER_NODE",
            "inbound": xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW"),
            "address": xhttp_moscow.get("public_address", master["host"]),
            "port": int(xhttp_moscow.get("public_port", 443)),
            "node": master["host"],
        }
        if xhttp_moscow_replaces_reality
        else {
            "remark": "MOSCOW",
            "profile": "MASTER_NODE",
            "inbound": "VLESS_REALITY_MOSCOW",
            "address": master["reality_moscow"].get("public_address", master["public_address"]),
            "port": int(master["reality_moscow"].get("public_port", master["reality_moscow"]["port"])),
            "node": master["host"],
        }
    )
    moscow_client_values = (
        {
            "host": xhttp_moscow.get("remark", "MOSCOW"),
            "network": "xhttp",
            "security": xhttp_moscow.get("security", "tls"),
            "server_names": [xhttp_moscow["host"]],
            "path": xhttp_moscow["path"],
        }
        if xhttp_moscow_replaces_reality
        else {
            "host": "MOSCOW",
            "public_key": master["reality_moscow"]["public_key"],
            "short_id": master["reality_moscow"]["short_id"],
            "server_names": master["reality_moscow"]["server_names"],
            "path": "",
        }
    )
    public_squad_inbounds = [
        "VLESS_TCP_REALITY",
        (
            xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW")
            if xhttp_moscow_replaces_reality
            else "VLESS_REALITY_MOSCOW"
        ),
    ]

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
        "hosts": clean_list(
            [
                entry_host_data,
                moscow_host_data,
                (
                    {
                        "remark": "DIRECT MOSCOW",
                        "profile": "MASTER_NODE",
                        "inbound": "VLESS_REALITY_DIRECT_MSK",
                        "address": master["public_address"],
                        "port": int(direct_msk["port"]),
                        "node": master["host"],
                    }
                    if direct_msk
                    else None
                ),
                exit_host_data,
            ]
        ),
        "squads": [
            {"name": "Public Squad", "inbounds": public_squad_inbounds},
            {
                "name": "Direct Exit Squad",
                "inbounds": clean_list(
                    [
                        "VLESS_REALITY_DIRECT_MSK" if direct_msk else None,
                        "VLESS_REALITY_DIRECT",
                    ]
                    + (["VLESS_REALITY_DIRECT_EXIT"] if direct_exit else [])
                ),
            },
            {"name": "Bridge Master Squad", "inbounds": ["BRIDGE_MASTER_IN"]},
            {
                "name": "Bridge Exit Squad",
                "inbounds": clean_list(["BRIDGE_EXIT_IN"] + (["BRIDGE_HOME_RU_IN"] if home_exit else [])),
            },
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
        "master_routing": {
            "route_ipv4_geoip": clean_list(master.get("route_ipv4_geoip", [])),
            "route_ipv4_geosite": clean_list(master.get("route_ipv4_geosite", [])),
            "block_ip_cidrs": clean_list(master.get("block_ip_cidrs", [])),
            "block_geosite": clean_list(master.get("block_geosite", [])),
            "block_domains": clean_list(master.get("block_domains", [])),
            "block_ports": clean_list(master.get("block_ports", [])),
        },
        "client_values": clean_list(
            [
                entry_client_values,
                moscow_client_values,
                (
                    {
                        "host": "DIRECT MOSCOW",
                        "public_key": direct_msk["public_key"],
                        "short_id": direct_msk["short_id"],
                        "server_names": direct_msk["server_names"],
                        "path": "",
                    }
                    if direct_msk
                    else None
                ),
                exit_client_values,
            ]
        ),
    }
    if home_exit_public:
        topology_data["hosts"].append(home_exit_host_data)
        topology_data["squads"][1]["inbounds"].append("VLESS_HOME_REALITY_DIRECT")
        topology_data["client_values"].append(home_exit_client_values)
    if xhttp_moscow and not xhttp_moscow_replaces_reality:
        topology_data["hosts"].insert(
            2,
            {
                "remark": xhttp_moscow.get("remark", "MOSCOW XHTTP"),
                "profile": "MASTER_NODE",
                "inbound": xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW"),
                "address": xhttp_moscow.get("public_address", master["host"]),
                "port": int(xhttp_moscow.get("public_port", 443)),
                "node": master["host"],
            },
        )
        topology_data["squads"].append(
            {
                "name": xhttp_moscow.get("squad", "XHTTP Canary Squad"),
                "inbounds": [xhttp_moscow.get("tag", "VLESS_XHTTP_MOSCOW")],
            }
        )
        topology_data["client_values"].insert(
            2,
            {
                "host": xhttp_moscow.get("remark", "MOSCOW XHTTP"),
                "network": "xhttp",
                "security": xhttp_moscow.get("security", "tls"),
                "server_names": [xhttp_moscow["host"]],
                "path": xhttp_moscow["path"],
            },
        )
    if home_exit:
        topology_data["nodes"].append(
            {
                "host": home_exit["host"],
                "profile": "HOME_EXIT_NODE",
                "public_address": home_exit["public_address"],
                "node_port": 2222,
            }
        )
        topology_data["system_users"].append(
            {
                "username": "bridge_master_to_home_ru",
                "internal_squads": ["Bridge Exit Squad"],
                "used_by": "MASTER_NODE -> GRPC_TO_HOME_RU",
                "service_uuid": master["to_home_ru_uuid"],
            }
        )
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
    if home_exit:
        summary_node_lines.append(
            f"- HOME_EXIT_NODE -> {home_exit['host']} ({home_exit['public_address']}:2222)"
        )
    if direct_exit:
        summary_node_lines.append(
            f"- DIRECT_EXIT -> {direct_exit['host']} ({direct_exit['public_address']}:2222)"
        )

    moscow_summary_host_line = (
        f"- {xhttp_moscow.get('remark', 'MOSCOW')} -> {xhttp_moscow.get('public_address', master['host'])}:{xhttp_moscow.get('public_port', 443)} ({master['host']})"
        if xhttp_moscow_replaces_reality
        else f"- MOSCOW -> {master['reality_moscow'].get('public_address', master['public_address'])}:{master['reality_moscow'].get('public_port', master['reality_moscow']['port'])} ({master['host']})"
    )
    summary_host_lines = [
        f"- {entry_host_remark} -> {entry['public_address']}:{entry['public_port']} ({entry['host']})",
        moscow_summary_host_line,
    ]
    if direct_msk:
        summary_host_lines.append(
            f"- DIRECT MOSCOW -> {master['public_address']}:{direct_msk['port']} ({master['host']})"
        )
    summary_host_lines.append(
        f"- {exit_host_remark} -> {exit_node['public_address']}:{exit_node['public_port']} ({exit_node['host']})"
    )
    if xhttp_moscow and not xhttp_moscow_replaces_reality:
        summary_host_lines.insert(
            2,
            f"- {xhttp_moscow.get('remark', 'MOSCOW XHTTP')} -> {xhttp_moscow.get('public_address', master['host'])}:{xhttp_moscow.get('public_port', 443)} ({master['host']})",
        )
    if direct_exit:
        summary_host_lines.append(
            f"- {direct_exit_host_remark} -> {direct_exit['public_address']}:{direct_exit['public_port']} ({direct_exit['host']})"
        )

    entry_summary_client_line = (
        f"- {entry_host_remark}: network=xhttp, sni={entry.get('client_host', entry['host'])}, path={entry['client_path']}"
        if entry.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls")
        else f"- {entry_host_remark}: public_key={entry['reality_public_key']}, shortId={entry['reality_short_id']}"
    )
    exit_summary_client_line = (
        f"- {exit_host_remark}: network=xhttp, sni={exit_node.get('client_host', exit_node['cert_domain'])}, path={exit_node['client_path']}"
        if exit_node.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls")
        else f"- {exit_host_remark}: public_key={exit_node['reality_public_key']}, shortId={exit_node['reality_short_id']}"
    )
    moscow_summary_client_line = (
        f"- {xhttp_moscow.get('remark', 'MOSCOW')}: network=xhttp, sni={xhttp_moscow['host']}, path={xhttp_moscow['path']}"
        if xhttp_moscow_replaces_reality
        else f"- MOSCOW: public_key={master['reality_moscow']['public_key']}, shortId={master['reality_moscow']['short_id']}"
    )
    summary_client_lines = [
        entry_summary_client_line,
        moscow_summary_client_line,
    ]
    if direct_msk:
        summary_client_lines.append(
            f"- DIRECT MOSCOW: public_key={direct_msk['public_key']}, shortId={direct_msk['short_id']}"
        )
    summary_client_lines.append(exit_summary_client_line)
    if home_exit_public:
        if home_exit.get("client_transport") in ("xhttp_tls", "xhttp_nginx_tls"):
            summary_client_lines.append(
                f"- HOME: network=xhttp, sni={home_exit.get('client_host', home_exit['cert_domain'])}, path={home_exit['client_path']}"
            )
        else:
            summary_client_lines.append(
                f"- HOME: public_key={home_exit['reality_public_key']}, shortId={home_exit['reality_short_id']}"
            )
    if xhttp_moscow and not xhttp_moscow_replaces_reality:
        summary_client_lines.insert(
            2,
            f"- {xhttp_moscow.get('remark', 'MOSCOW XHTTP')}: network=xhttp, sni={xhttp_moscow['host']}, path={xhttp_moscow['path']}",
        )
    if direct_exit:
        summary_client_lines.append(
            f"- {direct_exit_host_remark}: public_key={direct_exit['reality_public_key']}, shortId={direct_exit['reality_short_id']}"
        )

    summary_port_lines = [
        f"- {entry['host']}: {entry['public_port']}/tcp",
        f"- {master['host']}: "
        + ", ".join(
            clean_list(
                [
                    f"{master['bridge_inbound_port']}/tcp",
                    f"{master['reality_moscow']['port']}/tcp",
                    f"{direct_msk['port']}/tcp" if direct_msk else None,
                    f"{master['wg_port']}/udp" if master.get("wg_port") else None,
                ]
            )
        ),
        f"- {exit_node['host']}: {exit_node['public_port']}/tcp, {exit_node['bridge_inbound_port']}/tcp",
    ]
    if home_exit:
        home_ports = clean_list(
            [
                f"{home_exit['public_port']}/tcp" if home_exit_public else None,
                f"{home_exit['bridge_inbound_port']}/tcp",
            ]
        )
        summary_port_lines.append(
            f"- {home_exit['host']}: " + ", ".join(home_ports)
        )
    if direct_exit:
        summary_port_lines.append(f"- {direct_exit['host']}: {direct_exit['public_port']}/tcp")

    summary_public_squad = public_squad_inbounds
    summary_direct_exit_squad = clean_list(
        [
            "VLESS_REALITY_DIRECT_MSK" if direct_msk else None,
            "VLESS_REALITY_DIRECT",
        ]
        + (["VLESS_REALITY_DIRECT_EXIT"] if direct_exit else [])
    )
    manual_hosts = [entry_host_remark, "MOSCOW", exit_host_remark]
    if direct_msk:
        manual_hosts.insert(2, "DIRECT MOSCOW")
    if home_exit_public:
        manual_hosts.append("HOME")
    if direct_exit:
        manual_hosts.append(direct_exit_host_remark)

    summary_lines = [
        "# Remnawave topology bootstrap",
        "",
        "## Mode",
        "",
        "- entry -> master -> exit",
        "- optional hidden home-exit with master-side fallback",
        "- optional dedicated direct-only exit profile",
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
        "- Public Squad -> " + ", ".join(summary_public_squad),
        "- Direct Exit Squad -> " + ", ".join(summary_direct_exit_squad),
        "- Bridge Master Squad -> BRIDGE_MASTER_IN",
        "- Bridge Exit Squad -> "
        + ", ".join(clean_list(["BRIDGE_EXIT_IN"] + (["BRIDGE_HOME_RU_IN"] if home_exit else []))),
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
        + (", HOME_EXIT_NODE" if home_exit else "")
        + (", DIRECT_EXIT" if direct_exit else "")
        + " into Remnawave Config Profiles.",
        "2. Bind profiles to nodes "
        + ", ".join(
            [entry["host"], master["host"], exit_node["host"]]
            + ([home_exit["host"]] if home_exit else [])
            + ([direct_exit["host"]] if direct_exit else [])
        )
        + ".",
        "3. Create hosts " + ", ".join(manual_hosts) + ".",
        "4. Create/update Internal Squads: Public Squad, Direct Exit Squad, Bridge Master Squad, Bridge Exit Squad.",
        "5. Create/update service users bridge_entry_to_master, bridge_master_to_exit"
        + (", bridge_master_to_home_ru" if home_exit else "")
        + ".",
        "6. Put regular users into Public Squad + Direct Exit Squad.",
        "7. Apply firewall/node changes:",
        "   - npm run ansible:run:check",
        "   - npm run ansible:run",
        "",
        "## Generated files",
        "",
        f"- {display_path(entry_profile_file)}",
        f"- {display_path(master_profile_file)}",
        f"- {display_path(exit_profile_file)}",
        *([f"- {display_path(home_exit_profile_file)}"] if home_exit and home_exit_profile_file else []),
        *([f"- {display_path(direct_exit_profile_file)}"] if direct_exit and direct_exit_profile_file else []),
        f"- {display_path(topology_vars_file)}",
    ]
    summary_file.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
