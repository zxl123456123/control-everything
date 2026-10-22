"""Exact source membership and reviewed asset bytes for the bundled workbench."""

import hashlib
import json
from pathlib import PurePosixPath
import re


UNIT = "web/workbench-engine/"
MANIFEST = "tools/packaging/workbench-engine-source.json"
EXCLUDED = {".git", ".github", ".husky", "node_modules", "out", ".build", ".cache",
            "__pycache__", "agents.md", "claude.md"}


class SourcePolicyError(ValueError):
    pass


def source_path(value):
    if not isinstance(value, str) or not value or any(c in value for c in "\\:*?"):
        raise SourcePolicyError("invalid-workbench-source-path")
    path = PurePosixPath(value)
    if (path.is_absolute() or path.as_posix() != value or ".." in path.parts
            or any(part.casefold() in EXCLUDED or part.endswith((" ", "."))
                   or any(ord(c) < 32 for c in part) for part in path.parts)):
        raise SourcePolicyError("invalid-workbench-source-path")
    return value


def digest(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
        raise SourcePolicyError("invalid-workbench-source-hash")
    return value


class SourcePolicy:
    def __init__(self, document, read_file):
        if (not isinstance(document, dict) or document.get("schema") != 1
                or document.get("unit") != UNIT.rstrip("/")):
            raise SourcePolicyError("invalid-workbench-source-manifest")
        self.read_file = read_file
        self.files = {}
        for entry in document.get("files", []):
            name = source_path(entry["path"])
            if name in self.files:
                raise SourcePolicyError("duplicate-workbench-source")
            self.files[name] = digest(entry["sha256"])
        if not self.files:
            raise SourcePolicyError("empty-workbench-source-manifest")
        self.members = set(self.files)
        for name in document.get("local_files", []):
            self.members.add(source_path(name))
        self.resources = {}
        for entry in document.get("resources", []):
            name = source_path(entry["path"])
            if name not in self.members or name in self.resources:
                raise SourcePolicyError("unregistered-workbench-resource")
            digest(entry["sha256"])
            notices = entry.get("license_paths")
            if (not isinstance(notices, list) or not notices
                    or any(source_path(notice) not in self.members for notice in notices)):
                raise SourcePolicyError("missing-workbench-resource-notice")
            self.resources[name] = entry
        for entry in document.get("adapted_files", []):
            name = source_path(entry["path"])
            if name not in self.files:
                raise SourcePolicyError("unregistered-workbench-adaptation")
            # Adaptations retain their upstream hash and pin the reviewed current bytes.
            if digest(entry["upstream_sha256"]) != self.files[name]:
                raise SourcePolicyError("workbench-adaptation-origin-mismatch")
            self.files[name] = digest(entry["current_sha256"])
        self.reviewed = {}
        for entry in document.get("reviewed_findings", []):
            name = source_path(entry["path"])
            rule, line = entry.get("rule"), entry.get("line")
            if (name not in self.files or not isinstance(rule, str)
                    or not re.fullmatch(r"[a-z][a-z0-9:-]+", rule)
                    or type(line) is not int or line < 1
                    or not isinstance(entry.get("reason"), str) or not entry["reason"].strip()):
                raise SourcePolicyError("invalid-workbench-reviewed-finding")
            key = (name, rule, line)
            if key in self.reviewed or digest(entry["sha256"]) != self.files[name]:
                raise SourcePolicyError("invalid-workbench-reviewed-finding-pin")
            self.reviewed[key] = entry

    def contains(self, value):
        return value.startswith(UNIT) and value[len(UNIT):] in self.members

    def resource(self, value):
        return self.resources.get(value[len(UNIT):]) if value.startswith(UNIT) else None

    def validate_resource(self, value, data):
        entry = self.resource(value)
        if entry is None or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise SourcePolicyError("workbench-resource-hash-mismatch")
        for notice in entry["license_paths"]:
            content = self.read_file(UNIT + notice)
            if (not content.strip() or b"\x00" in content
                    or notice in self.files and hashlib.sha256(content).hexdigest() != self.files[notice]):
                raise SourcePolicyError("workbench-resource-notice-mismatch")
            content.decode("utf-8-sig")

    def reviewed_finding(self, finding):
        value = finding.get("path", "")
        if not value.startswith(UNIT):
            return None
        entry = self.reviewed.get((value[len(UNIT):], finding.get("rule"), finding.get("line")))
        if entry is None:
            return None
        if hashlib.sha256(self.read_file(value)).hexdigest() != entry["sha256"]:
            return None
        return entry["reason"]


def load_policy(read_file):
    return SourcePolicy(json.loads(read_file(MANIFEST).decode("utf-8-sig")), read_file)
