#!/bin/bash

# Nango Key Generation Script
# Generates all required keys for Nango setup

echo "=========================================="
echo "  NANGO KEY GENERATION"
echo "=========================================="
echo ""

# Generate Secret Key (32+ characters)
echo "1. Generating NANGO_SECRET_KEY..."
SECRET_KEY=$(openssl rand -hex 32)
echo "   NANGO_SECRET_KEY=$SECRET_KEY"
echo ""

# Generate Public Key (32+ characters)
echo "2. Generating NANGO_PUBLIC_KEY..."
PUBLIC_KEY=$(openssl rand -hex 32)
echo "   NANGO_PUBLIC_KEY=$PUBLIC_KEY"
echo ""

# Generate Encryption Key (must be exactly 32 characters)
echo "3. Generating NANGO_ENCRYPTION_KEY (32 chars)..."
ENCRYPTION_KEY=$(openssl rand -hex 16)
echo "   NANGO_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""

echo "=========================================="
echo "  COPY THESE TO YOUR .env FILES"
echo "=========================================="
echo ""
echo "# Add to nango/.env:"
echo "NANGO_SECRET_KEY=$SECRET_KEY"
echo "NANGO_PUBLIC_KEY=$PUBLIC_KEY"
echo "NANGO_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "NANGO_SERVER_URL=http://localhost:3003"
echo ""
echo "# Add to your main project .env:"
echo "NANGO_SECRET_KEY=$SECRET_KEY"
echo "NANGO_SERVER_URL=http://localhost:3003"
echo "NEXT_PUBLIC_NANGO_PUBLIC_KEY=$PUBLIC_KEY"
echo "NEXT_PUBLIC_NANGO_SERVER_URL=http://localhost:3003"
echo "NANGO_ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""
echo "=========================================="

