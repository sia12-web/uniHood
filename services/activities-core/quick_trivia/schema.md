# Prisma & DTOs

Prisma
model TriviaQuestion {
  id           String  @id @default(cuid())
  question     String
  optionsJson  Json    // string[4]
  correctIndex Int
  difficulty   String  // 'E' | 'M' | 'H'
  tagsJson     Json?   // string[]
  createdAt    DateTime @default(now())
}

DTOs
- CreateSessionDto { activityKey:'quick_trivia'; creatorUserId; participants:[string,string]; config?:{ rounds?:number, timeLimitMs?:number, difficulties?:('E'|'M'|'H')[] } }
- SubmitRoundDto { userId:string; choiceIndex: 0|1|2|3; clientMs?: number }
- RoundView { index, state, payload:{ qId:string, question:string, options:string[4], timeLimitMs:number } }
