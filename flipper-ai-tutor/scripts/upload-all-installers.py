#!/usr/bin/env python3
"""Upload all platform installers from manifest to dgt-server and register releases."""
import json
import os
import sys
from pathlib import Path

import paramiko
import requests

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / ".github" / "downloads-manifest.json"
INSTALLERS = Path(
    os.environ.get(
        "DGT_INSTALLERS_DIR",
        Path.home() / "Desktop" / "Dolphin-Gang-Tour-Installers",
    )
)

HOST = os.environ.get("DGT_SSH_HOST", "106.15.105.100")
USER = os.environ.get("DGT_SSH_USER", "root")
PASSWORD = os.environ.get("DGT_SSH_PASSWORD", "Han0120506")
PORT = int(os.environ.get("DGT_SSH_PORT", "22"))
REMOTE_DIR = "/opt/dgt-server/releases"
PUBLIC_BASE = os.environ.get("DGT_PUBLIC_BASE", f"http://{HOST}:3920")


def main():
    if not MANIFEST.is_file():
        print(f"ERROR: manifest not found: {MANIFEST}")
        sys.exit(1)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting {USER}@{HOST}:{PORT}...")
    client.connect(
        HOST,
        port=PORT,
        username=USER,
        password=PASSWORD,
        timeout=30,
        banner_timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    client.exec_command(f"mkdir -p {REMOTE_DIR}")[1].read()
    sftp = client.open_sftp()

    uploaded = 0
    for rel in manifest["releases"]:
        version = rel["version"]
        for asset in rel["assets"]:
            fn = asset["filename"]
            local = INSTALLERS / fn
            if not local.is_file():
                print(f"SKIP (missing): {fn}")
                continue
            remote_path = f"{REMOTE_DIR}/{fn}"
            size_mb = local.stat().st_size / (1024 * 1024)
            print(f"Upload {fn} ({size_mb:.2f} MB) -> {remote_path}")
            sftp.put(str(local), remote_path)
            uploaded += 1

    sftp.close()

    _, stdout, _ = client.exec_command("grep '^ADMIN_TOKEN=' /opt/dgt-server/.env | cut -d= -f2-")
    token = stdout.read().decode().strip()
    client.close()

    if not token:
        print(f"Uploaded {uploaded} files. WARN: no ADMIN_TOKEN — DB not updated.")
        sys.exit(0)

    registered = 0
    for rel in manifest["releases"]:
        version = rel["version"]
        for asset in rel["assets"]:
            fn = asset["filename"]
            if not (INSTALLERS / fn).is_file():
                continue
            download_url = f"{PUBLIC_BASE}/releases/{fn}"
            notes = asset.get("notes") or asset.get("format", "")
            r = requests.post(
                f"{PUBLIC_BASE}/api/v1/admin/releases",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "version": version,
                    "platform": asset["platform"],
                    "downloadUrl": download_url,
                    "notes": notes,
                    "enabled": True,
                },
                timeout=30,
            )
            print(f"Register {version} / {asset['platform']}: {r.status_code}")
            if r.status_code < 400:
                registered += 1

    print(f"\n=== Done: {uploaded} uploaded, {registered} registered ===")
    print(f"Download page: {PUBLIC_BASE}/download")


if __name__ == "__main__":
    main()
