import httpx

BASE = "http://localhost:8000"
EMAIL = "test@example.edu"
PASS = "VeryStrongPassw0rd!"


def cookie(response: httpx.Response, name: str) -> str:
	for c in response.cookies.jar:
		if c.name == name:
			return c.value
	return ""


with httpx.Client(base_url=BASE, follow_redirects=False) as client:
	# 1) register (ignore if exists)
	try:
		register_response = client.post(
			"/auth/register",
			json={
				"email": EMAIL,
				"password": PASS,
				"handle": "tester123",
				"display_name": "",
				"campus_id": "00000000-0000-0000-0000-000000000001",
			},
		)
		print("register:", register_response.status_code, register_response.json())
	except Exception:
		pass

	# 2) login
	login_response = client.post(
		"/auth/login",
		json={"email": EMAIL, "password": PASS, "device_label": "smoke"},
	)
	print("login:", login_response.status_code)
	login_json = login_response.json()
	access1 = login_json["access_token"]
	session_id = login_json.get("session_id")
	rt1 = cookie(login_response, "refresh_token")
	rf_fp = cookie(login_response, "rf_fp")
	assert rt1 and rf_fp

	# 3) refresh #1
	refresh1_response = client.post("/auth/refresh", json={"session_id": session_id})
	print("refresh1:", refresh1_response.status_code)
	refresh1_json = refresh1_response.json()
	access2 = refresh1_json["access_token"]
	rt2 = cookie(refresh1_response, "refresh_token")
	assert rt2 and rt2 != rt1

	# 4) reuse old refresh (should fail if reuse detection enabled)
	client.cookies.set("refresh_token", rt1, path="/auth/refresh")
	reuse_response = client.post("/auth/refresh", json={"session_id": session_id})
	print("reuse_old_refresh:", reuse_response.status_code, reuse_response.text[:200])

	# 5) logout
	client.cookies.set("refresh_token", rt2, path="/auth/refresh")
	logout_response = client.post(
		"/auth/logout",
		json={
			"user_id": refresh1_json.get("user_id", "00000000-0000-0000-0000-000000000000"),
			"session_id": refresh1_json.get("session_id", session_id),
		},
	)
	print("logout:", logout_response.status_code)
