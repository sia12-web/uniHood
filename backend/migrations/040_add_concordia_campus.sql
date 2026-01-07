-- 040_add_concordia_campus.sql
-- Add Concordia University

INSERT INTO campuses (name, domain, logo_url, lat, lon)
VALUES (
    'Concordia University', 
    'concordia.ca', 
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Concordia_University_logo.svg/1200px-Concordia_University_logo.svg.png', 
    45.4972, 
    -73.5790
)
ON CONFLICT (id) DO NOTHING; -- ID is generated, so conflict unlikely unless we hardcode. 
-- Since we rely on name usually or just insert new:
-- We primarily use name for display. 
-- Note: ON CONFLICT on ID doesn't help if ID is auto-gen. 
-- Safe way to avoid duplicate if re-run on same DB:
-- Ideally we check by name if unique constraint exists.
-- But campuses table usually doesn't enforce unique name in schema 001.
-- Let's just insert.
