# Frontend Tests

- Render ChooseActivityModal, click start -> mocks API called with 'speed_typing'
- LiveSessionShell receives ROUND_STARTED -> shows text + timer
- SpeedTypingPanel local metrics: wpm increases with speed; accuracy drops with errors
- Happy path E2E (Cypress):
  user A and B -> start -> both type -> scoreboard updates -> summary shows winner
