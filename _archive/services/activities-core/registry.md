# Activity Registry (SpeedTyping only)

REGISTER 'speed_typing'
- key: 'speed_typing'
- name: 'Who Types Faster'
- config: { rounds=3, timeLimitMs=40000, textLen: {min:70, max:120} }
- buildRounds(config): as algorithms.md
- scoring: computeScore(metrics) as algorithms.md
- isRoundOver: both submitted OR timer elapsed
- text bank: ~40 pangrams seeded at startup (English, short & mid)
