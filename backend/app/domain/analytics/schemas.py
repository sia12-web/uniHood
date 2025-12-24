from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class AnalyticsOverview(BaseModel):
    total_meetups_created: int
    total_games_played: int
    active_meetups_count: int
    active_games_count: int

class PopularGameItem(BaseModel):
    game_kind: str
    play_count: int
    last_played_at: Optional[datetime]

class PopularMeetupTypeItem(BaseModel):
    category: str
    count: int

class ActivityLogItem(BaseModel):
    id: int
    user_id: str
    event: str
    meta: Dict[str, Any]
    created_at: datetime
    user_display_name: Optional[str] = None
    user_avatar_url: Optional[str] = None
