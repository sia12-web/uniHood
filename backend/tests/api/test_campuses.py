import pytest
from httpx import AsyncClient
from uuid import uuid4
import unittest.mock
from app.infra import postgres

@pytest.mark.asyncio
async def test_list_campuses(api_client: AsyncClient, monkeypatch):
    # Setup mock data
    mock_campus = {
        "id": uuid4(),
        "name": "Concordia University",
        "domain": "concordia.ca",
        "logo_url": "http://example.com/logo.png",
        "lat": 45.4972,
        "lon": -73.5790
    }
    
    mock_conn = unittest.mock.AsyncMock()
    mock_conn.fetch.return_value = [mock_campus]
    
    mock_pool = unittest.mock.MagicMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    
    async def _mock_get_pool():
        return mock_pool
        
    monkeypatch.setattr(postgres, "get_pool", _mock_get_pool)

    response = await api_client.get("/campuses/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    
    # Verify Concordia is present
    concordia = next((c for c in data if c["name"] == "Concordia University"), None)
    assert concordia is not None
    assert concordia["domain"] == "concordia.ca"
    assert "lat" in concordia
    assert "lon" in concordia
