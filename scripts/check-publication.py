"""Check the actual Git index before publication. Never modifies Git or files."""
import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def forbidden_path(name, private_paths):
    path = pathlib.PurePosixPath(name)
    return (
        name in private_paths
        or any(part in {"node_modules", "bin", "obj", "dist", "backups",
                        ".test-tmp", "test-results", ".vercel"} for part in path.parts)
        or (path.name.startswith(".env") and path.name != ".env.example")
        or path.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".dump", ".pfx",
                                  ".p12", ".key", ".pem", ".dpapi", ".log", ".bak"}
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true",
                        help="Also block private paths present in accessible Git history.")
    args = parser.parse_args()
    policy = json.loads((ROOT / "publication-policy.json").read_text())
    private_paths = set(policy["privatePaths"])
    historical_exceptions = {
        (item["blob"], item["path"]): item["commit"]
        for item in policy.get("historicalSyntheticExceptions", [])
    }
    verified_exceptions = set()
    for (blob, path), commit in historical_exceptions.items():
        tree_row = git("ls-tree", commit, "--", path).decode().strip()
        if tree_row.startswith(f"100644 blob {blob}\t{path}"):
            verified_exceptions.add((blob, path))
    violations = []
    names = git("ls-files", "-z").decode().split("\0")
    for name in filter(None, names):
        if forbidden_path(name, private_paths):
            violations.append(("index private path", name))
            continue
        data = git("show", ":" + name)
        if name.startswith("docs/") and name.endswith(".md"):
            if re.search(rb"C:[/\\]Users[/\\](?!Public|example|<)", data):
                violations.append(("index personal workstation path", name))
            if re.search(rb"\b(?:CHAR|CHEC|ORDE|PAY|REFU)_[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\b", data):
                violations.append(("index operational payment identifier", name))
    if args.history:
        for row in git("rev-list", "--objects", "--all").decode().splitlines():
            parts = row.split(" ", 1)
            if (
                len(parts) == 2
                and forbidden_path(parts[1], private_paths)
                and (parts[0], parts[1]) not in verified_exceptions
            ):
                violations.append(("history private path requires review", parts[1]))
    for kind, path in sorted(set(violations)):
        print(f"{kind}: {path}")
    print(f"Reviewed {len(list(filter(None, names)))} index entries, {len(set(violations))} blockers.")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
