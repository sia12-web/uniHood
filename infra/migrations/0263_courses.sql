
CREATE TABLE IF NOT EXISTS user_courses (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_code TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'everyone',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, course_code)
);

CREATE INDEX IF NOT EXISTS idx_user_courses_user_id ON user_courses(user_id);
