# Search Indexing

We support type = ["people","rooms","posts"].

People:
- Fields: handle, display_name, bio, interests, skills
- Indexes:
  GIN to_tsvector('simple', handle || ' ' || display_name || ' ' || bio)
  GIN jsonb_path_ops on interests/skills tags
  pg_trgm GIN on handle/display_name for fuzzy/prefix search

Rooms:
- Fields: title, topic, description
- GIN to_tsvector('english', title || ' ' || topic || ' ' || description)
- pg_trgm on title

Posts:
- Fields: text, tags
- GIN to_tsvector('english', text)
- GIN on tags (jsonb_path_ops)
- Optional: materialized view for post_text_fts if text lives across tables

Ranking:
- Use ts_rank_cd for text relevance + recency boost
- Combine with social proximity/campus proximity weights for viewer

Pagination:
- Keyset by (score DESC, created_at DESC, id)
