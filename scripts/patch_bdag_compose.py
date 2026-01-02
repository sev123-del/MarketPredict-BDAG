import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch_bdag_compose.py /path/to/docker-compose.yml")
        return 2

    raw = sys.argv[1]
    path = Path(raw).expanduser()
    try:
        path = path.resolve(strict=True)
    except FileNotFoundError:
        print("error: file not found:", raw)
        return 2

    if not path.is_file():
        print("error: path is not a file:", str(path))
        return 2

    if path.suffix.lower() not in {".yml", ".yaml"}:
        print("error: expected a .yml/.yaml file:", str(path))
        return 2

    original = path.read_text(encoding="utf-8")
    patched = original

    replacements = [
        ("container_name: blockdag-miner-testnet", "container_name: blockdag-miner-testnet-2"),
        ('"38131:38131"', '"38132:38131"'),
        ('"18545:18545"', '"18547:18545"'),
        ('"18546:18546"', '"18548:18546"'),
        ('"18150:18150"', '"18151:18150"'),
    ]

    for old, new in replacements:
        patched = patched.replace(old, new)

    if patched == original:
        print("No changes made (already patched or patterns not found).")
    else:
        path.write_text(patched, encoding="utf-8")
        print("Patched:", str(path))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
