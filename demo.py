#!/usr/bin/env python3
"""
Demo script for HTH-CS-02 Authentication Platform
Run this after starting the backend and frontend to verify all features work.
"""
import asyncio
import httpx
import json
import sys
import time
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

console = Console(legacy_windows=False)

BASE_URL = "http://localhost:8000/api/v1"


async def print_header(title: str):
    console.print(Panel(f"[bold cyan]{title}[/bold cyan]", expand=False))


async def print_step(step: str):
    console.print(f"[yellow]→[/yellow] {step}")


async def print_success(msg: str):
    console.print(f"[green]✓[/green] {msg}")


async def print_error(msg: str):
    console.print(f"[red]✗[/red] {msg}")


async def demo_register_login():
    await print_header("1. User Registration & Login")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Register
        await print_step("Registering new user...")
        resp = await client.post(f"{BASE_URL}/auth/register", json={
            "email": "demo@example.com",
            "password": "DemoPass123!",
            "full_name": "Demo User"
        })
        if resp.status_code == 201:
            await print_success(f"Registered: {resp.json()['email']}")
        else:
            await print_error(f"Registration failed: {resp.text}")
            return None, None
        
        # Login
        await print_step("Logging in...")
        resp = await client.post(f"{BASE_URL}/auth/login", json={
            "email": "demo@example.com",
            "password": "DemoPass123!"
        })
        if resp.status_code == 200:
            data = resp.json()
            await print_success("Login successful!")
            await print_success(f"Access token: {data['access_token'][:20]}...")
            await print_success(f"MFA required: {data['mfa_required']}")
            return data['access_token'], data['refresh_token']
        else:
            await print_error(f"Login failed: {resp.text}")
            return None, None


async def demo_mfa_setup(token: str):
    await print_header("2. MFA Setup (TOTP)")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {"Authorization": f"Bearer {token}"}
        
        await print_step("Getting MFA setup (QR code + secret)...")
        resp = await client.post(f"{BASE_URL}/auth/mfa/setup", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            await print_success("MFA setup data received")
            await print_success(f"Secret: {data['secret']}")
            await print_success(f"QR code: {len(data['qr_code'])} chars (base64)")
            await print_success(f"Backup codes: {len(data['backup_codes'])} codes")
            
            # Verify with current TOTP
            import pyotp
            code = pyotp.TOTP(data['secret']).now()
            await print_step(f"Verifying with code: {code}")
            resp = await client.post(f"{BASE_URL}/auth/mfa/verify", json={"code": code}, headers=headers)
            if resp.status_code == 200:
                await print_success("MFA enabled!")
            else:
                await print_error(f"MFA verify failed: {resp.text}")
            
            return data['secret'], data['backup_codes']
        else:
            await print_error(f"MFA setup failed: {resp.text}")
            return None, None


async def demo_mfa_login():
    await print_header("3. MFA-Protected Login")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        await print_step("Logging in with MFA-enabled account...")
        resp = await client.post(f"{BASE_URL}/auth/login", json={
            "email": "user1@example.com",
            "password": "Password123!"
        })
        if resp.status_code == 200:
            data = resp.json()
            if data['mfa_required']:
                await print_success(f"MFA challenge required! Session ID: {data['session_id']}")
                await print_step("Verifying with TOTP...")
                import pyotp
                code = pyotp.TOTP("JBSWY3DPEHPK3PXP").now()
                resp = await client.post(f"{BASE_URL}/auth/mfa/challenge", json={
                    "code": code,
                    "session_id": data['session_id']
                })
                if resp.status_code == 200:
                    await print_success("MFA login successful!")
                    return resp.json()['access_token']
                else:
                    await print_error(f"MFA challenge failed: {resp.text}")
            else:
                await print_success("Login successful (no MFA)")
                return data['access_token']
        else:
            await print_error(f"Login failed: {resp.text}")
            return None


async def demo_sessions(token: str):
    await print_header("4. Session Management")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {"Authorization": f"Bearer {token}"}
        
        await print_step("Listing sessions...")
        resp = await client.get(f"{BASE_URL}/auth/sessions", headers=headers)
        if resp.status_code == 200:
            sessions = resp.json()
            table = Table(title="Active Sessions")
            table.add_column("ID", style="cyan")
            table.add_column("IP", style="green")
            table.add_column("Location", style="yellow")
            table.add_column("Risk", style="magenta")
            table.add_column("Status", style="blue")
            table.add_column("MFA", style="green")
            
            for s in sessions[:5]:
                table.add_row(
                    str(s['id']),
                    s['ip_address'],
                    f"{s['city']}, {s['country']}",
                    s['risk_tier'].upper(),
                    s['status'],
                    "✓" if s['mfa_verified'] else "✗"
                )
            console.print(table)
            await print_success(f"Total sessions: {len(sessions)}")
        else:
            await print_error(f"Failed to list sessions: {resp.text}")


async def demo_admin_dashboard(admin_token: str):
    await print_header("5. Admin Dashboard")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        await print_step("Getting risk statistics...")
        resp = await client.get(f"{BASE_URL}/admin/risk/stats", headers=headers)
        if resp.status_code == 200:
            stats = resp.json()
            table = Table(title="Risk Distribution")
            table.add_column("Tier", style="cyan")
            table.add_column("Count", style="green")
            for tier, count in stats.get('risk_distribution', {}).items():
                table.add_row(tier.upper(), str(count))
            console.print(table)
        
        await print_step("Listing all sessions (admin)...")
        resp = await client.get(f"{BASE_URL}/admin/sessions", headers=headers)
        if resp.status_code == 200:
            sessions = resp.json()
            await print_success(f"Total sessions in system: {len(sessions)}")
            
            # Show high/critical risk sessions
            high_risk = [s for s in sessions if s['risk_tier'] in ('high', 'critical')]
            if high_risk:
                table = Table(title="High/Critical Risk Sessions")
                table.add_column("User ID", style="cyan")
                table.add_column("IP", style="green")
                table.add_column("Risk", style="red")
                table.add_column("Factors", style="yellow")
                for s in high_risk[:5]:
                    factors = ", ".join(s['risk_factors'].keys()) if s['risk_factors'] else "none"
                    table.add_row(str(s['user_id']), s['ip_address'], s['risk_tier'].upper(), factors)
                console.print(table)


async def demo_rate_limiting():
    await print_header("6. Rate Limiting Demo")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        await print_step("Sending 15 rapid login attempts...")
        limited = False
        for i in range(15):
            resp = await client.post(f"{BASE_URL}/auth/login", json={
                "email": f"ratelimit{i}@example.com",
                "password": "WrongPass123!"
            })
            if resp.status_code == 429:
                limited = True
                await print_success(f"Rate limited at attempt {i+1}!")
                await print_success(f"Retry-After: {resp.headers.get('Retry-After', 'N/A')}s")
                break
        
        if not limited:
            await print_error("Rate limiting did not trigger (may need Redis)")


async def demo_risk_assessment(admin_token: str):
    await print_header("7. Risk Engine Assessment")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        await print_step("Assessing risk for new device + VPN scenario...")
        resp = await client.post(f"{BASE_URL}/admin/risk/assess", json={
            "user_id": 1,
            "ip": "8.8.8.8",
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "device_fingerprint": {"screen": {"width": 1920, "height": 1080}, "new": True}
        }, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            await print_success(f"Risk Score: {data['risk_score']:.2f}")
            await print_success(f"Risk Tier: {data['risk_tier'].upper()}")
            await print_success(f"Requires Step-Up: {data['requires_step_up']}")
            await print_success(f"Step-Up Type: {data['step_up_type']}")
            console.print(Panel(json.dumps(data['risk_factors'], indent=2), title="Risk Factors"))
        else:
            await print_error(f"Risk assessment failed: {resp.text}")


async def main():
    console.print(Panel("[bold green]HTH-CS-02 Auth Platform - Demo Script[/bold green]", expand=False))
    console.print()
    
    # Wait for services
    await print_step("Waiting for services...")
    for i in range(30):
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get("http://localhost:8000/health")
                if resp.status_code == 200:
                    await print_success("Backend is ready!")
                    break
        except:
            pass
        await asyncio.sleep(1)
    else:
        await print_error("Backend not responding. Start with: docker-compose up -d")
        return
    
    # Run demos
    token, _ = await demo_register_login()
    if token:
        await demo_mfa_setup(token)
    
    mfa_token = await demo_mfa_login()
    if mfa_token:
        await demo_sessions(mfa_token)
    
    # Admin login
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{BASE_URL}/auth/login", json={
            "email": "user1@example.com",
            "password": "Password123!"
        })
        if resp.status_code == 200:
            admin_token = resp.json()['access_token']
            await demo_admin_dashboard(admin_token)
            await demo_risk_assessment(admin_token)
    
    await demo_rate_limiting()
    
    console.print(Panel("[bold green]Demo Complete![/bold green]", expand=False))
    console.print("\n[cyan]Next steps:[/cyan]")
    console.print("  • Open http://localhost:5173 for the frontend dashboard")
    console.print("  • Open http://localhost:8000/docs for API documentation")
    console.print("  • Try logging in with different demo accounts")
    console.print("  • Use admin account (user1@example.com) for admin panel")


if __name__ == "__main__":
    asyncio.run(main())