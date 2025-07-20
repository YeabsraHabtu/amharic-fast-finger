# Amharic Fast Finger ⌨️

A fast, modern typing speed test designed specifically for the Amharic language (Ge'ez script). Practice and benchmark your typing speed using phonetic Latin input combinations.

## Features

- **Accurate WPM & Accuracy Metrics**: Real-time calculation following standard typing test formulas (5 keystrokes per word).
- **Phonetic Key Hints**: Live Latin-to-Ge'ez hints under each word to help beginners learn the key combinations.
- **Normal & Advanced Modes**: Switch between everyday vocabulary and advanced mode containing numbers and punctuation.
- **Multi-Language UI**: Full localization in both Amharic (አማርኛ) and English.
- **Interactive Performance Analytics**:
  - Real-time speed graph (WPM, errors, and modifications over 60 seconds).
  - Detailed keystroke and consistency breakdown.
  - Interactive word-by-word speed heatmap.
- **Dark & Light Mode**: Clean, high-contrast themes tailored for comfortable practice.
- **User Accounts & History**: Track personal bests and progress over time.
- **Live User Tracking**: Real-time presence counter for active typists.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Database & ORM**: PostgreSQL with [Prisma](https://www.prisma.io/)
- **Authentication**: [NextAuth.js](https://next-auth.js.org/)
- **Styling**: Modern CSS Modules with CSS Variables
- **Containerization**: Docker Compose for local database management

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/your-username/amharic-fast-finger.git
cd amharic-fast-finger
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/amharic_typing_db"
NEXTAUTH_SECRET="your-secure-random-secret"
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Start Database & Run Migrations
```bash
docker-compose up -d
npx prisma db push
```

### 5. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## License

MIT License. Feel free to use, modify, and contribute!
