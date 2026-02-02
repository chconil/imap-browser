#!/bin/bash

# IMAP Browser - API Test Script
# This script sets up the database and tests all major API endpoints

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
COOKIE_FILE="/tmp/imap-browser-test-cookies.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_success() { echo -e "${GREEN}✓ $1${NC}"; }
echo_error() { echo -e "${RED}✗ $1${NC}"; }
echo_info() { echo -e "${YELLOW}→ $1${NC}"; }

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

test_endpoint() {
    local name="$1"
    local expected_success="$2"
    local response="$3"

    local is_success
    is_success=$(echo "$response" | jq -r '.success // false' 2>/dev/null || echo "false")

    if [ "$is_success" = "true" ]; then
        if [ "$expected_success" = "true" ]; then
            echo_success "$name"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo_error "$name (expected failure, got success)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        if [ "$expected_success" = "false" ]; then
            echo_success "$name (expected failure)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo_error "$name"
            echo "  Response: $(echo "$response" | jq -c '.error // .' 2>/dev/null || echo "$response")"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
}

echo "========================================"
echo "  IMAP Browser API Test Suite"
echo "========================================"
echo ""

# Step 1: Setup database
echo_info "Setting up database..."
cd "$PROJECT_DIR/packages/server"
if npm run db:setup > /dev/null 2>&1; then
    echo_success "Database setup complete"
else
    echo_error "Database setup failed"
    exit 1
fi

# Step 2: Check if server is running
echo ""
echo_info "Checking server status..."
if curl -s --max-time 5 "$SERVER_URL/api/health" > /dev/null 2>&1; then
    echo_success "Server is running at $SERVER_URL"
else
    echo_error "Server is not running at $SERVER_URL"
    echo "  Start the server with: npm run dev"
    exit 1
fi

# Clean up any existing test cookies
rm -f "$COOKIE_FILE"

# Generate unique test email to avoid conflicts
TEST_TIMESTAMP=$(date +%s)
TEST_EMAIL="test-${TEST_TIMESTAMP}@example.com"
TEST_PASSWORD="TestPass123"
TEST_NAME="Test User"

echo ""
echo "========================================"
echo "  Authentication Tests"
echo "========================================"

# Test 1: Register new user
echo ""
echo_info "Testing user registration..."
REGISTER_RESPONSE=$(curl -s --max-time 10 -X POST "$SERVER_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    --data-raw '{"email":"'"$TEST_EMAIL"'","password":"'"$TEST_PASSWORD"'","displayName":"'"$TEST_NAME"'"}')
test_endpoint "Register new user" "true" "$REGISTER_RESPONSE"

# Test 2: Register duplicate user (should fail)
echo_info "Testing duplicate registration..."
DUPLICATE_RESPONSE=$(curl -s --max-time 10 -X POST "$SERVER_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    --data-raw '{"email":"'"$TEST_EMAIL"'","password":"'"$TEST_PASSWORD"'","displayName":"'"$TEST_NAME"'"}')
test_endpoint "Reject duplicate email" "false" "$DUPLICATE_RESPONSE"

# Test 3: Login
echo_info "Testing login..."
LOGIN_RESPONSE=$(curl -s --max-time 10 -X POST "$SERVER_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_FILE" \
    --data-raw '{"email":"'"$TEST_EMAIL"'","password":"'"$TEST_PASSWORD"'"}')
test_endpoint "Login with valid credentials" "true" "$LOGIN_RESPONSE"

# Test 4: Login with wrong password (should fail)
echo_info "Testing login with wrong password..."
WRONG_PASS_RESPONSE=$(curl -s --max-time 10 -X POST "$SERVER_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data-raw '{"email":"'"$TEST_EMAIL"'","password":"WrongPassword"}')
test_endpoint "Reject wrong password" "false" "$WRONG_PASS_RESPONSE"

# Test 5: Get current user
echo_info "Testing /auth/me..."
ME_RESPONSE=$(curl -s --max-time 10 "$SERVER_URL/api/auth/me" -b "$COOKIE_FILE")
test_endpoint "Get current user" "true" "$ME_RESPONSE"

# Test 6: Unauthenticated access (should fail)
echo_info "Testing unauthenticated access..."
UNAUTH_RESPONSE=$(curl -s --max-time 10 "$SERVER_URL/api/auth/me")
test_endpoint "Reject unauthenticated access" "false" "$UNAUTH_RESPONSE"

echo ""
echo "========================================"
echo "  Settings Tests"
echo "========================================"

# Test 7: Get settings
echo ""
echo_info "Testing get settings..."
SETTINGS_RESPONSE=$(curl -s --max-time 10 "$SERVER_URL/api/settings" -b "$COOKIE_FILE")
test_endpoint "Get user settings" "true" "$SETTINGS_RESPONSE"

# Test 8: Update settings
echo_info "Testing update settings..."
UPDATE_SETTINGS_RESPONSE=$(curl -s --max-time 10 -X PATCH "$SERVER_URL/api/settings" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    --data-raw '{"emailsPerPage":100,"previewLines":3}')
test_endpoint "Update settings" "true" "$UPDATE_SETTINGS_RESPONSE"

echo ""
echo "========================================"
echo "  Accounts Tests"
echo "========================================"

# Test 9: List accounts (empty)
echo ""
echo_info "Testing list accounts..."
ACCOUNTS_RESPONSE=$(curl -s --max-time 10 "$SERVER_URL/api/accounts" -b "$COOKIE_FILE")
test_endpoint "List accounts (empty)" "true" "$ACCOUNTS_RESPONSE"

echo ""
echo "========================================"
echo "  Logout Test"
echo "========================================"

# Test 10: Logout
echo ""
echo_info "Testing logout..."
LOGOUT_RESPONSE=$(curl -s --max-time 10 -X POST "$SERVER_URL/api/auth/logout" -b "$COOKIE_FILE" -c "$COOKIE_FILE")
test_endpoint "Logout" "true" "$LOGOUT_RESPONSE"

# Test 11: Access after logout (should fail)
echo_info "Testing access after logout..."
AFTER_LOGOUT_RESPONSE=$(curl -s --max-time 10 "$SERVER_URL/api/auth/me" -b "$COOKIE_FILE")
test_endpoint "Reject access after logout" "false" "$AFTER_LOGOUT_RESPONSE"

# Cleanup
rm -f "$COOKIE_FILE"

echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo ""
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo_success "All tests passed!"
    exit 0
else
    echo_error "Some tests failed"
    exit 1
fi
