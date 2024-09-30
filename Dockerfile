# Use Node.js 18 Alpine image as the base
FROM node:18-alpine AS base

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy only the package.json and yarn.lock to install dependencies
COPY package.json yarn.lock* ./

# Install production dependencies only
RUN yarn install

# Copy Prisma schema and generate client
COPY /prisma ./prisma
RUN yarn prisma generate

# Copy the rest of the application code (excluding dev dependencies)
COPY . .

# Build the application if needed (e.g., if using TypeScript)
# RUN yarn build  # Uncomment this line if you have a build step

# Expose the application port (3000) and Prisma Studio port (5555)
EXPOSE 3000

# Start the application
CMD ["yarn", "start"]  
