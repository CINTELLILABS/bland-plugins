#!/usr/bin/env python3
"""Offline ZIP regression checks. Does not certify live/submission readiness."""

import json
import posixpath
import re
import struct
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "dev/scripts/build-chatgpt-zip.sh"


def build(output):
    result = subprocess.run(
        ["bash", str(BUILD), str(output)], check=True, capture_output=True, text=True
    )
    return Path(result.stdout.strip())


class ChatGPTPackageTest(unittest.TestCase):
    def test_package_is_self_contained_and_uses_oauth(self):
        local_mcp = (ROOT / ".codex-plugin/mcp.json").read_bytes()
        with tempfile.TemporaryDirectory(prefix="bland package ") as directory:
            with zipfile.ZipFile(build(directory)) as archive:
                self.assertIsNone(archive.testzip())
                files = {name for name in archive.namelist() if not name.endswith("/")}
                for name in files:
                    self.assertTrue(name.startswith("bland/"), name)
                    self.assertNotIn("..", name.split("/"))
                    self.assertIn(name.split("/")[1], {
                        ".codex-plugin", "skills", "assets", "README.md", "LICENSE"
                    })
                manifest = json.loads(archive.read("bland/.codex-plugin/plugin.json"))
                extension = manifest["extensions"]["com.openai"]
                interface = manifest["interface"]
                for reference in [manifest["mcpServers"], extension["onboardingSkill"],
                                  interface["composerIcon"], interface["logo"]]:
                    self.assertIn(posixpath.normpath("bland/" + reference), files)
                mcp = json.loads(archive.read("bland/.codex-plugin/mcp.json"))
                self.assertEqual(mcp, json.loads((ROOT / "dev/chatgpt/mcp.json").read_text()))
                server = mcp["mcpServers"]["bland"]
                self.assertEqual(server["oauth_resource"], server["url"])
                self.assertEqual(set(server), {"type", "url", "oauth_resource"})
                self.assertEqual(server["type"], "http")
                skills = {name.split("/")[2] for name in files if name.startswith("bland/skills/")}
                self.assertEqual(skills, {"setup", "agents", "calls", "analytics", "pathways", "evals", "docs"})
                for name in files:
                    if not name.endswith(".md"):
                        continue
                    content = archive.read(name).decode()
                    for forbidden in ["CLAUDE_PLUGIN_ROOT", "BLAND_API_KEY", "/bland:",
                                      "bland_api_get", "call_bland_api", "buy_credits"]:
                        self.assertNotIn(forbidden, content, name)
                    for target in re.findall(r"\]\(([^)]+)\)", content):
                        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) and not target.startswith("#"):
                            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target.split("#")[0]))
                            self.assertIn(resolved, files, f"Broken link in {name}: {target}")
                self.assertEqual(len(extension["review"]["test_cases"]["positive"]), 5)
                self.assertEqual(len(extension["review"]["test_cases"]["negative"]), 3)
                for case in extension["review"]["test_cases"]["positive"]:
                    self.assertIsInstance(case["tools_triggered"], str)
                    self.assertTrue(case["tools_triggered"].strip())
                    self.assertTrue(case["expected_behavior"].strip())
                self.assertIs(extension["review"]["commerce"], False)
                for field, limit in [("displayName", 30), ("shortDescription", 30),
                                     ("longDescription", 4000), ("developerName", 80)]:
                    self.assertLessEqual(len(interface[field]), limit, field)
                prompts = interface["defaultPrompt"]
                self.assertLessEqual(len(prompts), 3)
                self.assertEqual(len(prompts), len(set(prompts)))
                self.assertTrue(all(len(prompt) <= 128 for prompt in prompts))
                for field in ["composerIcon", "logo"]:
                    path = posixpath.normpath("bland/" + interface[field])
                    data = archive.read(path)
                    self.assertLessEqual(len(data), 5 * 1024 * 1024)
                    if path.endswith(".svg"):
                        icon = ET.fromstring(data)
                        width, height = int(icon.attrib["width"]), int(icon.attrib["height"])
                    else:
                        self.assertTrue(path.endswith(".png"))
                        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                        width, height = struct.unpack(">II", data[16:24])
                        self.assertLessEqual(width, 4096)
                    self.assertEqual(width, height)
                    self.assertGreaterEqual(width, 48)
        self.assertEqual((ROOT / ".codex-plugin/mcp.json").read_bytes(), local_mcp)

    def test_rebuild_preserves_other_files_and_removes_stale_archive_entries(self):
        with tempfile.TemporaryDirectory(prefix="bland rebuild ") as directory:
            output = Path(directory)
            sentinel = output / "keep.txt"
            sentinel.write_text("unrelated user file")
            archive_path = build(output)
            with zipfile.ZipFile(archive_path, "a") as archive:
                archive.writestr("bland/skills/removed/SKILL.md", "stale instructions")
            self.assertEqual(build(output), archive_path)
            self.assertEqual(sentinel.read_text(), "unrelated user file")
            with zipfile.ZipFile(archive_path) as archive:
                self.assertNotIn("bland/skills/removed/SKILL.md", archive.namelist())


if __name__ == "__main__":
    unittest.main()
