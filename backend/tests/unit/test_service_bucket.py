from app.domain.proximity.service import round_up_to_bucket


def test_rounds_up_to_next_bucket():
    assert round_up_to_bucket(11.2, 10) == 20


def test_handles_exact_bucket():
    assert round_up_to_bucket(20, 10) == 20


def test_handles_zero_distance():
    assert round_up_to_bucket(0, 10) == 0
