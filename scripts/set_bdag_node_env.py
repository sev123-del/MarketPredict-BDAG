from __future__ import annotations

import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: set_bdag_node_env.py 0xYOUR_ADDRESS")
        return 2

    addr = sys.argv[1].strip()
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", addr):
        print("error: address must look like 0x + 40 hex chars")
        return 2

    base = Path("/home/rodsk/bdag")
    for node in ("node1", "node2"):
        node_dir = base / node
        example = node_dir / ".env.example"
        out = node_dir / ".env"

        if not example.exists():
            print(f"missing: {example}")
            return 1

        text = example.read_text(encoding="utf-8")
        lines = text.splitlines()
        new_lines: list[str] = []
        replaced = False

        for line in lines:
            if line.startswith("PUB_ETH_ADDR="):
                new_lines.append(f"PUB_ETH_ADDR={addr}")
                replaced = True
            else:
                new_lines.append(line)

        if not replaced:
            if new_lines and new_lines[-1].strip() != "":
                new_lines.append("")
            new_lines.append(f"PUB_ETH_ADDR={addr}")

        out.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        print(f"wrote: {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
