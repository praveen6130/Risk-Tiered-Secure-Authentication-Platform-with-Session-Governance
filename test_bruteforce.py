#!/usr/bin/env python3
"""
Brute Force Test for Rate Limiting
Tests that rate limiting effectively blocks brute force attacks.
"""
import asyncio
import httpx
import sys
import time
from rich.console import Console
from rich.table import Table
from rich.progress import Progress

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

console = Console(legacy_windows=False)
BASE_URL = "http://localhost:8000/api/v1"


async def test_login_rate_limit():
    console.print("[bold cyan]Testing Login Rate Limiting[/bold cyan]\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        results = []
        blocked_at = None
        
        with Progress() as progress:
            task = progress.add_task("[cyan]Sending requests...", total=20)
            
            for i in range(20):
                start = time.time()
                resp = await client.post(f"{BASE_URL}/auth/login", json={
                    "email": f"bruteforce{i}@example.com",
                    "password": "WrongPassword123!"
                })
                elapsed = (time.time() - start) * 1000
                
                results.append({
                    "attempt": i + 1,
                    "status": resp.status_code,
                    "time_ms": round(elapsed, 2),
                    "detail": resp.json().get("detail", "")[:50] if resp.status_code != 200 else "OK"
                })
                
                if resp.status_code == 429 and blocked_at is None:
                    blocked_at = i + 1
                
                progress.update(task, advance=1)
                await asyncio.sleep(0.05)
        
        table = Table(title="Rate Limit Test Results")
        table.add_column("Attempt", style="cyan")
        table.add_column("Status", style="green")
        table.add_column("Time (ms)", style="yellow")
        table.add_column("Detail", style="white")
        
        for r in results:
            status_style = "red" if r["status"] == 429 else "green" if r["status"] == 200 else "yellow"
            table.add_row(
                str(r["attempt"]),
                f"[{status_style}]{r['status']}[/{status_style}]",
                str(r["time_ms"]),
                r["detail"]
            )
        
        console.print(table)
        
        if blocked_at:
            console.print(f"\n[green]✓ Rate limiting triggered at attempt {blocked_at}[/green]")
            console.print("[green]✓ Brute force protection working![/green]")
        else:
            console.print("\n[yellow]⚠ Rate limiting did not trigger - check Redis configuration[/yellow]")


async def test_register_rate_limit():
    console.print("\n[bold cyan]Testing Registration Rate Limiting[/bold cyan]\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        blocked_at = None
        
        for i in range(10):
            resp = await client.post(f"{BASE_URL}/auth/register", json={
                "email": f"regtest{i}@example.com",
                "password": "Password123!"
            })
            
            if resp.status_code == 429 and blocked_at is None:
                blocked_at = i + 1
                console.print(f"[green]✓ Registration rate limited at attempt {blocked_at}[/green]")
                break
            
            await asyncio.sleep(0.05)
        
        if not blocked_at:
            console.print("[yellow]⚠ Registration rate limiting did not trigger[/yellow]")


async def test_per_email_rate_limit():
    console.print("\n[bold cyan]Testing Per-Email Rate Limiting[/bold cyan]\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        email = "peremail@example.com"
        
        # First register
        await client.post(f"{BASE_URL}/auth/register", json={
            "email": email, "password": "Password123!"
        })
        
        blocked_at = None
        for i in range(12):
            resp = await client.post(f"{BASE_URL}/auth/login", json={
                "email": email, "password": "WrongPass"
            })
            
            if resp.status_code == 429 and blocked_at is None:
                blocked_at = i + 1
                console.print(f"[green]✓ Per-email rate limited at attempt {blocked_at}[/green]")
                break
        
        if not blocked_at:
            console.print("[yellow]⚠ Per-email rate limiting did not trigger[/yellow]")


async def main():
    console.print(Panel("[bold]Brute Force Rate Limiting Test[/bold]", expand=False))
    console.print()
    
    await test_login_rate_limit()
    await test_register_rate_limit()
    await test_per_email_rate_limit()
    
    console.print("\n[bold cyan]Summary[/bold cyan]")
    console.print("• Login endpoint: 10 requests/minute per IP")
    console.print("• Register endpoint: 5 requests/minute per IP")  
    console.print("• Per-email login: 5 requests/minute per email")
    console.print("• MFA endpoint: 5 requests/minute per session")


if __name__ == "__main__":
    from rich.panel import Panel
    asyncio.run(main())