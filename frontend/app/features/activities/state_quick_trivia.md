# QuickTrivia State Extensions

- Session state machine now includes `activityKey` in context.
- On `ROUND_STARTED`, set payload.question, options, and timeLimitMs in state.
- On submit, disable inputs and wait for `ROUND_ENDED` before unlocking or showing results.
