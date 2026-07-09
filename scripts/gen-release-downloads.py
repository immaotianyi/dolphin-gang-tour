#!/usr/bin/env python3
"""Generate cc-switch-style download tables from .github/downloads-manifest.json."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / ".github" / "downloads-manifest.json"
INSTALLERS = Path.home() / "Desktop" / "Dolphin-Gang-Tour-Installers"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def fmt_size(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    return f"{n / 1024:.0f} KB"


def gh_url(repo: str, tag: str, filename: str) -> str:
    return f"https://github.com/{repo}/releases/download/{tag}/{filename}"


def mirror_url(base: str, filename: str) -> str:
    return f"{base.rstrip('/')}/{filename}"


def asset_rows(manifest: dict, installers_dir: Path, lang: str = "zh") -> list[str]:
    repo = manifest["repo"]
    mirror = manifest.get("mirrorBase", "")
    lines: list[str] = []

    for rel in manifest["releases"]:
        tag = rel["tag"]
        label = rel.get("label", rel["version"])
        latest = rel.get("latest", False)
        badge = " **Latest**" if latest else ""
        lines.append(f"### Dolphin Gang Tour {label}{badge}")
        lines.append("")
        lines.append(f"发布日期 / Released: {rel.get('date', '—')}")
        lines.append("")
        lines.append("| 平台 Platform | 文件 File | 大小 Size | 下载 Download |")
        lines.append("|---------------|-----------|-----------|---------------|")

        for asset in rel["assets"]:
            fn = asset["filename"]
            plat = asset.get("labelZh" if lang == "zh" else "label", asset.get("label", ""))
            local = installers_dir / fn
            size = fmt_size(local.stat().st_size) if local.is_file() else "—"
            gh = gh_url(repo, tag, fn)
            if mirror:
                mir = mirror_url(mirror, fn)
                dl = f"[GitHub]({gh}) · [镜像]({mir})"
            else:
                dl = f"[GitHub]({gh})"
            lines.append(f"| {plat} | `{fn}` | {size} | {dl} |")

        lines.append("")
        for asset in rel["assets"]:
            fn = asset["filename"]
            local = installers_dir / fn
            if not local.is_file():
                continue
            digest = sha256_file(local)
            lines.append(f"<details><summary>SHA256 · `{fn}`</summary>")
            lines.append("")
            lines.append("```")
            lines.append(digest)
            lines.append("```")
            lines.append("")
            lines.append("</details>")
            lines.append("")

    return lines


def main():
    if not MANIFEST.is_file():
        print(f"Missing manifest: {MANIFEST}", file=sys.stderr)
        sys.exit(1)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    installers = Path(sys.argv[1]) if len(sys.argv) > 1 else INSTALLERS

    zh = asset_rows(manifest, installers, "zh")
    en = asset_rows(manifest, installers, "en")

    out_dir = ROOT / ".github" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "downloads-table-zh.md").write_text("\n".join(zh), encoding="utf-8")
    (out_dir / "downloads-table-en.md").write_text("\n".join(en), encoding="utf-8")
    print(f"Wrote {out_dir / 'downloads-table-zh.md'}")
    print(f"Wrote {out_dir / 'downloads-table-en.md'}")


if __name__ == "__main__":
    main()
