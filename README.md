# RSS Super Feed Admin

Multi-office, multi-service RSS aggregation system for AAAC Wildlife Removal.

## Stack
- Vite + React 18 + TypeScript + Tailwind CSS
- Convex (backend, database, cron)
- Cloudflare R2 + Workers + Pages

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Initialize Convex (first time only):
   ```bash
   npx convex dev
   ```
   Follow the prompts to create a Convex project. This creates `.env.local` with `VITE_CONVEX_URL`.

3. Start development:
   ```bash
   npm run dev
   ```
   In a separate terminal, keep Convex running:
   ```bash
   npx convex dev
   ```

4. Seed the database:
   ```bash
   npx convex run seed:seed
   ```

## Project Structure

```
src/           React admin UI
convex/        Convex backend (schema, queries, mutations, actions)
.prompts/      Meta-prompt chain for this build
```
