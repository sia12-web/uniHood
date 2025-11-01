import pytest

from app.obs import metrics


@pytest.mark.asyncio
async def test_record_quarantine_reveal(api_client):
	before = metrics.UI_SAFETY_QUARANTINE_REVEALS._value.get()
	response = await api_client.post("/ops/ui-metrics", json={"event": "quarantine_reveal"})
	assert response.status_code == 202
	after = metrics.UI_SAFETY_QUARANTINE_REVEALS._value.get()
	assert after == before + 1


@pytest.mark.asyncio
async def test_record_quarantine_decision(api_client):
	before = metrics.UI_SAFETY_DECISIONS.labels(verdict="clean")._value.get()
	response = await api_client.post(
		"/ops/ui-metrics",
		json={"event": "quarantine_decision", "verdict": "clean"},
	)
	assert response.status_code == 202
	after = metrics.UI_SAFETY_DECISIONS.labels(verdict="clean")._value.get()
	assert after == before + 1


@pytest.mark.asyncio
async def test_record_thresholds_simulate(api_client):
	before = metrics.UI_SAFETY_THRESHOLDS_SIMULATE._value.get()
	response = await api_client.post("/ops/ui-metrics", json={"event": "thresholds_simulate"})
	assert response.status_code == 202
	after = metrics.UI_SAFETY_THRESHOLDS_SIMULATE._value.get()
	assert after == before + 1


@pytest.mark.asyncio
async def test_record_hash_import(api_client):
	before = metrics.UI_SAFETY_HASH_IMPORT_ROWS._value.get()
	response = await api_client.post("/ops/ui-metrics", json={"event": "hash_import", "count": 5})
	assert response.status_code == 202
	after = metrics.UI_SAFETY_HASH_IMPORT_ROWS._value.get()
	assert after == before + 5


@pytest.mark.asyncio
async def test_record_url_query(api_client):
	before = metrics.UI_SAFETY_URL_QUERIES._value.get()
	response = await api_client.post("/ops/ui-metrics", json={"event": "url_query"})
	assert response.status_code == 202
	after = metrics.UI_SAFETY_URL_QUERIES._value.get()
	assert after == before + 1


@pytest.mark.asyncio
async def test_record_metric_requires_verdict(api_client):
	response = await api_client.post("/ops/ui-metrics", json={"event": "quarantine_decision"})
	assert response.status_code == 400


@pytest.mark.asyncio
async def test_record_metric_requires_count(api_client):
	response = await api_client.post("/ops/ui-metrics", json={"event": "hash_import"})
	assert response.status_code == 400
