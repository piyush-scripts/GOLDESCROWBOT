# GOLDESCROWBOT

## STEPS to Run Locally

- Docker
    - `docker-compose up --build`
    - For checking database `chmod +x docker-prisma.sh` only for first time
    - Then `./docker-prisma.sh`

- Locally
    - `yarn install` or `npm install`
    -  `npx prisma migrate dev && npx prisma generate`
    - `yarn dev` or `npm run dev`

- After that open telegram
    - Search for goldescrowbotdev
- Finished.