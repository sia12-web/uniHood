import pytest
from httpx import AsyncClient
from uuid import UUID

@pytest.mark.asyncio
async def test_list_campuses(api_client: AsyncClient):
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
