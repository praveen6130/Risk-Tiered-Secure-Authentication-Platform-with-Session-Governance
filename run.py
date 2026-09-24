#!/usr/bin/env python3
"""
Run script for HTH-CS-02 Auth Platform
Starts backend, frontend, and runs demo.
"""
import subprocess
import sys
import os
import time
import signal
import asyncio

def run_command(cmd, cwd=None, env=None, background=False):
    """Run a command and return the process."""
    if background:
        return subprocess.Popen(cmd, cwd=cwd, env=env, shell=True)
    else:
        return subprocess.run(cmd, cwd=cwd, env=env, shell=True, check=True)

def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(project_root, "backend")
    frontend_dir = os.path.join(project_root, "frontend")
    
    # Check if .env exists
    env_file = os.path.join(backend_dir, ".env")
    if not os.path.exists(env_file):
        print("Creating .env from .env.example...")
        import shutil
        shutil.copy(os.path.join(backend_dir, ".env.example"), env_file)
    
    print("=" * 60)
    print("HTH-CS-02 Auth Platform - Starting Services")
    print("=" * 60)
    
    processes = []
    
    try:
        # Start Redis (optional, but recommended)
        print("\n[1/4] Starting Redis...")
        redis_proc = subprocess.Popen(
            ["docker", "run", "-d", "--name", "auth-redis", "-p", "6379:6379", "redis:7-alpine"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        processes.append(("Redis", redis_proc))
        time.sleep(2)
        
        # Start Backend
        print("[2/4] Starting Backend (FastAPI)...")
        backend_env = os.environ.copy()
        backend_env["PYTHONPATH"] = backend_dir
        backend_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
            cwd=backend_dir,
            env=backend_env
        )
        processes.append(("Backend", backend_proc))
        time.sleep(3)
        
        # Initialize DB and seed data
        print("[3/4] Initializing database and seeding demo data...")
        subprocess.run([sys.executable, "seed.py"], cwd=backend_dir, check=True)
        
        # Start Frontend
        print("[4/4] Starting Frontend (Vite)...")
        frontend_proc = subprocess.Popen(
            ["npm", "run", "dev", "--", "--host"],
            cwd=frontend_dir
        )
        processes.append(("Frontend", frontend_proc))
        
        print("\n" + "=" * 60)
        print("All services started!")
        print("=" * 60)
        print(f"Backend API:  http://localhost:8000")
        print(f"API Docs:     http://localhost:8000/docs")
        print(f"Frontend:     http://localhost:5173")
        print("=" * 60)
        print("\nDemo accounts (after seeding):")
        print("  Admin:  user1@example.com / Password123! (MFA enabled)")
        print("  Users:  user2-10@example.com / Password123!")
        print("\nPress Ctrl+C to stop all services")
        print("=" * 60)
        
        # Keep running
        for name, proc in processes:
            try:
                proc.wait()
            except KeyboardInterrupt:
                break
    
    except KeyboardInterrupt:
        print("\n\nShutting down...")
    finally:
        for name, proc in processes:
            if proc.poll() is None:
                print(f"Stopping {name}...")
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        
        # Clean up Redis container
        subprocess.run(["docker", "rm", "-f", "auth-redis"], 
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("All services stopped.")


if __name__ == "__main__":
    main()