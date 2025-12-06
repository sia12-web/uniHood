/**
 * K6 Authentication Helpers
 * 
 * Provides login functionality for authenticated K6 load tests.
 * Stores tokens and handles auth header generation.
 */

import http from "k6/http";
import { check, fail } from "k6";
import { SharedArray } from "k6/data";

// Test user credentials - configure via environment or use defaults
const TEST_EMAIL = __ENV.TEST_EMAIL || "test@university.edu";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "testpass123";
const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

/**
 * Login and return auth tokens
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} - Auth response with access_token, user_id, etc.
 */
export function login(email = TEST_EMAIL, password = TEST_PASSWORD) {
  const loginUrl = `${BASE_URL}/auth/login`;
  
  const payload = JSON.stringify({
    email: email,
    password: password,
  });
  
  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    tags: { name: "auth:login" },
  };
  
  const response = http.post(loginUrl, payload, params);
  
  const success = check(response, {
    "login status is 200": (r) => r.status === 200,
    "login has access_token": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.access_token);
      } catch {
        return false;
      }
    },
  });
  
  if (!success) {
    console.warn(`Login failed: status=${response.status}, body=${response.body}`);
    return null;
  }
  
  try {
    const body = JSON.parse(response.body);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      userId: body.user_id,
      email: body.email,
      handle: body.handle,
      campusId: body.campus_id,
    };
  } catch (e) {
    console.warn(`Failed to parse login response: ${e}`);
    return null;
  }
}

/**
 * Create auth headers for authenticated requests
 * @param {string} accessToken - JWT access token
 * @returns {Object} - Headers object with Authorization
 */
export function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - JWT refresh token
 * @returns {Object|null} - New auth tokens or null on failure
 */
export function refreshTokens(refreshToken) {
  const refreshUrl = `${BASE_URL}/auth/refresh`;
  
  const payload = JSON.stringify({
    refresh_token: refreshToken,
  });
  
  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    tags: { name: "auth:refresh" },
  };
  
  const response = http.post(refreshUrl, payload, params);
  
  if (response.status !== 200) {
    console.warn(`Token refresh failed: status=${response.status}`);
    return null;
  }
  
  try {
    const body = JSON.parse(response.body);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || refreshToken,
    };
  } catch {
    return null;
  }
}

/**
 * Register a new test user (useful for load test setup)
 * @param {Object} userData - User registration data
 * @returns {Object|null} - Registration response or null on failure
 */
export function registerUser(userData) {
  const registerUrl = `${BASE_URL}/auth/register`;
  
  const payload = JSON.stringify({
    email: userData.email,
    password: userData.password,
    handle: userData.handle || `user_${Date.now()}`,
    display_name: userData.displayName || "Test User",
  });
  
  const params = {
    headers: {
      "Content-Type": "application/json",
    },
    tags: { name: "auth:register" },
  };
  
  const response = http.post(registerUrl, payload, params);
  
  if (response.status === 201 || response.status === 200) {
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  }
  
  console.warn(`Registration failed: status=${response.status}, body=${response.body}`);
  return null;
}

/**
 * Logout user
 * @param {string} accessToken - JWT access token
 * @returns {boolean} - Success status
 */
export function logout(accessToken) {
  const logoutUrl = `${BASE_URL}/auth/logout`;
  
  const params = {
    headers: authHeaders(accessToken),
    tags: { name: "auth:logout" },
  };
  
  const response = http.post(logoutUrl, null, params);
  return response.status === 200 || response.status === 204;
}

export default {
  login,
  authHeaders,
  refreshTokens,
  registerUser,
  logout,
  BASE_URL,
  TEST_EMAIL,
  TEST_PASSWORD,
};

// Also export individually for import { ... } syntax
export { BASE_URL, TEST_EMAIL, TEST_PASSWORD };
