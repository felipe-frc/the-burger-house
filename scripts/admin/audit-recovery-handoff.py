"""Offline, complete decoding/byte verification of the maintenance handoff."""
import base64
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / "test-results/azure-owner-recovery-private.sh"
raw = LAUNCHER.read_bytes()
text = raw.decode("utf-8")
assert b"\r" not in raw, "The SSH script must use LF line endings."
lines = text.splitlines()
payloads = []
commands = []
index = 0
allowed = {"RecoveryInspector.dll", "RecoveryInspector.runtimeconfig.json", "OwnerRecoveryHost.dll", "OwnerRecoveryHost.runtimeconfig.json"}
while index < len(lines):
    line = lines[index]
    block = re.fullmatch(r'''base64 --decode > "\$work/([A-Za-z.]+)" <<'([A-Za-z_]+)' ''', line + " ")
    if not block:
        commands.append(line)
        index += 1
        continue
    name, delimiter = block.groups()
    assert name in allowed
    commands.append(line)
    index += 1
    encoded = []
    while index < len(lines) and lines[index] != delimiter:
        encoded.append(lines[index])
        index += 1
    assert index < len(lines), "Truncated encoded payload."
    data = base64.b64decode("".join(encoded), validate=True)
    tool = name.split(".")[0]
    source = ROOT / "backend/artifacts/recovery-tools/bin" / tool / "debug" / name
    assert source.read_bytes() == data, "The embedded artifact differs from the locally built file."
    digest = hashlib.sha256(data).hexdigest()
    expected = lines[index + 1]
    assert expected == f'''printf '{digest}  %s\\n' "$work/{name}" | sha256sum -c -'''
    if name.endswith(".dll"):
        assert data[:2] == b"MZ", "Expected a managed PE DLL."
    else:
        config = json.loads(data)
        assert config["runtimeOptions"]["tfm"] == "net9.0"
        assert config["runtimeOptions"]["configProperties"]["System.Runtime.Serialization.EnableUnsafeBinaryFormatterSerialization"] is False
    payloads.append({"file": name, "bytes": len(data), "sha256": digest, "exactBuildMatch": True})
    index += 1
assert {p["file"] for p in payloads} == allowed
assert text.startswith("#!/usr/bin/env bash\nset -euo pipefail\numask 077\n")
assert '--inspect-only) mode="inspect"' in text
assert 'if [ "$mode" = "inspect" ]; then' in text and "exit 0; fi" in text
assert '--reset-owner-password < /dev/tty' in text
assert not re.search(r"(?m)^\s*(rm|kill|reboot|shutdown|curl|wget|scp|ssh|sqlite3)\b", text)
report = {"launcher": str(LAUNCHER), "launcherBytes": len(raw), "launcherSha256": hashlib.sha256(raw).hexdigest(),
          "payloads": payloads, "defaultMode": "inspect-only", "resetRequiresExplicitModeAndPrivateInput": True,
          "allNonEncodedLines": commands, "productionExecuted": False}
output = ROOT / "test-results/azure-owner-recovery-audit.json"
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k != "allNonEncodedLines"}, indent=2))
