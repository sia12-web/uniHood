from uuid import uuid4
from app.domain.xp.models import UserXPStats
from app.domain.xp.service import XPService

def test_calculate_level():
    service = XPService()
    # 0 -> 1
    assert service._calculate_level(0) == 1
    # 99 -> 1
    assert service._calculate_level(99) == 1
    # 100 -> 2
    assert service._calculate_level(100) == 2
    # 500 -> 3
    assert service._calculate_level(500) == 3
    # 15000 -> 6
    assert service._calculate_level(15000) == 6
    assert service._calculate_level(20000) == 6

def test_xp_model_properties():
    # Helper to clean syntax
    def mk(xp, level):
        return UserXPStats(
            user_id=uuid4(),
            total_xp=xp,
            current_level=level,
            last_updated_at=None
        )

    s1 = mk(50, 1)
    assert s1.next_level_xp == 100
    assert s1.level_label == "Newcomer"

    s2 = mk(200, 2)
    assert s2.next_level_xp == 500
    assert s2.level_label == "Explorer"
    
    sMax = mk(16000, 6)
    assert sMax.next_level_xp is None
    assert sMax.level_label == "Campus Icon"
