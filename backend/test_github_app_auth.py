#!/usr/bin/env python3
"""
Test script to verify GitHub App authentication
"""
import os
import time
import jwt
import httpx
from cryptography.hazmat.primitives import serialization
from dotenv import load_dotenv

load_dotenv()

def test_github_app_auth():
    # Get credentials from environment
    github_app_id = os.getenv("GITHUB_APP_ID")
    github_private_key = os.getenv("GITHUB_PRIVATE_KEY")
    
    if not github_app_id or not github_private_key:
        print("❌ Missing GitHub App credentials in .env file")
        return False
    
    print(f"✅ GitHub App ID: {github_app_id}")
    
    try:
        # Parse the private key
        if github_private_key.startswith('"') and github_private_key.endswith('"'):
            private_key_content = github_private_key[1:-1]
        else:
            private_key_content = github_private_key
        
        private_key_formatted = private_key_content.replace('\\n', '\n')
        
        print(f"🔑 Private key starts with: {private_key_formatted[:50]}...")
        
        private_key = serialization.load_pem_private_key(
            private_key_formatted.encode('utf-8'),
            password=None
        )
        print("✅ Private key parsed successfully")
        
        # Create JWT
        now = int(time.time())
        payload = {
            'iat': now - 60,  # 1 minute ago
            'exp': now + 600,  # 10 minutes
            'iss': int(github_app_id)
        }
        
        jwt_token = jwt.encode(payload, private_key, algorithm='RS256')
        print("✅ JWT created successfully")
        print(f"🎫 JWT: {jwt_token[:50]}...")
        
        # Test the JWT with GitHub API
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "CodeOrbit-Test"
        }
        
        # Try to get app information
        import asyncio
        
        async def test_api():
            async with httpx.AsyncClient() as client:
                app_res = await client.get("https://api.github.com/app", headers=headers)
                print(f"📱 App API status: {app_res.status_code}")
                
                if app_res.status_code == 200:
                    app_data = app_res.json()
                    print(f"✅ App name: {app_data.get('name')}")
                    return True
                else:
                    print(f"❌ App API error: {app_res.text}")
                    return False
        
        return asyncio.run(test_api())
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    print("🧪 Testing GitHub App Authentication...")
    success = test_github_app_auth()
    if success:
        print("🎉 GitHub App authentication test passed!")
    else:
        print("💥 GitHub App authentication test failed!")
