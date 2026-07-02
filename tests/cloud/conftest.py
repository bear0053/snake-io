"""
Fixtures for the Firebase-emulator-backed cloud suite. Opt-in only (pytest --cloud) -
see the top-level tests/conftest.py and .claude/skills/run/SKILL.md.

These tests exercise the real Cloud Functions/Firestore/Auth logic via the Firebase Local
Emulator Suite - unlike the rest of tests/, which drives UI/gating state through the
window.__debug.setGuestOverride hook (see tests/helpers.py:set_authenticated) and never
touches the backend at all. Both are worth having: the debug-hook suite is fast and covers
UI/gating; this suite is slower but is the only place that proves auth, sessions, score
validation, and cloud persistence actually work end to end.
"""
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

# tests/helpers.py isn't necessarily on sys.path when pytest is invoked with
# `tests/cloud/` as the target (rather than `tests/`) - make sure it always is.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
CA_CERT_PATH = BACKEND_DIR / ".local-ca-cert.pem"

AUTH_PORT = 9099
FIRESTORE_PORT = 8080
FUNCTIONS_PORT = 5001


def _java_major_version(java_exe):
    try:
        out = subprocess.run([java_exe, "-version"], capture_output=True, text=True, timeout=5)
    except Exception:
        return None
    version_line = (out.stderr or out.stdout).splitlines()[0] if (out.stderr or out.stdout) else ""
    m = re.search(r'"(\d+)(?:\.\d+)*"', version_line)
    return int(m.group(1)) if m else None


def _find_java21_plus():
    """Checks `java` on PATH first, then common Eclipse Temurin install locations on
    Windows (where this project's JDK was installed - see backend/README.md)."""
    candidates = ["java"]
    adoptium_root = Path("C:/Program Files/Eclipse Adoptium")
    if adoptium_root.exists():
        for d in sorted(adoptium_root.iterdir(), reverse=True):
            exe = d / "bin" / "java.exe"
            if exe.exists():
                candidates.append(str(exe))
    for exe in candidates:
        major = _java_major_version(exe)
        if major and major >= 21:
            return exe
    return None


def _ensure_local_ca_cert():
    """Regenerates backend/.local-ca-cert.pem (gitignored, machine-local) from the
    Norton TLS-inspection proxy root CA if one is present - see backend/README.md's
    Gotchas section. No-ops (returns None) on a machine without that proxy; Firebase CLI
    calls just won't get NODE_EXTRA_CA_CERTS set, which is correct if it's not needed."""
    if CA_CERT_PATH.exists():
        return str(CA_CERT_PATH)
    ps_script = (
        "$cert = Get-ChildItem Cert:\\LocalMachine\\Root | "
        "Where-Object { $_.Subject -match 'Norton' } | Select-Object -First 1; "
        "if ($cert) { "
        "$pem = [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks'); "
        "\"-----BEGIN CERTIFICATE-----`n$pem`n-----END CERTIFICATE-----\" | "
        f"Out-File -Encoding ascii '{CA_CERT_PATH}' }}"
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, timeout=20)
    except Exception:
        return None
    return str(CA_CERT_PATH) if CA_CERT_PATH.exists() else None


def _kill_process_tree(proc):
    """proc was launched with shell=True, so proc.terminate()/kill() only touch the shell
    wrapper (cmd.exe), not the firebase/node/java descendants it actually spawned - use
    taskkill's /T (tree) on Windows so the emulators don't leak past the test session."""
    if sys.platform.startswith("win"):
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
    else:
        proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def _wait_for_port(port, host="localhost", timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
    return False


def _cors_preflight_ok(url, origin="http://localhost:8123"):
    """A plain GET/POST doesn't exercise CORS at all - only a browser's actual preflight
    OPTIONS request does. Send the same OPTIONS request a browser would and check the
    response genuinely carries Access-Control-Allow-Origin, rather than just "some HTTP
    response came back" (which a POST can satisfy well before OPTIONS handling has warmed
    up - observed directly: identical OPTIONS preflights fail right after the emulator
    starts, then succeed a few seconds later with no other change)."""
    req = urllib.request.Request(url, method="OPTIONS", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=3)
        return bool(resp.headers.get("Access-Control-Allow-Origin"))
    except Exception:
        return False


# Every callable function the frontend actually calls - each one appears to warm up
# independently (observed directly: warming only getOrCreatePlayerProfile still left the
# *first* call to importGuestData, made moments later during the same sign-up, hanging
# well past a multi-second settle wait - it wasn't a general "the emulator just started"
# race, it was specific to whichever function hadn't been hit yet).
ALL_FUNCTION_NAMES = [
    "getOrCreatePlayerProfile", "startGameSession", "submitGameResult",
    "selectSnake", "getLeaderboard", "importGuestData",
]


def _wait_for_function_ready(name, timeout, consecutive_required=3):
    """Requires several consecutive successful preflights (not just one) since the
    emulator's CORS handling was observed to flap during warm-up - one success doesn't
    guarantee the next request won't hit the same race."""
    url = f"http://localhost:{FUNCTIONS_PORT}/snake-odyssey/us-central1/{name}"
    deadline = time.time() + timeout
    streak = 0
    while time.time() < deadline:
        if _cors_preflight_ok(url):
            streak += 1
            if streak >= consecutive_required:
                return True
        else:
            streak = 0
        time.sleep(1)
    return False


def _wait_for_functions_ready(timeout=90):
    per_function_timeout = max(20, timeout // len(ALL_FUNCTION_NAMES))
    return all(_wait_for_function_ready(name, per_function_timeout) for name in ALL_FUNCTION_NAMES)


@pytest.fixture(scope="session")
def firebase_emulators():
    """Starts the Auth+Firestore+Functions emulators for backend/ once per test session
    and tears them down at the end. Skips (not fails) the cloud suite if prerequisites
    (JDK 21+) aren't available, so this suite degrades gracefully on a machine that hasn't
    been set up for it yet."""
    java_exe = _find_java21_plus()
    if not java_exe:
        pytest.skip("Firebase emulators require a JDK 21+ (none found) - see backend/README.md")

    env = os.environ.copy()
    env["PATH"] = str(Path(java_exe).parent) + os.pathsep + env.get("PATH", "")
    env["FUNCTIONS_DISCOVERY_TIMEOUT"] = "60000"
    ca_cert = _ensure_local_ca_cert()
    if ca_cert:
        env["NODE_EXTRA_CA_CERTS"] = ca_cert

    proc = subprocess.Popen(
        "firebase emulators:start --only auth,firestore,functions --project snake-odyssey",
        cwd=str(BACKEND_DIR),
        env=env,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        ports_ready = (
            _wait_for_port(AUTH_PORT) and
            _wait_for_port(FIRESTORE_PORT) and
            _wait_for_port(FUNCTIONS_PORT)
        )
        if not ports_ready:
            pytest.skip("Firebase emulators did not start within the timeout - check `firebase login:list` and Node/JDK setup")
        if not _wait_for_functions_ready(timeout=180):
            pytest.skip("Cloud Functions did not finish loading within the timeout")
        yield
    finally:
        _kill_process_tree(proc)


@pytest.fixture
def page(browser, base_url, firebase_emulators):
    """Same as the top-level `page` fixture (tests/conftest.py), but flags the frontend
    to connect to the Firebase emulators before any page script runs, instead of the live
    project - see frontend/js/auth.js and backend.js."""
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    context.add_init_script("window.__USE_FIREBASE_EMULATORS__ = true;")
    pg = context.new_page()
    pg.snake_console_errors = []
    pg.on("pageerror", lambda e: pg.snake_console_errors.append(str(e)))
    pg.on("console", lambda m: pg.snake_console_errors.append(m.text) if m.type == "error" else None)
    pg.goto(base_url)
    pg.wait_for_selector("#screen-menu:not(.hidden)")
    yield pg
    context.close()
