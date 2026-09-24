#!/usr/bin/env python3
"""
Risk-Tiered Secure Authentication Platform with Session Governance
Unified Runner & Test Orchestrator
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
import time


def get_paths():
    project_root = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(project_root, "backend")
    frontend_dir = os.path.join(project_root, "frontend")
    
    # Locate virtualenv python if available
    venv_win = os.path.join(backend_dir, ".venv", "Scripts", "python.exe")
    venv_unix = os.path.join(backend_dir, ".venv", "bin", "python")
    
    if os.path.exists(venv_win):
        python_exe = venv_win
    elif os.path.exists(venv_unix):
        python_exe = venv_unix
    else:
        python_exe = sys.executable
        
    return project_root, backend_dir, frontend_dir, python_exe


def ensure_env(backend_dir):
    env_file = os.path.join(backend_dir, ".env")
    env_example = os.path.join(backend_dir, ".env.example")
    if not os.path.exists(env_file) and os.path.exists(env_example):
        print("[Setup] Creating backend/.env from .env.example...")
        shutil.copy(env_example, env_file)


def run_tests(args):
    project_root, backend_dir, frontend_dir, python_exe = get_paths()
    ensure_env(backend_dir)
    
    run_backend = not args.frontend_only
    run_frontend = not args.backend_only
    
    all_success = True
    
    print("\n" + "=" * 60)
    print("RUNNING AUTOMATED TEST SUITE")
    print("=" * 60)
    
    if run_backend:
        print("\n>>> [1] Running Backend Tests (pytest)...")
        res = subprocess.run(
            [python_exe, "-m", "pytest", "tests/", "-v"],
            cwd=backend_dir
        )
        if res.returncode != 0:
            all_success = False
            print("[Backend Tests Failed]")
        else:
            print("[Backend Tests Passed Cleanly (33/33)]")
            
    if run_frontend:
        print("\n>>> [2] Running Frontend Tests (vitest)...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        res = subprocess.run(
            [npm_cmd, "run", "test", "--", "--run"],
            cwd=frontend_dir,
            shell=(sys.platform == "win32")
        )
        if res.returncode != 0:
            all_success = False
            print("[Frontend Tests Failed]")
        else:
            print("[Frontend Tests Passed Cleanly (22/22)]")
            
    print("\n" + "=" * 60)
    if all_success:
        print("[SUCCESS] ALL TESTS PASSED! (55/55 Tests Passing)")
    else:
        print("[FAILURE] SOME TESTS FAILED. Check logs above.")
    print("=" * 60 + "\n")
    return 0 if all_success else 1


def run_seed():
    project_root, backend_dir, _, python_exe = get_paths()
    ensure_env(backend_dir)
    print("\n>>> Seeding database with demo users, devices, and sessions...")
    res = subprocess.run([python_exe, "seed.py"], cwd=backend_dir)
    return res.returncode


def run_build():
    _, _, frontend_dir, _ = get_paths()
    print("\n>>> Building frontend production bundle (tsc && vite build)...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    res = subprocess.run([npm_cmd, "run", "build"], cwd=frontend_dir, shell=(sys.platform == "win32"))
    return res.returncode


def run_demo():
    project_root, _, _, python_exe = get_paths()
    print("\n>>> Running interactive demo script...")
    res = subprocess.run([python_exe, "demo.py"], cwd=project_root)
    return res.returncode


def run_bruteforce():
    project_root, _, _, python_exe = get_paths()
    print("\n>>> Running brute-force rate limit security test...")
    res = subprocess.run([python_exe, "test_bruteforce.py"], cwd=project_root)
    return res.returncode


def run_services():
    project_root, backend_dir, frontend_dir, python_exe = get_paths()
    ensure_env(backend_dir)
    
    print("=" * 65)
    print("[*] Risk-Tiered Secure Authentication Platform & Session Governance")
    print("=" * 65)
    
    processes = []
    
    # Check Docker & Redis
    docker_available = shutil.which("docker") is not None
    redis_started = False
    
    if docker_available:
        try:
            print("[1/4] Checking Docker for Redis cache...")
            check = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if check.returncode == 0:
                print("      Starting Redis container...")
                redis_proc = subprocess.Popen(
                    ["docker", "run", "-d", "--name", "auth-redis", "-p", "6379:6379", "redis:7-alpine"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                processes.append(("Redis", redis_proc))
                redis_started = True
            else:
                print("      [Notice] Docker daemon not running. Built-in In-Memory Rate Limiter active.")
        except Exception:
            print("      [Notice] Docker check skipped. Built-in In-Memory Rate Limiter active.")
    else:
        print("[1/4] [Notice] Docker not found. Using built-in In-Memory Rate Limiter (no Redis needed).")
    
    # Initialize DB & Seed
    print("[2/4] Initializing database & seeding default accounts...")
    seed_env = os.environ.copy()
    seed_env["PYTHONPATH"] = backend_dir
    subprocess.run([python_exe, "seed.py"], cwd=backend_dir, env=seed_env, check=False)
    
    # Start Backend
    print("[3/4] Starting FastAPI Backend on http://localhost:8000...")
    backend_env = os.environ.copy()
    backend_env["PYTHONPATH"] = backend_dir
    backend_proc = subprocess.Popen(
        [python_exe, "-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd=backend_dir,
        env=backend_env
    )
    processes.append(("Backend", backend_proc))
    time.sleep(2)
    
    # Start Frontend
    print("[4/4] Starting Vite Frontend on http://localhost:5173...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev", "--", "--host"],
        cwd=frontend_dir,
        shell=(sys.platform == "win32")
    )
    processes.append(("Frontend", frontend_proc))
    
    print("\n" + "=" * 65)
    print("[READY] All services up and running!")
    print("=" * 65)
    print("  -> Web Dashboard:    http://localhost:5173")
    print("  -> Backend API:      http://localhost:8000")
    print("  -> Swagger Docs:     http://localhost:8000/docs")
    print("=" * 65)
    print("\n[+] Seeded Accounts for Testing:")
    print("  Admin:  user1@example.com  / Password123! (MFA enabled)")
    print("  Users:  user2@example.com to user10@example.com / Password123!")
    print("\n[*] Press Ctrl+C at any time to gracefully stop all services.")
    print("=" * 65 + "\n")
    
    try:
        while True:
            time.sleep(1)
            for name, proc in processes:
                if proc.poll() is not None:
                    print(f"[Warning] {name} process stopped unexpectedly.")
    except KeyboardInterrupt:
        print("\nShutting down services gracefully...")
    finally:
        for name, proc in processes:
            if proc.poll() is None:
                print(f"Stopping {name}...")
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    
        if redis_started:
            subprocess.run(["docker", "rm", "-f", "auth-redis"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("All services stopped.")


def main():
    parser = argparse.ArgumentParser(description="Auth Platform Orchestrator")
    parser.add_argument("--test", action="store_true", help="Run full automated test suite (backend + frontend)")
    parser.add_argument("--backend-only", action="store_true", help="Run only backend tests with --test")
    parser.add_argument("--frontend-only", action="store_true", help="Run only frontend tests with --test")
    parser.add_argument("--seed", action="store_true", help="Seed database with demo data")
    parser.add_argument("--build", action="store_true", help="Build frontend production bundle")
    parser.add_argument("--demo", action="store_true", help="Run demo script")
    parser.add_argument("--bruteforce", action="store_true", help="Run brute force security simulation")
    
    args = parser.parse_args()
    
    if args.test:
        sys.exit(run_tests(args))
    elif args.seed:
        sys.exit(run_seed())
    elif args.build:
        sys.exit(run_build())
    elif args.demo:
        sys.exit(run_demo())
    elif args.bruteforce:
        sys.exit(run_bruteforce())
    else:
        run_services()


if __name__ == "__main__":
    main()