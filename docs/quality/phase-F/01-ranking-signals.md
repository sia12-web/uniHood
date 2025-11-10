# Communities Feed — Signal Definitions (v1)

Entities ranked: posts (and optionally reposts) in communities.

Signals (normalized to [0,1]):
- Freshness: f(t) = exp(-Δt / τ), τ default 8h.
- Engagement: weighted reactions + comments + saves:
  s_eng = w_like*likes + w_cmt*comments + w_save*saves + w_share*shares
  Normalize by log(1+community_size) to avoid large-group bias.
- Social Proximity:
  s_social = 1 if posted_by is my friend else 0.2 if friend-of-friend else 0.
- Campus Proximity:
  s_campus = 1 if same campus else 0.4 if adjacent campus else 0.
- Content Match (optional, if viewer has interests):
  s_match = Jaccard(tags_viewer, tags_post)
- Quality Prior (anti-spam):
  s_quality = clamp( author_trust * 0.6 + author_rep * 0.4 , 0..1 )

Score:
  S = α*fresh + β*norm(eng) + γ*s_social + δ*s_campus + ε*s_match + ζ*s_quality
  Defaults: α=0.35, β=0.35, γ=0.15, δ=0.05, ε=0.05, ζ=0.05

Blending:
- Hard caps: never show items older than MAX_AGE_D (default 7 days).
- Diversity: at most K posts per author in top N (fairness).
