# AI 팀 빌더

AI 에이전트로 만드는 크리에이티브 팀 빌딩 플랫폼입니다.

## 프로젝트 개요

이 프로젝트는 사용자가 각기 다른 개성과 역할을 가진 AI 에이전트들을 생성하고, 이들을 팀으로 구성하여 디자인 프로젝트에 대한 아이디어를 도출하는 실험용 웹 애플리케이션입니다.

## 주요 기능

- 🤖 **AI 에이전트 생성**: 이름, 나이, 성별, 성격, 가치관, 디자인 스타일을 가진 개성 있는 AI 에이전트 생성
- 👥 **팀 구성**: 생성된 에이전트들을 선택하고 역할을 부여하여 팀 구성
- 💬 **아이디어 도출**: 팀과의 대화를 통한 창의적인 디자인 아이디어 생성 (향후 구현 예정)
- 🔐 **사용자 인증**: NextAuth를 통한 안전한 로그인/회원가입

## 기술 스택

- **프레임워크**: Next.js 15 (App Router)
- **언어**: TypeScript
- **스타일링**: Tailwind CSS
- **데이터베이스**: Upstash Redis
- **인증**: NextAuth.js
- **UI 컴포넌트**: 커스텀 컴포넌트 (shadcn/ui 스타일)
- **아이콘**: Lucide React

## 설치 및 실행

### 1. 프로젝트 클론

```bash
git clone <repository-url>
cd teambuilder
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env.local.example` 파일을 참고하여 `.env.local` 파일을 생성하고 필요한 환경 변수를 설정하세요:

```bash
cp .env.local.example .env.local
```

필수 환경 변수:

- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST Token
- `NEXTAUTH_URL`: NextAuth URL (개발환경에서는 http://localhost:3000)
- `NEXTAUTH_SECRET`: NextAuth 시크릿 키

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 애플리케이션을 확인할 수 있습니다.

## 프로젝트 구조

```
src/
├── app/                      # Next.js App Router 페이지
│   ├── (auth)/              # 인증 관련 페이지
│   ├── api/                 # API 라우트
│   ├── dashboard/           # 대시보드 페이지
│   └── layout.tsx           # 루트 레이아웃
├── components/              # React 컴포넌트
│   ├── auth/               # 인증 관련 컴포넌트
│   ├── providers/          # Context Providers
│   └── ui/                 # 재사용 가능한 UI 컴포넌트
├── lib/                    # 유틸리티 및 설정
│   ├── auth.ts            # NextAuth 설정
│   ├── redis.ts           # Redis 클라이언트 및 데이터 함수
│   └── types.ts           # TypeScript 타입 정의
└── actions/               # Server Actions
    ├── agent.actions.ts   # 에이전트 관련 액션
    └── team.actions.ts    # 팀 관련 액션
```

## 주요 페이지

- `/` - 랜딩 페이지
- `/login` - 로그인 페이지
- `/sign-up` - 회원가입 페이지
- `/dashboard` - 대시보드 메인
- `/dashboard/agents` - 에이전트 목록
- `/dashboard/agents/new` - 새 에이전트 생성
- `/dashboard/teams` - 팀 목록
- `/dashboard/teams/new` - 새 팀 생성

## 데이터 모델

### User (사용자)

- id, email, name, createdAt

### AIAgent (AI 에이전트)

- id, ownerId, name, age, gender, personality, value, designStyle, createdAt

### Team (팀)

- id, ownerId, teamName, members, createdAt

### TeamMember (팀원)

- agentId, roles[]

### AgentRole (에이전트 역할)

- 아이디어 제안하기, 아이디어 디벨롭하기, 아이디어 평가하기, 아이디어 삭제하기, 논의하기, 피드백하기

## 향후 개발 계획

- [ ] OpenAI API 연동하여 실제 AI 채팅 기능 구현
- [ ] 팀별 대화 로그 저장 및 조회 기능
- [ ] 에이전트 및 팀 수정/삭제 기능
- [ ] 팀 성과 분석 및 통계 기능
- [ ] 실시간 협업 기능

## 라이선스

이 프로젝트는 실험용 프로젝트입니다.
